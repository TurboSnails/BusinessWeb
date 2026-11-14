#!/usr/bin/env node
// 港股板块与恒生行业分类（HSICS）逐家核对：以港交所报价页同源数据（scripts/lib/hkex.mjs）为唯一来源。
//
// 用法：
//   node scripts/hk-hsics-sync.mjs [--as-of YYYY-MM-DD] [--out <evidence.json>] [--apply]
//   node scripts/hk-hsics-sync.mjs --input <evidence.json> [--apply]   # 用已留存证据重放（不触网）
//
// 口径：站点 sector 取 HSICS「业务类别」（第二层，hsic_ind_classification 中 ' - ' 之后的部分，如 旅游及消闲设施），
// 子业务类别（第三层，如 公共运输）只写进证据文件。有效板块 = hk.json sector 经 SECTOR_FIXES 纠正后的值（与 resolveMarket 一致）。
// --apply：把差异写进 src/data/sectorTaxonomy.ts 的 SECTOR_FIXES（'hk:<code>'，带来源注释）并同步 public/data/hk.json 的 sector；
// 每日行情流水线（normalize-market-refresh.py / collect-market-refresh.mjs apply-companies）不改 sector，故不会回退。
// 取不到 HSICS（停牌、新股、接口拒绝）的公司只列出，不改。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHkexClient, HKEX_QUOTE_PAGE } from './lib/hkex.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HK_JSON = resolve(ROOT, 'public/data/hk.json')
const TAXONOMY = resolve(ROOT, 'src/data/sectorTaxonomy.ts')

const args = process.argv.slice(2)
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const flag = name => args.includes(name)
const asOf = opt('--as-of') ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`--as-of 格式应为 YYYY-MM-DD：${asOf}`)
const out = resolve(ROOT, opt('--out') ?? `data-raw/hk-hsics-${asOf}/hsics.json`)
const input = opt('--input')

/** sectorTaxonomy.ts 中 SECTOR_FIXES 的 hk 条目 → { code: sector } */
export function readHkFixes(ts) {
  const block = /export const SECTOR_FIXES[^{]*\{([\s\S]*?)\n\}/.exec(ts)?.[1] ?? ''
  return Object.fromEntries([...block.matchAll(/'hk:(\d{5})':\s*'([^']+)'/g)].map(m => [m[1], m[2]]))
}

/** 在 SECTOR_FIXES 中写入/替换 'hk:<code>' 条目 */
export function upsertHkFix(ts, code, sector, note) {
  const line = `  'hk:${code}': '${sector}', // ${note}`
  const re = new RegExp(`^  'hk:${code}':.*$`, 'm')
  if (re.test(ts)) return ts.replace(re, line)
  return ts.replace(/(export const SECTOR_FIXES[^{]*\{[\s\S]*?)(\n\})/, `$1\n${line}$2`)
}

async function collect(companies) {
  const client = createHkexClient({ concurrency: 2, minIntervalMs: 800 })
  const rows = []
  for (const c of companies) {
    const sym = String(Number(c.code))
    const source = `${HKEX_QUOTE_PAGE}?sym=${sym}&sc_lang=zh-HK`
    try {
      const q = await client.getEquityQuote(c.code, { lang: 'chn' })
      rows.push({ code: c.code, name: c.name, hkexName: q.name, hsics: q.hsics, updateTime: q.updateTime, source })
    } catch (e) {
      rows.push({ code: c.code, name: c.name, hsics: null, error: `${e.code ?? ''} ${e.message}`.trim(), source })
    }
    process.stderr.write(`${c.code} ${rows.at(-1).hsics?.label ?? rows.at(-1).error}\n`)
  }
  return rows
}

async function main() {
  const companies = JSON.parse(readFileSync(HK_JSON, 'utf8'))
  let ts = readFileSync(TAXONOMY, 'utf8')
  const fixes = readHkFixes(ts)
  const evidence = input
    ? JSON.parse(readFileSync(resolve(ROOT, input), 'utf8'))
    : { asOf, source: 'HKEX 證券價格報價頁（恒生行業分類，恒生指數有限公司提供）', method: 'scripts/hk-hsics-sync.mjs → scripts/lib/hkex.mjs getequityquote lang=chn', rows: await collect(companies) }
  const byCode = new Map(evidence.rows.map(r => [r.code, r]))

  const diffs = [], same = [], missing = []
  for (const c of companies) {
    const current = fixes[c.code] ?? c.sector
    const r = byCode.get(c.code)
    const official = r?.hsics?.sector
    if (!official) { missing.push({ code: c.code, name: c.name, current, reason: r?.error ?? '无 HSICS 记录' }); continue }
    ;(official === current ? same : diffs).push({ code: c.code, name: c.name, current, official, label: r.hsics.label })
  }
  const report = { asOf: evidence.asOf, total: companies.length, matched: same.length, diffs, missing }

  if (!input) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, `${JSON.stringify({ ...evidence, report }, null, 2)}\n`)
    console.log(`证据：${out}`)
  }
  console.log(`共 ${report.total} 家：一致 ${report.matched}，差异 ${diffs.length}，未取到 ${missing.length}`)
  for (const d of diffs) console.log(`  差异 ${d.code} ${d.name}：${d.current} → ${d.official}（${d.label}）`)
  for (const m of missing) console.log(`  未取到 ${m.code} ${m.name}：${m.reason}`)

  if (flag('--apply') && diffs.length) {
    for (const d of diffs) ts = upsertHkFix(ts, d.code, d.official, `HSICS（港交所报价页 ${evidence.asOf}：${d.label}），原「${d.current}」`)
    writeFileSync(TAXONOMY, ts)
    const set = new Map(diffs.map(d => [d.code, d.official]))
    const next = companies.map(c => (set.has(c.code) ? { ...c, sector: set.get(c.code) } : c))
    writeFileSync(HK_JSON, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`已写入 ${diffs.length} 处：${TAXONOMY}、${HK_JSON}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1) })
