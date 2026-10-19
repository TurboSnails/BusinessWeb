import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseHsiReportCsv, parseHsiReportMetadata, hsiReportUrl, collectHsiTurnover, HSI_REPORT_METADATA_URL, hsiCompletedWeekStart } from './market-cycle-hsi-turnover.mjs'
import { TURNOVER_URLS } from './market-cycle-liquidity.mjs'

function csv(date = '2026-10-16', amount = '80378', { index = 'Hang Seng Index 恒生指數', currency = 'HKD', duplicate = false } = {}) {
  const row = `"${date.replaceAll('-', '')}"\t"${index}"\t"${currency}"\t"${amount}"\t"178207"`
  return Buffer.concat([Buffer.from([255, 254]), Buffer.from(`"交易日"\r\n"Trade Date"\t"Index"\t"Index Currency"\t"Index Turnover (Mn)"\t"Market Turnover (Mn)"\r\n${row}\r\n${duplicate ? row : ''}`, 'utf16le')])
}
const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']
const metadata = dates => [{ seriesCode: 'hsi', reportList: [{ reportType: 'idx', reportDate: dates.map(date => ({ date, url: new URL(hsiReportUrl(date)).searchParams.get('resource') })) }] }]
const calendar = dates => ({ code: 0, data: { hkHSI: { qt: { hkHSI: Object.assign(Array(76).fill(''), { 2: 'HSI', 75: 'HKD' }) }, day: dates.map(date => [date, '1', '1', '1', '1', 'WHOLE-MARKET-AMOUNT-IGNORED']) } } })

test('Friday cannot select an unfinished week; weekend confirms the week that ended', () => {
  assert.equal(hsiCompletedWeekStart('2026-10-16'), '2026-10-05')
  assert.equal(hsiCompletedWeekStart('2026-10-17'), '2026-10-12')
  assert.equal(hsiCompletedWeekStart('2026-10-18'), '2026-10-12')
  assert.equal(hsiCompletedWeekStart('2026-10-19'), '2026-10-12')
})

test('takes actual HSI Index Turnover in HKD million, never Market Turnover', () => {
  assert.deepEqual(parseHsiReportCsv(csv(), '2026-10-16', hsiReportUrl('2026-10-16')), { date: '2026-10-16', amount: 80378000000, source: hsiReportUrl('2026-10-16') })
})

test('rejects wrong index/currency/date/blank turnover/duplicate rows and unsafe source', () => {
  for (const raw of [csv(undefined, undefined, { index: 'Hang Seng TECH Index' }), csv(undefined, undefined, { currency: 'USD' }), csv('2026-10-15'), csv(undefined, ''), csv(undefined, undefined, { duplicate: true })]) assert.throws(() => parseHsiReportCsv(raw, '2026-10-16', hsiReportUrl('2026-10-16')))
  assert.throws(() => parseHsiReportCsv(csv(), '2026-10-16', 'https://evil.test/idx_16Oct26.csv'), /来源/)
  assert.throws(() => parseHsiReportCsv(Buffer.from('not utf16'), '2026-10-16', hsiReportUrl('2026-10-16')), /UTF/)
})

test('validates report directory series, dates, paths and duplicate dates', () => {
  assert.equal(parseHsiReportMetadata({ data: metadata(days) }, '2026-10-19').length, 5)
  for (const mutate of [x => { x[0].seriesCode = 'hstech' }, x => { x[0].reportList[0].reportDate[0].url = '/public-website/webapp/contents/en/indexes/report/hstech/idx_12Oct26.csv' }, x => x[0].reportList[0].reportDate.push(x[0].reportList[0].reportDate[0])]) {
    const x = metadata(days); mutate(x)
    assert.throws(() => parseHsiReportMetadata(x, '2026-10-19'))
  }
  assert.throws(() => parseHsiReportMetadata(metadata(['2026-10-20']), '2026-10-19'), /日期|未来/)
})

test('collects only a complete real trading week and reuses persistent raw cache', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'hsi-turnover-test-'))
  try {
    let downloads = 0
    const ctx = { now: '2026-10-19T00:00:00.000Z', issue() {}, async get(url) {
      if (url === HSI_REPORT_METADATA_URL) return metadata(days)
      if (url === TURNOVER_URLS.hsi) return calendar(days)
      downloads++
      const date = days.find(d => hsiReportUrl(d) === url)
      return csv(date, String((days.indexOf(date) + 1) * 10000))
    } }
    const first = await collectHsiTurnover(ctx, { cacheDir })
    assert.equal(downloads, 5)
    assert.equal(first.length, 1)
    assert.equal(first[0].metricId, 'index_week_daily_turnover_hkd')
    assert.equal(first[0].value, 30000000000)
    assert.equal(first[0].frequency, 'weekly')
    assert.match(first[0].description, /2026-10-12~2026-10-18/)
    assert.match(first[0].description, /5个真实交易日/)
    for (const date of days) assert.ok(first[0].description.includes(hsiReportUrl(date)))
    const second = await collectHsiTurnover(ctx, { cacheDir })
    assert.equal(downloads, 5)
    assert.deepEqual(first, second)
  } finally { await rm(cacheDir, { recursive: true, force: true }) }
})

test('missing a reference trading date cannot produce a weekly amount or ratio', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'hsi-turnover-missing-'))
  try {
    const issues = []
    const facts = await collectHsiTurnover({ now: '2026-10-19T00:00:00Z', issue: e => issues.push(e), get: async url => url === HSI_REPORT_METADATA_URL ? metadata(days.slice(1)) : url === TURNOVER_URLS.hsi ? calendar(days) : csv(days.find(d => hsiReportUrl(d) === url)) }, { cacheDir })
    assert.deepEqual(facts, [])
    assert.ok(issues.some(s => /完整周|缺少/.test(s)))
  } finally { await rm(cacheDir, { recursive: true, force: true }) }
})

test('clamps file budget to 40, limits parallel downloads to 2 and resumes missing files', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'hsi-turnover-budget-'))
  try {
    let active = 0, peak = 0, downloads = 0
    const issues = []
    const ctx = { now: '2026-10-19T00:00:00Z', issue: s => issues.push(s), async get(url) {
      if (url === HSI_REPORT_METADATA_URL) return metadata(days)
      if (url === TURNOVER_URLS.hsi) return calendar(days)
      active++; peak = Math.max(peak, active); downloads++
      await new Promise(resolve => setTimeout(resolve, 2)); active--
      return csv(days.find(d => hsiReportUrl(d) === url))
    } }
    assert.deepEqual(await collectHsiTurnover(ctx, { cacheDir, budget: 3 }), [])
    assert.equal(downloads, 3)
    assert.equal((await collectHsiTurnover(ctx, { cacheDir, budget: 3 })).length, 1)
    assert.equal(downloads, 5)
    assert.ok(peak <= 2)
  } finally { await rm(cacheDir, { recursive: true, force: true }) }
})

test('never downloads more than 40 CSVs even when a larger budget is requested', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'hsi-turnover-cap-'))
  try {
    const dates = []
    for (let day = new Date('2026-08-03'); day <= new Date('2026-10-16'); day.setUTCDate(day.getUTCDate() + 1)) if ([1, 2, 3, 4, 5].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10))
    let requests = 0
    await collectHsiTurnover({ now: '2026-10-19T00:00:00Z', issue() {}, async get(url) {
      if (url === HSI_REPORT_METADATA_URL) return metadata(dates)
      if (url === TURNOVER_URLS.hsi) return calendar(dates)
      requests++
      return csv(dates.find(date => hsiReportUrl(date) === url))
    } }, { cacheDir, budget: 10000 })
    assert.equal(requests, 40)
  } finally { await rm(cacheDir, { recursive: true, force: true }) }
})

test('once the persistent archive contains 53 complete weeks it emits the true ratio', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'hsi-turnover-53weeks-'))
  try {
    const dates = []
    for (let day = new Date('2025-10-13'); day <= new Date('2026-10-16'); day.setUTCDate(day.getUTCDate() + 1)) if ([1, 2, 3, 4, 5].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10))
    for (const date of dates) await writeFile(join(cacheDir, `${date}.csv`), csv(date, date >= '2026-10-12' ? '200' : '100'))
    const facts = await collectHsiTurnover({ now: '2026-10-19T00:00:00Z', issue() {}, async get(url) {
      if (url === HSI_REPORT_METADATA_URL) return metadata(days)
      if (url === TURNOVER_URLS.hsi) return calendar(dates)
      throw new Error('No CSV re-download expected')
    } }, { cacheDir, budget: 0 })
    assert.equal(facts.length, 2)
    assert.equal(facts[1].metricId, 'turnover_ratio_52w')
    assert.equal(facts[1].value, 2)
    assert.equal(facts[1].market, 'hsi')
    assert.match(facts[1].description, /260个真实交易日/)
  } finally { await rm(cacheDir, { recursive: true, force: true }) }
})
