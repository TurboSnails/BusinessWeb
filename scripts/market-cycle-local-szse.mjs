#!/usr/bin/env node
// 只在境内/家用网络运行：深交所（szse.cn）拒绝境外机房 IP，GitHub Actions 取不到
// 两市融资占比（cn-funding）与 A 股 52 周成交额基准（cn-turnover）。本脚本只跑这两个数据源，
// 合并进 public/data/market-cycle-auto.json（保留其他事实与提示），再重算周报。
// 由 scripts/szse-local-refresh.sh 每个工作日收盘后调用（macOS launchd），也可手动运行。
import { readFile } from 'node:fs/promises'
import { buildAutoSnapshot, SOURCES, OUT_FILE, writeAtomic } from './market-cycle-auto.mjs'
import { writeReport } from './market-cycle-report.mjs'

const IDS = ['cn-funding', 'cn-turnover']
const previous = JSON.parse(await readFile(OUT_FILE, 'utf8'))
const result = await buildAutoSnapshot(previous, { sources: SOURCES.filter(s => IDS.includes(s.id)) })
// 其他数据源这次没跑：保留它们原有的提示，只替换这两个源的提示
result.issues = [...previous.issues.filter(i => !IDS.some(id => i.startsWith(`${id}:`))), ...result.issues]
await writeAtomic(OUT_FILE, result)
for (const i of result.issues.filter(i => IDS.some(id => i.startsWith(`${id}:`)))) console.warn(`⚠ ${i}`)
const latest = id => result.facts.filter(f => f.metricId === id && f.market === 'csi300').map(f => f.observationDate).sort().at(-1)
console.log(`融资占比最新 ${latest('financing_buy_ratio_pct') ?? '—'}；52 周成交额基准最新 ${latest('turnover_ratio_52w') ?? '—'}`)
await writeReport()
