// 生成美股/ADR/纳指公司的上市交易所表，供公司页 TradingView 走势图拼符号（NASDAQ:AAPL / NYSE:KO）。
// 来源：public/research/** 下 yfinance get_stock_info / get_multiple_tickers_info 原始返回里的 `exchange` 字段（Yahoo 交易所代码）。
// 不按研究分组（us/adr/ndx）猜交易所；查不到或代码无法对应时不写入，前端改用不带前缀的代码交给 TradingView 自行解析。
// 用法：node scripts/build-us-exchanges.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const RESEARCH = join(ROOT, 'public/research')
const OUT = join(ROOT, 'src/features/company-chart/usExchanges.json')

// Yahoo 交易所代码 → TradingView 交易所前缀
const YAHOO_TO_TV = { NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ', NYQ: 'NYSE', ASE: 'AMEX', PCX: 'AMEX' }

const walkFiles = dir => readdirSync(dir).flatMap(name => {
  const p = join(dir, name)
  return statSync(p).isDirectory() ? walkFiles(p) : p.endsWith('.json') ? [p] : []
})

/** symbol → { counts: {yahooCode: n}, files: Set } */
const seen = new Map()
const visit = (node, file) => {
  if (Array.isArray(node)) { node.forEach(v => visit(v, file)); return }
  if (!node || typeof node !== 'object') return
  if (typeof node.symbol === 'string' && typeof node.exchange === 'string') {
    const s = node.symbol
    // 只要美国上市代码：无后缀，或 BRK-B / BRK.B 这类类股
    if (/^[A-Z]{1,5}([.-][A-Z])?$/.test(s)) {
      const key = s.replace('-', '.')
      const rec = seen.get(key) ?? { counts: {}, files: new Set() }
      rec.counts[node.exchange] = (rec.counts[node.exchange] ?? 0) + 1
      rec.files.add(relative(ROOT, file))
      seen.set(key, rec)
    }
  }
  Object.values(node).forEach(v => visit(v, file))
}
for (const f of walkFiles(RESEARCH)) {
  let json
  try { json = JSON.parse(readFileSync(f, 'utf8')) } catch { continue }
  visit(json, f)
}

// 研究库的美股代码全集
const universe = new Set()
const snap = JSON.parse(readFileSync(join(ROOT, 'src/data/companyMarketSnapshot.json'), 'utf8'))
for (const k of Object.keys(snap)) {
  const [m, code] = k.split(':')
  if (m === 'us' || m === 'adr' || m === 'ndx') universe.add(code)
}
for (const m of ['us', 'adr']) {
  try { for (const c of JSON.parse(readFileSync(join(ROOT, `public/data/${m}.json`), 'utf8'))) universe.add(c.code) } catch { /* 可选 */ }
}
const ndxSrc = readFileSync(join(ROOT, 'src/data/ndx100.ts'), 'utf8')
const ndxBlock = ndxSrc.match(/NDX_CODES: string\[\] = \[([\s\S]*?)\]/)?.[1] ?? ''
for (const m of ndxBlock.matchAll(/'([A-Z.]+)'/g)) universe.add(m[1])

const map = {}
const unresolved = []
const conflicts = {}
for (const code of [...universe].sort()) {
  const rec = seen.get(code)
  if (!rec) { unresolved.push(code); continue }
  const ranked = Object.entries(rec.counts).sort((a, b) => b[1] - a[1])
  if (ranked.length > 1) conflicts[code] = rec.counts
  const tv = YAHOO_TO_TV[ranked[0][0]]
  if (tv) map[code] = tv
  else unresolved.push(code)
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'public/research/**（yfinance 原始返回的 exchange 字段，Yahoo 交易所代码映射为 TradingView 前缀）',
  mapping: YAHOO_TO_TV,
  note: '未列出的代码（unresolved）前端不加交易所前缀，由 TradingView 自行解析；多来源不一致时取出现次数最多者（conflicts）。',
  unresolved,
  conflicts,
  exchanges: map,
}
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`)
console.log(`exchanges: ${Object.keys(map).length}, unresolved: ${unresolved.length} ${unresolved.join(',')}, conflicts: ${Object.keys(conflicts).join(',')}`)
