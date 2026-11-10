#!/usr/bin/env node
// 刷新标普500成分代理名单 + 圆桌研究快照报价。
// 成分来源：datasets/s-and-p-500-companies（维基同步维护的公开 CSV，非标普官方权重导出）。
// 圆桌快照：Yahoo 批量报价，只覆盖既有圆桌标的与 ^GSPC，不重写研究结论。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TODAY = process.env.SP500_ASOF || new Date().toISOString().slice(0, 10)
const CONSTITUENTS_CSV = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv'
const CONSTITUENTS_SOURCE = 'https://github.com/datasets/s-and-p-500-companies (Wikipedia-maintained public list; not S&P Dow Jones official weights)'
const ROUNDTABLE = ['ZTS', 'SPGI', 'PEP', 'MSFT', 'NVDA', 'ORCL', 'CVS', 'AES', 'CINF', 'OMC', 'UHS', '^GSPC']
const SNAP_FIELDS = [
  'regularMarketPrice', 'regularMarketTime', 'marketState', 'currency',
  'trailingEps', 'forwardEps', 'epsTrailingTwelveMonths', 'epsForward',
  'trailingPE', 'forwardPE', 'revenueGrowth', 'freeCashflow', 'mostRecentQuarter',
]

const outDir = join(ROOT, `public/research/data-refresh-${TODAY}/official`)
const membersOut = join(ROOT, 'public/data/sp500-members.json')
const membersModuleOut = join(ROOT, 'server/sp500Members.mjs')
const snapshotOut = join(ROOT, `public/data/sp500-review-snapshot-${TODAY}.json`)

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'BusinessWeb/sp500-refresh' }, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  const header = lines.shift().split(',')
  const symIdx = header.findIndex(h => /^symbol$/i.test(h.trim()))
  const nameIdx = header.findIndex(h => /^security$/i.test(h.trim()))
  const sectorIdx = header.findIndex(h => /gics sector/i.test(h.trim()))
  if (symIdx < 0) throw new Error('constituents.csv 缺少 Symbol 列')
  const rows = []
  for (const line of lines) {
    // 简易 CSV：字段内逗号用引号包住
    const cols = []
    let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { q = !q; continue }
      if (ch === ',' && !q) { cols.push(cur); cur = ''; continue }
      cur += ch
    }
    cols.push(cur)
    const symbol = cols[symIdx]?.trim()
    if (!symbol || !/^[A-Z][A-Z0-9.-]*$/.test(symbol)) continue
    rows.push({
      symbol,
      name: nameIdx >= 0 ? cols[nameIdx]?.trim() : undefined,
      sector: sectorIdx >= 0 ? cols[sectorIdx]?.trim() : undefined,
    })
  }
  return rows
}

async function yahooQuotes(symbols) {
  const out = {}
  for (let i = 0; i < symbols.length; i += 40) {
    const batch = symbols.slice(i, i + 40)
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch.map(encodeURIComponent).join(',')}`
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`Yahoo quote HTTP ${res.status}`)
    const body = await res.json()
    for (const q of body?.quoteResponse?.result ?? []) {
      const row = {}
      for (const k of SNAP_FIELDS) {
        const v = q[k] ?? (k === 'trailingEps' ? q.epsTrailingTwelveMonths : k === 'forwardEps' ? q.epsForward : undefined)
        if (v != null) row[k] = v
      }
      if (row.regularMarketPrice != null) out[q.symbol] = row
    }
  }
  return out
}

/** Yahoo 匿名会话常 401：回退本站行情快照 + 最近 yahoo-quote-batch + 指数收盘价。 */
async function localRoundtableQuotes(symbols) {
  const snap = JSON.parse(await readFile(join(ROOT, 'src/data/companyMarketSnapshot.json'), 'utf8'))
  const idx = JSON.parse(await readFile(join(ROOT, 'public/data/index-history.json'), 'utf8'))
  let yahoo = {}
  try {
    const dirs = (await import('node:fs')).readdirSync(join(ROOT, 'public/research'))
      .filter(n => n.startsWith('data-refresh-'))
      .sort()
      .reverse()
    for (const d of dirs) {
      const p = join(ROOT, 'public/research', d, 'yahoo-quote-batch.json')
      try { yahoo = JSON.parse(await readFile(p, 'utf8')).quotes || {}; break } catch { /* next */ }
    }
  } catch { /* optional */ }
  const out = {}
  for (const sym of symbols) {
    if (sym === '^GSPC') {
      const latest = idx.indexes?.spx?.latest
      if (!latest) continue
      out[sym] = {
        regularMarketPrice: latest.value,
        regularMarketTime: Math.floor(Date.parse(`${latest.date}T20:00:00Z`) / 1000),
        marketState: 'CLOSED',
        currency: 'USD',
      }
      continue
    }
    const s = snap[`us:${sym}`]
    const q = yahoo[sym] || {}
    const price = s?.price ?? q.regularMarketPrice
    if (!(price > 0)) continue
    const peT = q.trailingPE ?? s?.trailingPE
    const peF = q.forwardPE ?? s?.forwardPE
    const row = {
      regularMarketPrice: price,
      regularMarketTime: q.regularMarketTime,
      marketState: 'CLOSED',
      currency: s?.currency || q.currency || 'USD',
      trailingPE: peT,
      forwardPE: peF,
    }
    if (q.epsTrailingTwelveMonths != null) row.trailingEps = q.epsTrailingTwelveMonths
    else if (peT > 0) row.trailingEps = price / peT
    if (q.epsForward != null) row.forwardEps = q.epsForward
    else if (peF > 0) row.forwardEps = price / peF
    out[sym] = row
  }
  return { quotes: out, source: 'companyMarketSnapshot + yahoo-quote-batch + index-history spx' }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const csv = await fetchText(CONSTITUENTS_CSV)
  const rows = parseCsv(csv)
  if (rows.length < 480 || rows.length > 520) throw new Error(`成分数量异常：${rows.length}`)

  const checkedAt = new Date().toISOString()
  const membersDoc = {
    schemaVersion: 1,
    asOf: TODAY,
    checkedAt,
    status: 'public-list-proxy-verified',
    index: 'SPX',
    source: CONSTITUENTS_SOURCE,
    sourceUrl: CONSTITUENTS_CSV,
    securityCount: rows.length,
    companyCount: rows.length,
    reason: '公开维护的维基衍生成分表，用作标普500研究代理名单；不是 S&P Dow Jones Indices 官方权重导出。',
    symbols: rows.map(r => r.symbol).sort(),
    rows,
  }
  const evidencePath = join(outDir, `sp500-constituents-${TODAY}.json`)
  await writeFile(evidencePath, JSON.stringify(membersDoc, null, 2) + '\n')
  await writeFile(membersOut, JSON.stringify({
    schemaVersion: 1,
    asOf: membersDoc.asOf,
    checkedAt: membersDoc.checkedAt,
    status: membersDoc.status,
    source: membersDoc.source,
    evidence: `research/data-refresh-${TODAY}/official/sp500-constituents-${TODAY}.json`,
    securityCount: membersDoc.securityCount,
    symbols: membersDoc.symbols,
  }, null, 2) + '\n')

  const symbolsLiteral = membersDoc.symbols.map(s => JSON.stringify(s)).join(', ')
  await writeFile(membersModuleOut, `// 由 scripts/refresh-sp500-membership.mjs 生成；勿手改。asOf=${TODAY}
export const SPX_ASOF = ${JSON.stringify(TODAY)}
export const SPX_SOURCE = ${JSON.stringify(membersDoc.source)}
export const SPX_MEMBERS = [${symbolsLiteral}]
`)

  let quotes = {}
  let quoteSource = 'yfinance/yahoo v7 finance quote'
  try {
    quotes = await yahooQuotes(ROUNDTABLE)
  } catch (e) {
    const local = await localRoundtableQuotes(ROUNDTABLE)
    quotes = local.quotes
    quoteSource = `${local.source}（Yahoo 直连失败：${e instanceof Error ? e.message : e}）`
  }
  const missing = ROUNDTABLE.filter(s => !quotes[s])
  for (const q of Object.values(quotes)) {
    if (q.epsTrailingTwelveMonths != null && q.trailingEps == null) q.trailingEps = q.epsTrailingTwelveMonths
    if (q.epsForward != null && q.forwardEps == null) q.forwardEps = q.epsForward
  }
  const snapshot = {
    source: quoteSource,
    retrievalDate: TODAY,
    note: '供应商延迟/收盘报价；第三方财务字段未经统一期别复核，不用于替代公司公告。圆桌研究结论仍以 2026-09-30 报告为准；本文件只刷新价格锚点。',
    previousSnapshot: 'public/data/sp500-review-snapshot-2026-09-30.json',
    missing,
    snapshots: quotes,
  }
  await writeFile(snapshotOut, JSON.stringify(snapshot, null, 2) + '\n')

  // 研究池覆盖：us.json 有多少落在成分内
  let coverage = null
  try {
    const us = JSON.parse(await readFile(join(ROOT, 'public/data/us.json'), 'utf8'))
    const pool = new Set((Array.isArray(us) ? us : []).map(r => r.code || r.c).filter(Boolean))
    const hit = membersDoc.symbols.filter(s => pool.has(s))
    coverage = { poolSize: pool.size, constituents: membersDoc.securityCount, inPool: hit.length, missingFromPool: membersDoc.securityCount - hit.length }
  } catch { /* optional */ }

  console.log(JSON.stringify({
    asOf: TODAY,
    constituents: membersDoc.securityCount,
    evidence: evidencePath.replace(ROOT + '/', ''),
    members: membersOut.replace(ROOT + '/', ''),
    snapshot: snapshotOut.replace(ROOT + '/', ''),
    snapshotGot: Object.keys(quotes).length,
    missing,
    coverage,
  }, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
