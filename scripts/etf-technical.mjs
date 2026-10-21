#!/usr/bin/env node
// Run: node scripts/etf-technical.mjs [YYYY-MM-DD]
// Offline: node scripts/etf-technical.mjs YYYY-MM-DD --fixture /path/to/fixtures
// Each <code>.json: { bars: [{ date: 'YYYY-MM-DD', close: 1.23 }],
//                    priceSeries: 'qfqday' | 'day' | 'nav', name?: 'fund name' }
// Fixtures never access the network and write their marked artifact inside that directory.
// Tests: node --test scripts/etf-technical.test.mjs or npm run test:scripts.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { join, resolve } from 'node:path'
import { buildRecord, parseTencent, parseFundNav, validDate } from './lib/etf-technical.mjs'

export const methodology = {
  ma: 'SMA of last 5/10/20 daily, weekly or monthly closes; top-level also SMA60 daily. At least 20 bars for classification: Close>MA5>MA10>MA20=多头; reverse=空头; otherwise 震荡. Strict inequalities. return20SessionsPct=(close/close20 observations ago-1)*100; changePct uses previous observation.',
  macd: 'DIF=EMA12-EMA26; DEA=EMA9(DIF); histogram=2*(DIF-DEA). Price EMAs start at first close, DEA at first DIF (0). Publish after 26 bars, previousHistogram after 27; DIF>=DEA=偏多, otherwise 偏空. Compute using all fetched observations, without intermediate rounding.',
  rsi: 'Wilder RSI14: initial average gain/loss over first 14 changes, then (previous*13+current)/14. Needs 15 closes (previousRsi needs 16). No losses=100; no gains=0; flat=50. >=70 超买; <=30 超卖; otherwise 中性.',
  aggregation: 'Chronological daily closes, last actual observation per ISO Monday-Sunday week (ending Friday close) or calendar month; no forward filling. asOf is actual last observation, count is available period bars. complete requires period end <= requested asOf and retrieval after 15:00 Asia/Shanghai on end date; current unfinished week/month=false. Month ends on last calendar day; no holiday-calendar inference. Cutoff removes future observations. limited=true if any period indicator or previous value is unavailable; unavailable fields are null.',
  sources: 'Fresh direct requests only. ETFs: Tencent web.ifzq.gtimg.cn/appstock/app/fqkline/get, day from 2021-01-01 through cutoff, up to 640 bars; prefer qfqday, fallback to day. Historical cutoff uses provider current adjustment basis. Funds: fund.eastmoney.com/pingzhongdata/<code>.js Data_ACWorthTrend, published accumulated NAV (unit NAV plus cumulative distributions), NOT estimated NAV and NOT a compounded dividend-reinvestment total-return series. Daily indicators/returns for funds use this accumulated NAV basis throughout. navDate/asOf identify the latest published NAV valuation date; publication timestamp is not supplied by this endpoint. retrievedAt is actual fetch completion time. Top-level asOf is requested cutoff; record dates may lag it. Failures are errors, never substituted with cached data. Output stores indicators only, no raw K-lines.',
}

export async function buildUniverse() {
  const [industry, broad] = await Promise.all([
    readFile(new URL('../src/data/industryEtf.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/data/broadEtf.json', import.meta.url), 'utf8').then(JSON.parse),
  ])
  const result = [
    ...industry.flatMap(group => group.items.map(({ code, name }) => ({ code, name, kind: '行业', group: group.name }))),
    ...broad.map(({ code, name }) => ({ code, name, kind: '宽基', group: null })),
    ...[['512890', '红利低波ETF华泰柏瑞', '策略'], ['518880', '黄金ETF华安', '商品'], ['511880', '银华日利ETF', '货币']]
      .map(([code, name, kind]) => ({ code, name, kind, group: null })),
    ...['000015', '006337', '161716', '110017', '019372', '010011', '000143']
      .map(code => ({ code, name: code, kind: '债基', group: null })),
  ]
  if (result.length !== 79 || new Set(result.map(item => item.code)).size !== 79 || industry.flatMap(g => g.items).length !== 59 || broad.length !== 10) {
    throw new Error('Expected 59 industry + 10 preferred broad ETFs + 3 other ETFs + 7 bond funds, all unique')
  }
  return result
}

export async function requestText(url, { fetchImpl = fetch, retryDelayMs = 500 } = {}) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://fund.eastmoney.com/' },
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < 2) await delay(retryDelayMs * 2 ** attempt)
    }
  }
  throw new Error(`${url}: ${lastError.message}${lastError.cause ? ` (${lastError.cause.message})` : ''}`, { cause: lastError })
}

export async function fetchInstrument(instrument, cutoff, { request = requestText } = {}) {
  if (instrument.kind === '债基') {
    const sourceUrl = `https://fund.eastmoney.com/pingzhongdata/${instrument.code}.js`
    const result = parseFundNav(await request(sourceUrl), cutoff)
    if (!result.name) throw new Error('Published fund name missing')
    return { ...result, sourceUrl }
  }
  const symbol = `${instrument.code.startsWith('1') ? 'sz' : 'sh'}${instrument.code}`
  let sourceUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,2021-01-01,${cutoff},640,qfq`
  let payload = JSON.parse(await request(sourceUrl))
  const quote = payload.data?.[symbol]
  if ((payload.code == null || payload.code === 0) && !quote?.qfqday?.length && !quote?.day?.length) {
    sourceUrl = sourceUrl.replace(/,qfq$/, '')
    payload = JSON.parse(await request(sourceUrl))
  }
  return { ...parseTencent(payload, symbol, cutoff), sourceUrl }
}

async function readFixture(directory, instrument, cutoff) {
  if (!/^\d{6}$/.test(instrument.code)) throw new Error('Invalid fixture instrument code')
  const fixture = JSON.parse(await readFile(join(directory, `${instrument.code}.json`), 'utf8'))
  const allowed = instrument.kind === '债基' ? ['nav'] : ['qfqday', 'day']
  if (!allowed.includes(fixture.priceSeries)) throw new Error(`Invalid fixture priceSeries for ${instrument.code}`)
  // Normalize/validate fixtures in buildRecord, exactly as for a real provider result.
  if (!Array.isArray(fixture.bars)) throw new Error(`Missing fixture bars on/before ${cutoff}`)
  return { ...fixture, sourceUrl: `fixture:${instrument.code}.json` }
}

export async function generateDataset(asOf, { universe, load, fixtureDir } = {}) {
  if (!validDate(asOf)) throw new Error(`Invalid asOf: ${asOf}`)
  universe ??= await buildUniverse()
  if (fixtureDir && load) throw new Error('Choose fixtureDir or load, not both')
  load ??= fixtureDir ? item => readFixture(fixtureDir, item, asOf) : fetchInstrument
  const results = Array(universe.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, universe.length) }, async () => {
    while (cursor < universe.length) {
      const index = cursor++, item = universe[index]
      try {
        const fetched = await load(item, asOf)
        results[index] = { record: buildRecord(item, fetched, asOf, new Date().toISOString()) }
      } catch (error) {
        results[index] = { error: { code: item.code, name: item.name, kind: item.kind, reason: error.message, retrievedAt: new Date().toISOString() } }
      }
    }
  }))
  return {
    asOf,
    methodology: fixtureDir ? { ...methodology, sources: `OFFLINE FIXTURES: synthetic/local inputs, not freshly fetched market data. ${methodology.sources}` } : methodology,
    records: results.flatMap(r => r.record ? [r.record] : []),
    errors: results.flatMap(r => r.error ? [r.error] : []),
  }
}

const MIN_RECORDS = 70

async function main() {
  const args = process.argv.slice(2)
  let asOf, fixtureDir
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--fixture') {
      fixtureDir = args[++index]
      if (!fixtureDir || fixtureDir.startsWith('--')) throw new Error('--fixture requires a directory')
    } else if (!asOf && !args[index].startsWith('--')) asOf = args[index]
    else throw new Error(`Unexpected argument: ${args[index]}`)
  }
  asOf ??= new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const dataset = await generateDataset(asOf, { fixtureDir })
  // 线上只保留一份最新文件，历史靠 git；有效记录太少时不覆盖，避免接口故障把好数据冲掉
  const path = fixtureDir ? resolve(fixtureDir, `etf-technical-${asOf}.json`)
    : fileURLToPath(new URL('../public/data/etf-technical-latest.json', import.meta.url))
  if (!fixtureDir && dataset.records.length < MIN_RECORDS) {
    console.error(`有效记录 ${dataset.records.length}/79 低于 ${MIN_RECORDS}，保留原文件`)
    for (const error of dataset.errors) console.warn(`${error.code}: ${error.reason}`)
    process.exitCode = 1
    return
  }
  const text = JSON.stringify(dataset, null, 2) + '\n'
  await writeFile(path, text)
  console.log(`${path}: ${Buffer.byteLength(text)} bytes, ${dataset.records.length}/79 records, ${dataset.errors.length} errors`)
  for (const error of dataset.errors) console.warn(`${error.code}: ${error.reason}`)
  if (!dataset.records.length) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
