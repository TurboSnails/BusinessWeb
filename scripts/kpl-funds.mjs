// 开盘啦 · 资金：只用公开行情。任一接口异常则整批放弃，保留上一份文件。
// FORCE=1 只检查返回形状，不保存无日期排行，避免把午夜快照标成上一交易日。
import fs from 'node:fs'
import { buildSnapshot, collectionWindow, historyUrl, rankUrl } from './kpl-funds-lib.mjs'

const OUT = 'public/data/kpl-funds.json'
const RAW = 'data-raw/kpl-funds'
const window = collectionWindow()
const force = process.env.FORCE === '1'
async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://quote.eastmoney.com/' }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
async function main() {
  if (!window.ready && !force) { console.log(`${window.today} 非交易日或北京尚未到 15:10，跳过`); return }
  try {
    const entries = [['history', historyUrl], ['stockIn', rankUrl('stock', 'inflow')], ['stockOut', rankUrl('stock', 'outflow')], ['industryIn', rankUrl('industry', 'inflow')], ['industryOut', rankUrl('industry', 'outflow')]]
    const raw = Object.fromEntries(await Promise.all(entries.map(async ([key, url]) => [key, await get(url)])))
    const data = buildSnapshot(raw, window.date, new Date().toISOString())
    if (force) { console.log('FORCE 探测通过，未写入任何文件'); return }
    const end = collectionWindow()
    if (!end.ready || end.today !== window.today) throw new Error('采集跨交易日，放弃无日期排行')
    // 全量校验成功后才落盘；公开文件最后用 rename 原子替换。
    fs.mkdirSync(`${RAW}/days`, { recursive: true })
    fs.mkdirSync('public/data', { recursive: true })
    fs.writeFileSync(`${RAW}/days/${data.asOf}.json`, JSON.stringify({ ...raw, capturedAt: data.generatedAt }, null, 2) + '\n')
    fs.writeFileSync(`${RAW}/history.json`, JSON.stringify(data.history, null, 2) + '\n')
    fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(data, null, 2) + '\n')
    fs.renameSync(`${OUT}.tmp`, OUT)
    console.log(`资金数据已更新：${data.asOf}`)
  } catch (e) {
    // 不用无法验证日期、单位及历史口径的新浪数据拼接出半份结果。
    console.error(`资金采集失败，未发布数据：${e.message}`)
    process.exitCode = 1
  }
}
await main()
