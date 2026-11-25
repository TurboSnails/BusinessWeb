#!/usr/bin/env node
// 更新波动率目标影子读数 public/data/vol-target-shadow.json（只读本地日线缓存与 macro-posture.json，不联网）。
// 已冻结的月份不改动；若发现已有行被改写则失败退出。用法：node scripts/vol-target-shadow.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildShadow, frozenViolations } from './lib/vol-target-shadow.mjs'

const root = p => fileURLToPath(new URL(`../${p}`, import.meta.url))
const OUT = root('public/data/vol-target-shadow.json')
const closes = JSON.parse(readFileSync(root('data-raw/macro-posture-daily/spx-daily.json'), 'utf8')).rows
const macro = JSON.parse(readFileSync(root('public/data/macro-posture.json'), 'utf8'))
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
const today = new Date().toISOString().slice(0, 10)
const next = buildShadow({ previous, closes, liveRows: macro.backtest?.live?.rows ?? [], today, generatedAt: new Date().toISOString() })
const broken = frozenViolations(previous, next)
if (broken.length) {
  console.error(`已冻结的影子读数被改写：${broken.join('、')}，停止`)
  process.exit(1)
}
writeFileSync(OUT, JSON.stringify(next, null, 2) + '\n')
console.log(`影子读数：冻结 ${next.rows.length} 个月；当前 ${next.current?.date} k=${next.current?.k}`)
