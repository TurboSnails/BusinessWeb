// 每日自动刷新后精简留存证据：只保留页面链接到的两份报价文件中可核对的字段，删除大体积中间文件。
// 自动目录写入 AUTO.txt 标记，超过 KEEP_DAYS 天的自动目录删除；手动全量刷新的目录不动。
// 用法：node scripts/slim-refresh-evidence.mjs YYYY-MM-DD
import { readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const KEEP_DAYS = 14
const date = process.argv[2]
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('用法：node scripts/slim-refresh-evidence.mjs YYYY-MM-DD')
const base = join(ROOT, 'public/research')
const dir = join(base, `data-refresh-${date}`)

// 逐条重复的请求 URL 只在文件顶层保留；逐条取回时间保留，页面数据与证据按它逐条核对
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] != null).map(k => [k, obj[k]]))
async function slim(name, transform) {
  const path = join(dir, name)
  if (!existsSync(path)) return
  await writeFile(path, JSON.stringify(transform(JSON.parse(await readFile(path, 'utf8')))) + '\n')
}

await slim('tencent-quotes.json', d => ({ ...d, quotes: Object.fromEntries(Object.entries(d.quotes ?? {}).map(([k, q]) => [k, pick(q, ['symbols', 'price', 'name', 'marketTime', 'retrievedAt', 'currency', 'error'])])) }))
await slim('etf-quotes.json', d => ({ ...d, quotes: Object.fromEntries(Object.entries(d.quotes ?? {}).map(([k, q]) => [k, pick(q, ['symbols', 'price', 'name', 'marketTime', 'retrievedAt', 'currency'])])) }))
await slim('yahoo-quote-batch.json', d => ({ ...d, quotes: Object.fromEntries(Object.entries(d.quotes ?? {}).map(([k, q]) => [k, pick(q, ['symbol', 'shortName', 'currency', 'regularMarketPrice', 'regularMarketTime', 'exchangeTimezoneName', 'trailingPE', 'forwardPE', 'fiftyTwoWeekLow', 'fiftyTwoWeekHigh', 'checkedAt'])])) }))
for (const name of ['company-universe.json', 'company-universe-after.json', 'changes.json', 'changes-initial.json', 'universe-symbols.json', 'macro-collected.json', 'indexes-collected.json']) await rm(join(dir, name), { force: true })
await writeFile(join(dir, 'AUTO.txt'), `每日自动行情刷新 ${date}；证据已精简，仅保留报价与汇总。保留 ${KEEP_DAYS} 天。\n`)

const cutoff = new Date(Date.parse(`${date}T00:00:00Z`) - KEEP_DAYS * 864e5).toISOString().slice(0, 10)
for (const name of await readdir(base)) {
  const m = name.match(/^data-refresh-(\d{4}-\d{2}-\d{2})$/)
  if (m && m[1] < cutoff && existsSync(join(base, name, 'AUTO.txt'))) await rm(join(base, name), { recursive: true, force: true })
}
console.log(`精简 ${dir}；清理 ${cutoff} 之前的自动目录`)
