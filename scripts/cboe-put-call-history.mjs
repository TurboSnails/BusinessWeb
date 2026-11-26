#!/usr/bin/env node
// 首次补建或修复 Cboe Put/Call 历史；日常更新仍由 macro-snapshot.mjs 追加最新日值。
// --prepend-archive：只把 Cboe 早期存档（1995-09 至 2006-10）按月末交易日补到现有 long 序列前面，不重抓近年日页面。
import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fetchCboePutCallDay, monthly, packPutCall, parseCboeArchiveCsv, parseCboeRatioCsv, US_SOURCE } from '../server/macro.mjs'

const FILE = fileURLToPath(new URL('../public/data/macro-us.json', import.meta.url))
const ARCHIVE = 'https://cdn.cboe.com/resources/options/volume_and_call_put_ratios/totalpc.csv'
// 早期存档：新的在后，同一天以后者为准（2003-10 至 2003-12 两份重叠，取带成交量校验的 totalpcarchive）
const EARLY = [
  'https://cdn.cboe.com/resources/options/volume_and_call_put_ratios/pcratioarchive.csv',
  'https://cdn.cboe.com/resources/options/volume_and_call_put_ratios/totalpcarchive.csv',
]
const iso = date => date.toISOString().slice(0, 10)

async function monthlyRecent() {
  const rows = []
  const now = new Date()
  const currentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  for (let cursor = Date.UTC(2019, 9, 1); cursor < currentMonth; cursor = Date.UTC(new Date(cursor).getUTCFullYear(), new Date(cursor).getUTCMonth() + 1, 1)) {
    const month = new Date(cursor)
    const day = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0))
    while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() - 1)
    let found = null
    for (let back = 0; back < 7 && !found; back++) {
      const row = await fetchCboePutCallDay(iso(day))
      if (row) found = [row.date, row.value]
      else day.setUTCDate(day.getUTCDate() - 1)
    }
    if (!found) throw new Error(`${iso(month).slice(0, 7)} 没有可得交易日`)
    rows.push(found)
    console.log(`${iso(month).slice(0, 7)} ${found[0]} ${found[1]}`)
  }
  return rows
}

async function earlyArchive() {
  const merged = new Map()
  for (const url of EARLY) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`Cboe 早期存档 ${url}: HTTP ${response.status}`)
    const rows = parseCboeArchiveCsv(await response.text())
    if (rows.length < 500) throw new Error(`Cboe 早期存档 ${url} 行数不足：${rows.length}`)
    for (const row of rows) merged.set(row[0], row)
  }
  return [...merged.values()].sort((a, b) => a[0].localeCompare(b[0]))
}

async function prependArchive(snapshot) {
  const current = snapshot.series.putCall
  const first = current.long[0][0].slice(0, 7)
  const early = monthly((await earlyArchive()).filter(([date]) => date.slice(0, 7) < first))
  if (!early.length) throw new Error('早期存档没有现有序列之前的月份')
  const putCall = { ...current, note: packPutCall([[current.latest.date, current.latest.value]]).note, long: [...early, ...current.long] }
  console.log(`补入 ${early.length} 个月（${early[0][0]} 至 ${early.at(-1)[0]}），long 共 ${putCall.long.length} 个月`)
  return putCall
}

async function main() {
  const snapshot = JSON.parse(await readFile(FILE, 'utf8'))
  if (process.argv.includes('--prepend-archive')) {
    const putCall = await prependArchive(snapshot)
    const temp = `${FILE}.${process.pid}.tmp`
    await writeFile(temp, `${JSON.stringify({ ...snapshot, series: { ...snapshot.series, putCall } })}\n`)
    await rename(temp, FILE)
    return
  }
  const archiveResponse = await fetch(ARCHIVE, { signal: AbortSignal.timeout(12_000) })
  if (!archiveResponse.ok) throw new Error(`Cboe archive: HTTP ${archiveResponse.status}`)
  const archive = parseCboeRatioCsv(await archiveResponse.text())
  if (archive.length < 3000) throw new Error('Cboe 历史档案覆盖不足，未写入')
  const recent = await monthlyRecent()
  const latest = await fetchCboePutCallDay()
  if (!latest) throw new Error('Cboe 最新日值尚未发布')
  const putCall = packPutCall([...archive, ...recent, [latest.date, latest.value]])
  const next = { ...snapshot, source: US_SOURCE, series: { ...snapshot.series, putCall } }
  const temp = `${FILE}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(next)}\n`)
  await rename(temp, FILE)
  console.log(`已写入 ${putCall.long.length} 个历史月份；最新 ${latest.date} = ${latest.value}`)
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
