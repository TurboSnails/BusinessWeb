#!/usr/bin/env node
// 林奇输入生成器：从真实财报（scripts/fetch-lynch-financials.py 取回的原始表）重算
// g / c / rg / ph / dy / pb / m（六项护城河与证据文字）/ w / f，生成 lynch.json 条目。
// 类型 t 与关注度 r 先按原生成器口径给出，再由 rebuild-lynch-classification.mjs 按站内规则重判。
//
// 用法：
//   校验（与现有条目比对，不写 lynch.json）：
//     node scripts/build-lynch-inputs.mjs --raw DIR --keys-file keys.txt --cutoff 2026-07-31 --validate --report out.json
//   生成新条目：
//     node scripts/build-lynch-inputs.mjs --raw DIR --keys us:BRK.B,ndx:ALNY --emit new.json \
//       --quotes public/research/data-refresh-2026-11-13/yahoo-quote-batch.json --evidence research/lynch-inputs-2026-11-13
//   并入 lynch.json（默认只新增不存在的键；--replace 显式列出允许覆盖的键）：
//     node scripts/build-lynch-inputs.mjs --merge new.json [--replace cn:688256] [--input public/data/lynch.json] [--dry-run]
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeFinancials } from './lib/lynch-financials.mjs'
import { buildInputs, peerMedianIndex, CYCLICAL_W } from './lib/lynch-inputs.mjs'
import { classifyLynchAttention, attentionAssessment } from './lib/lynch-classify.mjs'
import { industryContextOf, loadCompanyIndustryIndex } from './lib/lynch-industry.mjs'
import { LYNCH_CYCLICAL_OVERRIDES } from './lib/lynch-overrides.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = n => args.includes(n)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const LYNCH = resolve(opt('--input') || join(ROOT, 'public/data/lynch.json'))
const AS_OF = process.env.LYNCH_ASOF || new Date().toISOString().slice(0, 10)

const SOURCE_ORDER = { us: ['em-us', 'sec', 'em-us-y', 'yf'], ndx: ['em-us', 'sec', 'em-us-y', 'yf'], adr: ['em-us', 'sec', 'em-us-y', 'yf'], cn: ['sina-cn', 'yf'], hk: ['em-hk', 'yf'] }
const SOURCE_LABEL = {
  'em-us': '东方财富美股单季指标（akshare stock_financial_us_analysis_indicator_em 单季报）',
  'em-us-y': '东方财富美股年报指标（akshare stock_financial_us_analysis_indicator_em 年报）',
  sec: 'SEC EDGAR XBRL companyfacts',
  'sina-cn': '新浪财经 A 股财务摘要（akshare stock_financial_abstract）',
  'em-hk': '东方财富港股财务指标（akshare stock_financial_hk_analysis_indicator_em 报告期+年度）',
  yf: 'yfinance 年报（第三方汇总，最后手段）',
}

async function loadKeys() {
  let keys = (opt('--keys') || '').split(',').map(s => s.trim()).filter(Boolean)
  if (opt('--keys-file')) keys = keys.concat((await readFile(opt('--keys-file'), 'utf8')).split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')))
  return keys
}

/** 同一公司可能以 us:/ndx:/adr: 文件名缓存，按顺序找 */
async function rawCandidates(dir, key) {
  const [market, code] = key.split(':')
  const files = new Set(await readdir(dir))
  const aliases = market === 'ndx' ? ['ndx', 'us', 'adr'] : market === 'us' || market === 'adr' ? [market, 'us', 'adr', 'ndx'] : [market]
  const out = []
  for (const src of SOURCE_ORDER[market] || []) {
    for (const a of aliases) {
      const f = `${a}-${code}.${src}.json`
      if (files.has(f)) { out.push(join(dir, f)); break }
    }
  }
  return out
}

function yahooSymbol(key) {
  const [market, code] = key.split(':')
  if (market === 'cn') return code + (/^(92|8|4)/.test(code) ? '.BJ' : /^[69]/.test(code) ? '.SS' : '.SZ')
  if (market === 'hk') return code.replace(/^0+/, '').padStart(4, '0') + '.HK'
  return code.replace('.', '-')
}

async function main() {
  const lynch = JSON.parse(await readFile(LYNCH, 'utf8'))
  if (flag('--merge')) return merge(lynch)

  const dir = resolve(opt('--raw') || '.')
  const keys = await loadKeys()
  const cutoff = opt('--cutoff') || AS_OF
  let industry = new Map()
  try { industry = await loadCompanyIndustryIndex(ROOT) } catch (e) { console.warn(`[warn] 行业索引加载失败：${e.message}`) }
  const peers = peerMedianIndex(lynch, k => industry.get(k))
  const quotes = opt('--quotes') ? JSON.parse(await readFile(resolve(opt('--quotes')), 'utf8')) : null
  const results = {}
  const skipped = {}

  for (const key of keys) {
    const [market] = key.split(':')
    const company = industry.get(key) || industry.get(`ndx:${key.split(':')[1]}`) || null
    const sector = company?.sector ?? null
    const ctx = industryContextOf(company)
    const override = LYNCH_CYCLICAL_OVERRIDES[key]
    const cyclical = flag('--validate') ? hasCyclicalText(lynch[key]) : override ? override[0] : ctx.cyclicalIndustry
    const peer = peers.lookup(market, sector)
    const q = quotes?.quotes?.[yahooSymbol(key)] ?? null
    const pbAllowed = market === 'cn' || market === 'hk' // 原数据只有 A 股/港股带 PB
    const pb = flag('--validate') ? lynch[key]?.pb ?? null : pbAllowed && q?.bookValue && q?.regularMarketPrice && q.currency === q.financialCurrency ? round2(q.regularMarketPrice / q.bookValue) : null
    const dy = market === 'hk' && q?.dividendYield != null ? round1(q.dividendYield) : null

    // 逐个来源算一遍：取三窗完整且最新窗口最近的来源；同样新时按 SOURCE_ORDER（与原数据同源的东方财富/新浪优先）
    const tried = []
    let chosen = null
    for (const file of await rawCandidates(dir, key)) {
      const raw = JSON.parse(await readFile(file, 'utf8'))
      const series = normalizeFinancials(raw)
      const inputs = buildInputs(series, { key, market, sector, batch: company?.batch, cutoff, peerMedian: peer.median, cyclical, pb })
      tried.push({ source: raw.source, basis: inputs.basis, windows: inputs.windowEnds, available: inputs.available })
      const cand = { raw, series, inputs, file }
      if (!chosen) { chosen = cand; continue }
      const a = chosen.inputs.windowEnds?.[0] ?? '', b = inputs.windowEnds?.[0] ?? ''
      // 同一最新窗口时，可评护城河项更多（营收/ROE/资产负债表更全）的来源优先
      const n = x => (x.inputs.m ? x.inputs.m.n : -1) + (x.inputs.rg != null ? 1 : 0)
      if (b > a || (b === a && n(cand) > n(chosen))) chosen = cand
    }
    if (!chosen) { skipped[key] = '无可用财报原始文件'; continue }
    results[key] = { ...chosen, tried, peer, sector, q, pb, dy }
  }

  if (flag('--validate')) return validate(lynch, results, skipped)
  if (opt('--emit')) {
    const out = {}
    for (const [key, r] of Object.entries(results)) out[key] = toEntry(key, r, { cutoff, evidence: opt('--evidence'), quotesPath: opt('--quotes') })
    await writeFile(resolve(opt('--emit')), JSON.stringify(out, null, 1) + '\n')
    const summary = Object.fromEntries(Object.entries(out).map(([k, e]) => [k, { t: e.t, r: e.r, g: e.g, c: e.c, rg: e.rg, ph: e.ph, pe: e.pe, moat: e.m ? `${e.m.s}/${e.m.n} ${e.m.l}` : null, period: e.financialPeriod, basis: e.inputBasis, source: e.inputSource }]))
    console.log(JSON.stringify({ emitted: Object.keys(out).length, skipped, summary }, null, 1))
  }
}

function hasCyclicalText(e) {
  return !!(e && ((e.w || []).some(x => x.includes(CYCLICAL_W)) || (e.f || []).some(x => x.includes('所属行业有周期属性'))))
}

function toEntry(key, r, { cutoff, evidence, quotesPath }) {
  const { inputs, raw, peer, q } = r
  const pe = q?.trailingPE != null ? q.trailingPE : null
  const base = {
    t: inputs.t0, r: null, pe,
    g: inputs.g, c: inputs.c, rg: inputs.rg, peg: null, ph: inputs.ph, dy: r.dy, pb: r.pb,
  }
  const r0 = inputs.r0 ?? classifyLynchAttention(inputs.t0, { ...base, r: null })
  base.r = r0
  const ends = inputs.windowEnds
  const basisText = !ends
    ? `可用${inputs.basis === 'fy' ? '财年' : '单季'}仅 ${inputs.available ?? 0} 期，不足三年窗口`
    : inputs.basis === 'fy'
      ? `三个财年窗口 ${ends.join('/')}（${inputs.profitMetric}）`
      : `三个 TTM 窗口截至 ${ends.join('/')}（${inputs.profitMetric}）`
  const currency = r.series.currency ? `，财报币种 ${r.series.currency}` : ''
  const std = r.series.standard ? `，口径 ${r.series.standard}` : ''
  const first = r.tried[0]
  const fallback = first && first.source !== r.raw.source ? `；首选源 ${first.source} ${first.windows ? `最新窗口 ${first.windows[0]} 较旧` : '三窗不全或已停更'}，改用 ${r.raw.source}` : ''
  const peNote = pe == null ? 'PE 行情字段缺失（供应商未给 trailingPE，常见于 TTM 亏损）' : `PE 行情字段于 ${q.checkedAt} 核验`
  const v = `增速、护城河与类型输入于 ${AS_OF} 由 scripts/build-lynch-inputs.mjs 按${SOURCE_LABEL[raw.source]}（取回 ${raw.retrievedAt}）重算：${basisText}${currency}${std}${fallback}；同行业毛利率中位取${peer.basis}；${peNote}。PEG待同口径盈利预测，不沿用旧值。`
  const evidencePath = evidence ? `${evidence.replace(/\/$/, '')}/${basename(r.file)}` : basename(r.file)
  const entry = {
    ...base,
    v,
    w: inputs.w, f: inputs.f, m: inputs.m,
    historicalAssessment: attentionAssessment(inputs.t0, r0, base),
    historicalPeg: null,
    peAsOf: q?.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString().slice(0, 10) : null,
    checkedAt: q?.checkedAt ?? null,
    classificationAsOf: AS_OF,
    financialPeriod: ends?.[0] ?? null,
    source: quotesPath ? quotesPath.replace(/^public\//, '') : null,
    inputSource: evidencePath,
    inputRetrievedAt: raw.retrievedAt,
    inputBasis: inputs.basis === 'fy' ? '财年窗口' : 'TTM 窗口',
    inputWindows: ends,
  }
  return entry
}

// ───────── 校验 ─────────

const parseNums = s => (String(s).match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) || []).map(Number)

function validate(lynch, results, skipped) {
  const rows = []
  const stat = {}
  const bump = (field, ok) => {
    if (ok == null) return
    stat[field] ??= { agree: 0, total: 0 }
    stat[field].total++
    if (ok) stat[field].agree++
  }
  for (const [key, r] of Object.entries(results)) {
    const old = lynch[key]
    if (!old) continue
    const gen = r.inputs
    const row = { key, t: old.t, source: r.raw.source, windows: gen.windowEnds, diffs: [] }
    const near = (a, b, tol) => (a == null && b == null ? true : a == null || b == null ? false : Math.abs(a - b) <= tol)
    if (!gen.windowEnds) { row.diffs.push('no-windows'); bump('windowsAvailable', false); rows.push(row); continue }
    bump('windowsAvailable', true)
    for (const [f, tol] of [['g', 2], ['c', 2], ['rg', 2]]) {
      const ok = near(old[f], gen[f], tol)
      bump(`${f} (±${tol}pt)`, ok)
      if (!ok) row.diffs.push(`${f}: ${old[f]} vs ${gen[f]}`)
    }
    const oi = Object.fromEntries((old.m?.i || []).map(x => [x[0], x]))
    const gi = Object.fromEntries(gen.m.i.map(x => [x[0], x]))
    for (const name of ['定价权', '毛利稳定', '资本回报', '盈利持续', '财务稳健', '需求韧性']) {
      const ok = (oi[name]?.[1] ?? null) === (gi[name]?.[1] ?? null)
      bump(`moat.${name}`, ok)
      if (!ok) row.diffs.push(`${name}: ${oi[name]?.[1]}「${oi[name]?.[2]}」 vs ${gi[name]?.[1]}「${gi[name]?.[2]}」`)
    }
    // 证据数值：毛利率 ±0.5pt、ROE ±2pt、利润 ±2%
    const gmO = parseNums(oi['定价权']?.[2])[0], gmG = parseNums(gi['定价权']?.[2])[0]
    if (gmO != null || gmG != null) bump('evidence.毛利率 (±0.5pt)', near(gmO, gmG, 0.5))
    const prO = parseNums(oi['盈利持续']?.[2]).slice(0, 3), prG = gen.profits || []
    if (prO.length === 3 && prG.length === 3) bump('evidence.三窗利润 (±2%)', prO.every((x, i) => prG[i] != null && Math.abs(x - prG[i]) <= Math.max(Math.abs(x) * 0.02, 0.011)))
    const roO = parseNums(oi['资本回报']?.[2]).slice(0, 3), roG = parseNums(gi['资本回报']?.[2]).slice(0, 3)
    if (roO.length === 3 || roG.length === 3) bump('evidence.ROE (±2pt)', roO.length === 3 && roG.length === 3 && roO.every((x, i) => Math.abs(x - roG[i]) <= 2))
    bump('moat.s', old.m?.s === gen.m.s)
    bump('moat.l', old.m?.l === gen.m.l)
    if (old.m?.s !== gen.m.s) row.diffs.push(`s: ${old.m?.s} vs ${gen.m.s}`)
    // 原生成器类型（只比未被站内规则改过类型的条目）与 w 首项类别
    if (!old.classificationAsOf) {
      const ok = old.t === gen.t0
      bump('t0 (未经规则重判的条目)', ok)
      if (!ok) row.diffs.push(`t0: ${old.t} vs ${gen.t0}（w: ${JSON.stringify(old.w)} vs ${JSON.stringify(gen.w)}）`)
    }
    if (old.ph != null && gen.ph != null) bump('ph (双方都有)', old.ph === gen.ph)
    const cat = s => String(s).replace(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g, '#')
    bump('w 文字模式', JSON.stringify((old.w || []).map(cat)) === JSON.stringify(gen.w.map(cat)))
    // f：只比可复现的类别
    const REPRO = /按财年窗口|最新中期|增速 >50%|增速 >80%|明显放缓|近四季 EPS|隐含股本|所属行业有周期属性/
    const fo = (old.f || []).filter(x => REPRO.test(x)).map(cat).sort(), fg = gen.f.filter(x => REPRO.test(x)).map(cat).sort()
    const fok = JSON.stringify(fo) === JSON.stringify(fg)
    bump('f 可复现类别', fok)
    if (!fok) row.diffs.push(`f: ${JSON.stringify(fo)} vs ${JSON.stringify(fg)}`)
    rows.push(row)
  }
  const table = Object.fromEntries(Object.entries(stat).map(([k, v]) => [k, `${v.agree}/${v.total} (${((v.agree / v.total) * 100).toFixed(0)}%)`]))
  const report = { asOf: AS_OF, cutoff: opt('--cutoff'), compared: rows.length, skipped, agreement: table, rows }
  if (opt('--report')) return writeFile(resolve(opt('--report')), JSON.stringify(report, null, 1) + '\n').then(() => console.log(JSON.stringify({ compared: rows.length, skipped, agreement: table }, null, 1)))
  console.log(JSON.stringify({ compared: rows.length, skipped, agreement: table }, null, 1))
}

// ───────── 合并 ─────────

async function merge(lynch) {
  const add = JSON.parse(await readFile(resolve(opt('--merge')), 'utf8'))
  const replace = new Set((opt('--replace') || '').split(',').map(s => s.trim()).filter(Boolean))
  const added = [], replaced = [], refused = []
  const out = { ...lynch }
  for (const [key, entry] of Object.entries(add)) {
    if (key in lynch && !replace.has(key)) { refused.push(key); continue }
    if (key in lynch) {
      // 保留人工字段（cyclical 显式纠错），其余由生成器输入替换
      const keep = typeof lynch[key].cyclical === 'boolean' ? { cyclical: lynch[key].cyclical } : {}
      const next = { ...entry, ...keep }
      const parts = []
      if (lynch[key].t !== entry.t) parts.push(`类型 ${lynch[key].t}→${entry.t}`)
      if (lynch[key].r !== entry.r) parts.push(`关注度 ${lynch[key].r}→${entry.r}`)
      if (parts.length) {
        next.classificationNote = `${AS_OF} 输入重算：${parts.join('；')}（增速/护城河按 build-lynch-inputs.mjs 用新财报重算后按站内规则判定）`
        next.v = `${next.v}${next.classificationNote}`
      }
      out[key] = next
      replaced.push(key)
    } else {
      out[key] = entry
      added.push(key)
    }
  }
  // 新键按字典序插入，保持文件稳定
  const sorted = Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]))
  const sameOrder = JSON.stringify(Object.keys(lynch)) === JSON.stringify(Object.keys(lynch).sort())
  const final = sameOrder ? sorted : out
  if (!flag('--dry-run')) await writeFile(LYNCH, JSON.stringify(final) + '\n', 'utf8')
  console.log(JSON.stringify({ dryRun: flag('--dry-run'), added, replaced, refused, total: Object.keys(final).length }, null, 1))
}

const round1 = n => Math.round(n * 10) / 10
const round2 = n => Math.round(n * 100) / 100

await main()
