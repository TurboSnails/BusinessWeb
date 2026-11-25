#!/usr/bin/env node
// 提交前检查：前推记录（macro-posture.json 的 backtest.live）只能追加。
// 已冻结的月末正式定档行，档位、仓位与判定依据不得改动；之后的收益只能从空值回填一次。
// 对比对象是 git HEAD 里的版本；不一致时退出码 1，让数据工作流失败而不提交。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE = 'public/data/macro-posture.json'
const RETURN_FIELDS = new Set(['spxReturn', 'portfolioReturn'])

export function compareLedger(previousRows = [], nextRows = []) {
  const errors = []
  const next = new Map(nextRows.map(row => [row.d, row]))
  for (const old of previousRows) {
    const row = next.get(old.d)
    if (!row) {
      errors.push(`${old.d}：前推记录被删除`)
      continue
    }
    if (old.status !== 'official') continue
    if (row.status !== 'official') {
      errors.push(`${old.d}：已冻结的正式定档变回了预估`)
      continue
    }
    const keys = new Set([...Object.keys(old), ...Object.keys(row)])
    for (const key of keys) {
      const before = JSON.stringify(old[key])
      const after = JSON.stringify(row[key])
      if (before === after) continue
      if (RETURN_FIELDS.has(key) && old[key] == null && Number.isFinite(row[key])) continue
      errors.push(`${old.d}：已冻结字段 ${key} 由 ${before} 改为 ${after}`)
    }
  }
  return errors
}

function headRows(root) {
  try {
    const body = execFileSync('git', ['show', `HEAD:${FILE}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return JSON.parse(body).backtest?.live?.rows ?? []
  } catch {
    return []
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const current = JSON.parse(readFileSync(resolve(root, FILE), 'utf8')).backtest?.live?.rows ?? []
  const errors = compareLedger(headRows(root), current)
  if (errors.length) {
    for (const line of errors) console.error(`::error::前推记录被改写：${line}`)
    process.exitCode = 1
  } else {
    const official = current.filter(row => row.status === 'official').length
    console.log(`前推记录正常：共 ${current.length} 行，其中正式定档 ${official} 行。`)
  }
}
