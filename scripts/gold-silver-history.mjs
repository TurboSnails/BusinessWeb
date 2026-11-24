#!/usr/bin/env node
// 一次性回补金银比 2000 年以前的月度历史：世界银行 Pink Sheet 月表（1960 年起的金、银月均价，CC BY 4.0），
// 写入 data-raw/market-radar/gold-silver-worldbank.json，只保留 Yahoo 日线开始（2000-08）之前的月份。
// 世界银行文件链接随每期发布变化，先从商品市场页找到当期的 CMO-Historical-Data-Monthly.xlsx。
import { fileURLToPath } from 'node:url'
import { unzipEntry } from './ths-etf-lib.mjs'
import { writeJsonIfChanged } from './lib/json-io.mjs'
import { parseWorldBankGoldSilver, WORLD_BANK_CMO } from './lib/market-radar/sources.mjs'

const OUTPUT = fileURLToPath(new URL('../data-raw/market-radar/gold-silver-worldbank.json', import.meta.url))
const HEADERS = { 'User-Agent': 'Mozilla/5.0' }
const UNTIL = '2000-08-31'

async function get(url) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`)
  return response
}

const page = await (await get(WORLD_BANK_CMO)).text()
const link = page.match(/https:\/\/[^"']*CMO-Historical-Data-Monthly\.xlsx/)?.[0]
if (!link) throw new Error('商品市场页没有找到月度历史文件链接')
const book = Buffer.from(await (await get(link)).arrayBuffer())
const workbook = unzipEntry(book, 'xl/workbook.xml')
const rels = unzipEntry(book, 'xl/_rels/workbook.xml.rels')
const rid = workbook.match(/<sheet [^>]*name="Monthly Prices"[^>]*r:id="([^"]+)"/)?.[1]
const target = rels.match(new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
  ?? rels.match(new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1]
if (!target) throw new Error('工作簿里没有 Monthly Prices 表')
const shared = [...unzipEntry(book, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map(([, si]) => si.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'))
const rows = parseWorldBankGoldSilver(unzipEntry(book, 'xl/' + target.replace(/^\/?xl\//, '')), shared)
  .filter(([d]) => d <= UNTIL)
if (rows[0]?.[0] !== '1960-01-31' || rows.at(-1)?.[0] !== UNTIL) throw new Error('世界银行金银月表覆盖不完整')
writeJsonIfChanged(OUTPUT, rows)
console.log(`金银比月度历史：${rows[0][0]} 至 ${rows.at(-1)[0]}，${rows.length} 个月（${link}）`)
