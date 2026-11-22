// Nasdaq 行情/分红下载（预注册 v2）→ data-raw/stock5-rebalance/
// 用法：STOCK5_FETCH_ALLOW=1 node scripts/stock5-rebalance-fetch.mjs
// 限流/本轮：manager 已落盘；默认拒绝执行，避免误请求外网。
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SYMBOLS = [
  { symbol: 'AVGO', assetclass: 'stocks' },
  { symbol: 'MSFT', assetclass: 'stocks' },
  { symbol: 'META', assetclass: 'stocks' },
  { symbol: 'SOFI', assetclass: 'stocks' },
  { symbol: 'RKLB', assetclass: 'stocks' },
  { symbol: 'QQQ', assetclass: 'etf' },
  { symbol: 'QQEW', assetclass: 'etf' },
]
export const FROM = '2021-07-01'
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'data-raw', 'stock5-rebalance')
const sleep = ms => new Promise(r => setTimeout(r, ms))

export function historicalUrl(symbol, assetclass, fromdate, todate) {
  const q = new URLSearchParams({ assetclass, fromdate, todate, limit: '9999' })
  return `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?${q}`
}

export function dividendsUrl(symbol, assetclass) {
  const q = new URLSearchParams({ assetclass })
  return `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/dividends?${q}`
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json,text/plain,*/*',
      Origin: 'https://www.nasdaq.com',
      Referer: 'https://www.nasdaq.com/',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

async function main() {
  const todate = new Date().toISOString().slice(0, 10)
  const downloadedAt = new Date().toISOString()
  await mkdir(outDir, { recursive: true })
  const lines = [
    '# stock5-rebalance 原始数据来源（Nasdaq v2）',
    '',
    `- 下载时间 (UTC ISO): ${downloadedAt}`,
    `- fromdate: ${FROM}`,
    `- todate: ${todate}`,
    `- 接口: api.nasdaq.com historical + dividends`,
    '',
  ]
  for (const { symbol, assetclass } of SYMBOLS) {
    const hUrl = historicalUrl(symbol, assetclass, FROM, todate)
    const dUrl = dividendsUrl(symbol, assetclass)
    const hText = await fetchText(hUrl)
    await sleep(400)
    const dText = await fetchText(dUrl)
    const hPath = join(outDir, `${symbol}.nasdaq.historical.json`)
    const dPath = join(outDir, `${symbol}.nasdaq.dividends.json`)
    await writeFile(hPath, hText.endsWith('\n') ? hText : `${hText}\n`, 'utf8')
    await writeFile(dPath, dText.endsWith('\n') ? dText : `${dText}\n`, 'utf8')
    lines.push(`## ${symbol}`)
    lines.push(`- historical URL: ${hUrl}`)
    lines.push(`- historical sha256: ${createHash('sha256').update(hText.endsWith('\n') ? hText : `${hText}\n`).digest('hex')}`)
    lines.push(`- dividends URL: ${dUrl}`)
    lines.push(`- dividends sha256: ${createHash('sha256').update(dText.endsWith('\n') ? dText : `${dText}\n`).digest('hex')}`)
    lines.push('')
    console.log(`${symbol}: hist=${hText.length} div=${dText.length}`)
    await sleep(400)
  }
  await writeFile(join(outDir, 'SOURCES.md'), `${lines.join('\n')}\n`, 'utf8')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.env.STOCK5_FETCH_ALLOW !== '1') {
    console.error('拒绝执行：默认不请求外网。授权后设 STOCK5_FETCH_ALLOW=1。')
    process.exit(3)
  }
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
