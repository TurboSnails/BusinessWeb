#!/usr/bin/env node
// 导出第二部分所需的输入：Ken French 49 行业（市值加权月收益、平均市值、公司数）与标普月末收盘。
// 下载地址与生产代码 scripts/lib/macro-posture-market/data.mjs 的 FRENCH_URL 相同。
// 用法：node docs/research/trend-overlay-2026-11-25/dump.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { unzipEntry } from '../../../scripts/ths-etf-lib.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const OUT = fileURLToPath(new URL('./inputs-industry.json', import.meta.url))
const FRENCH_URL = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_CSV.zip'

const zip = execFileSync('curl', ['-sS', '-L', '--http1.1', '-m', '120', FRENCH_URL], { maxBuffer: 64 * 1024 * 1024 })
const csv = unzipEntry(zip, '49_Industry_Portfolios.csv')
const lines = csv.split(/\r?\n/)

/** 取某个标题下的月度表：标题行之后一行为表头，随后是 YYYYMM 行，遇到非 YYYYMM 行结束 */
function table(title) {
  const start = lines.findIndex(line => line.trim() === title)
  if (start < 0) throw new Error(`找不到表：${title}`)
  const head = lines[start + 1].split(',').slice(1).map(s => s.trim())
  const rows = []
  for (const line of lines.slice(start + 2)) {
    const [ym, ...cells] = line.split(',')
    if (!/^\d{6}$/.test(ym?.trim() ?? '')) break
    rows.push([`${ym.trim().slice(0, 4)}-${ym.trim().slice(4)}`, cells.map(raw => {
      const v = Number(raw)
      return raw.trim() && Number.isFinite(v) && v > -99 ? v : null
    })])
  }
  return { head, rows }
}
const vw = table('Average Value Weighted Returns -- Monthly')
const firms = table('Number of Firms in Portfolios')
const size = table('Average Firm Size')
if (vw.head.length !== 49) throw new Error('行业列数异常')

// 标普月末收盘（站内每日行情）
const daily = JSON.parse(readFileSync(`${ROOT}public/data/macro-posture-daily.json`, 'utf8')).rows
const closes = new Map()
for (const [d, close] of daily) if (Number.isFinite(close)) closes.set(d.slice(0, 7), close)

writeFileSync(OUT, JSON.stringify({
  note: 'Ken French 49 行业：returns 为市值加权月收益（%），firms 为公司数，size 为平均市值（百万美元）；spxClose 为标普月末收盘。',
  source: FRENCH_URL,
  industries: vw.head,
  returns: vw.rows, firms: firms.rows, size: size.rows,
  spxClose: [...closes],
}))
console.log(`行业 ${vw.rows[0][0]} 至 ${vw.rows.at(-1)[0]}，${vw.rows.length} 个月；公司数 ${firms.rows.length}、市值 ${size.rows.length} 个月；标普月末收盘 ${closes.size} 个月（${[...closes.keys()][0]} 起）`)
