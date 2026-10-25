#!/usr/bin/env node
// 抓取 Ramp AI Index 最新一期，追加到 src/features/ai-token-economics/snapshots.json。
// 用法：npm run ai-token:update    （GitHub Action 每月 16 日自动运行；页面上也可手动刷新预览）
// 抓取或解析失败时不改动已有文件，并以非零状态退出，让 Action 报红而不是静默。
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fetchRampAiIndex, mergeSnapshot } from '../server/ramp-ai-index.mjs'

export const DATA_FILE = fileURLToPath(new URL('../src/features/ai-token-economics/snapshots.json', import.meta.url))

export async function updateSnapshots(fetchSnapshot = fetchRampAiIndex) {
  let history = []
  try { history = JSON.parse(await readFile(DATA_FILE, 'utf8')).snapshots } catch { /* 首次运行 */ }
  const snapshot = await fetchSnapshot()
  const next = mergeSnapshot(history, snapshot)
  await writeFile(DATA_FILE, JSON.stringify({ snapshots: next }, null, 2) + '\n')
  return { snapshot, count: next.length, added: next.length > history.length }
}

async function main() {
  const { snapshot, count, added } = await updateSnapshots()
  console.log(`${added ? '新增' : '更新'} ${snapshot.weekEnding} 一期，共 ${count} 期；用量 ${(snapshot.tokenUsage * 100).toFixed(1)}%，支出 ${(snapshot.tokenSpend * 100).toFixed(1)}%`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(`刷新失败：${e.message}`); process.exitCode = 1 })
