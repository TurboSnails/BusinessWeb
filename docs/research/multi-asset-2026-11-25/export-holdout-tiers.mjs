#!/usr/bin/env node
// 用生产打分代码（scripts/lib/macro-posture/model.mjs 的 evaluate）给 robustness 研究的留出读数定档，
// 导出 1959-09 至 1972-12 的 v2.2 档位，供锁箱 B-1 使用。先核对 1973 年以后 646/646 与页面一致。
// 用法：node docs/research/multi-asset-2026-11-25/export-holdout-tiers.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evaluate } from '../../../scripts/lib/macro-posture/model.mjs'

const here = p => fileURLToPath(new URL(p, import.meta.url))
const rob = JSON.parse(readFileSync(here('../robustness-2026-11-25/inputs.json'), 'utf8'))
const tierOf = f => evaluate({ components: f.components, tactical: { below: f.below } }).final.tier
const ok = rob.realtime.filter(f => tierOf(f) === f.pageFinal).length
if (ok !== rob.realtime.length) throw new Error(`打分复现 ${ok}/${rob.realtime.length}，停止`)
const tiers = rob.holdout.filter(f => f.d >= '1959-09' && f.d <= '1972-12').map(f => [f.d, tierOf(f)])
writeFileSync(here('./holdout-tiers.json'), JSON.stringify({ note: '生产 evaluate() 对 robustness 留出读数（修订后数据）定档；1973 年以后 646/646 与页面一致', tiers }, null, 1) + '\n')
console.log(`复现 ${ok}/${rob.realtime.length}；导出 ${tiers.length} 个月（${tiers[0][0]} 至 ${tiers.at(-1)[0]}）`)
