#!/usr/bin/env node
// 按站内林奇规则重算类型与同类关注度；增速/护城河输入仍冻结为原研究。
// 只改实际变化的条目与字段（见 lib/lynch-classify.mjs applyLynchReclassification），变化写入 classificationNote 并追加到 v。
//
// 用法：
//   node scripts/rebuild-lynch-classification.mjs                 写回 public/data/lynch.json
//   node scripts/rebuild-lynch-classification.mjs --dry-run       只打印汇总，不写文件
//   node scripts/rebuild-lynch-classification.mjs --dry-run --report out.json   另存变化明细
//   --no-industry   不加载公司行业上下文（只用生成器 w/f 标记与显式 cyclical 字段识别强周期）
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyLynchReclassification } from './lib/lynch-classify.mjs'
import { industryContextOf, loadCompanyIndustryIndex } from './lib/lynch-industry.mjs'
import { applyCyclicalOverride } from './lib/lynch-overrides.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = name => args.includes(name)
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const DRY = flag('--dry-run')
const PATH = resolve(opt('--input') || join(ROOT, 'public/data/lynch.json'))
const REPORT = opt('--report')
const AS_OF = process.env.LYNCH_ASOF || new Date().toISOString().slice(0, 10)

const raw = JSON.parse(await readFile(PATH, 'utf8'))
let industry = new Map()
if (!flag('--no-industry')) {
  try {
    industry = await loadCompanyIndustryIndex(ROOT)
  } catch (err) {
    console.warn(`[warn] 公司行业上下文加载失败，仅用 w/f 标记识别强周期：${err.message}`)
  }
}

const dist = () => ({ before: {}, after: {} })
const typeDist = dist()
const attnDist = dist()
const bump = (o, k) => { o[k] = (o[k] || 0) + 1 }
const changes = []
const out = {}

for (const [key, entry] of Object.entries(raw)) {
  const company = industry.get(key)
  // 人工强周期纠错（lib/lynch-overrides.mjs）先写入条目，再按规则重判
  const next = applyLynchReclassification(applyCyclicalOverride(key, entry), { asOf: AS_OF, ctx: industryContextOf(company) })
  bump(typeDist.before, entry.t); bump(typeDist.after, next.t)
  bump(attnDist.before, entry.r); bump(attnDist.after, next.r)
  const fields = Object.keys({ ...entry, ...next }).filter(k => JSON.stringify(entry[k]) !== JSON.stringify(next[k]))
  if (fields.length) {
    changes.push({
      key, sector: company?.sector ?? null, batch: company?.batch ?? null,
      t: [entry.t, next.t], r: [entry.r, next.r], pe: entry.pe ?? null, g: entry.g ?? null, c: entry.c ?? null, rg: entry.rg ?? null,
      fields, note: next.classificationNote ?? null,
    })
  }
  out[key] = fields.length ? next : entry
}

const trans = (field) => {
  const t = {}
  for (const c of changes) if (c[field][0] !== c[field][1]) bump(t, `${c[field][0]}→${c[field][1]}`)
  return Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1]))
}
const summary = {
  asOf: AS_OF,
  dryRun: DRY,
  total: Object.keys(raw).length,
  industryContext: industry.size,
  changedEntries: changes.length,
  typeChanged: changes.filter(c => c.t[0] !== c.t[1]).length,
  attentionChanged: changes.filter(c => c.r[0] !== c.r[1]).length,
  typeTransitions: trans('t'),
  attentionTransitions: trans('r'),
  typeDist,
  attnDist,
}

if (REPORT) await writeFile(resolve(REPORT), JSON.stringify({ summary, changes }, null, 1) + '\n', 'utf8')
if (!DRY && changes.length) await writeFile(PATH, JSON.stringify(out) + '\n', 'utf8')
console.log(JSON.stringify(summary, null, 2))
if (!DRY && !changes.length) console.log('无变化，未写文件')
