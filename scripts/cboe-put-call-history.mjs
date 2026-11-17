#!/usr/bin/env node
// 首次补建或修复 Cboe Put/Call 历史；日常更新仍由 macro-snapshot.mjs 追加最新日值。
import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fetchCboePutCallDay, packPutCall, parseCboeRatioCsv, US_SOURCE } from '../server/macro.mjs'

const FILE = fileURLToPath(new URL('../public/data/macro-us.json', import.meta.url))
const ARCHIVE = 'https://cdn.cboe.com/resources/options/volume_and_call_put_ratios/totalpc.csv'
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

async function main() {
  const snapshot = JSON.parse(await readFile(FILE, 'utf8'))
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
