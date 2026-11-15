// 中证指数官网公开接口取指数日线（含全收益指数 Hxxxxx），缓存到 $IDX_DIR（默认 ~/.businessweb-etf-oos/index）。
// 用法：node fetch-csindex.mjs <code...>
import fs from 'node:fs'
const dir = (process.env.IDX_DIR || process.env.HOME + '/.businessweb-etf-oos/index') + '/'
fs.mkdirSync(dir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const res = []
for (const code of process.argv.slice(2)) {
  const file = dir + code + '.json'
  try {
    const rows = new Map()
    for (let y = 2004; y <= 2026; y += 4) {
      const url = `https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=${code}&startDate=${y}0101&endDate=${y + 3}1231`
      const j = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json()
      for (const r of j.data || []) if (r.close > 0) rows.set(r.tradeDate, { date: `${r.tradeDate.slice(0, 4)}-${r.tradeDate.slice(4, 6)}-${r.tradeDate.slice(6)}`, close: r.close, name: r.indexNameCn })
      await sleep(700)
    }
    const arr = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
    if (arr.length < 500) throw new Error('too few ' + arr.length)
    const name = arr.at(-1).name
    fs.writeFileSync(file, JSON.stringify(arr.map(({ date, close }) => ({ date, open: close, high: close, low: close, close }))))
    res.push(`${code} ${name} ${arr[0].date}→${arr.at(-1).date} n=${arr.length}`)
  } catch (e) { res.push(`${code} FAIL ${e.message.slice(0, 60)}`) }
}
console.log(res.join('\n'))
