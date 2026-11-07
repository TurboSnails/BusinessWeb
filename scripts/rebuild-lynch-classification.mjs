#!/usr/bin/env node
// 按站内林奇规则重算类型与同类关注度；增速/护城河输入仍冻结为原研究。
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyLynchReclassification } from './lib/lynch-classify.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PATH = join(ROOT, 'public/data/lynch.json')
const AS_OF = process.env.LYNCH_ASOF || new Date().toISOString().slice(0, 10)

const raw = JSON.parse(await readFile(PATH, 'utf8'))
const out = {}
const counts = { typeChanged: 0, attentionChanged: 0, pegFilled: 0 }
const typeDist = {}
const attnDist = {}

for (const [key, entry] of Object.entries(raw)) {
  const next = applyLynchReclassification(entry, { asOf: AS_OF, source: entry.source })
  if (next.t !== entry.t) counts.typeChanged++
  if (next.r !== entry.r) counts.attentionChanged++
  if (next.peg != null && entry.peg == null) counts.pegFilled++
  typeDist[next.t] = (typeDist[next.t] || 0) + 1
  attnDist[next.r] = (attnDist[next.r] || 0) + 1
  out[key] = next
}

await writeFile(PATH, JSON.stringify(out) + '\n', 'utf8')
console.log(JSON.stringify({
  asOf: AS_OF,
  total: Object.keys(out).length,
  ...counts,
  typeDist,
  attnDist,
  note: '增速/护城河未按新报表重取；困境/周期/资产类型在缺序列时保留原值',
}, null, 2))
