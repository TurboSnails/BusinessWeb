// 东财 push2his 指数日线（价格指数，无全收益）。只记录覆盖起止，原始响应写入 OUT/em-*.json，追加 manifest-em.json。
import fs from 'node:fs'
import crypto from 'node:crypto'
const OUT = process.argv[2]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ids = process.argv.slice(3)
const man = []
for (const s of ids) {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${s}&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101`
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) })
  const buf = Buffer.from(await res.arrayBuffer())
  const file = `em-${s}.json`
  fs.writeFileSync(`${OUT}/${file}`, buf)
  let rows = null, start = null, end = null, name = null
  try { const j = JSON.parse(buf.toString()); const k = j.data?.klines ?? []; rows = k.length; start = k[0]?.slice(0, 10) ?? null; end = k.at(-1)?.slice(0, 10) ?? null; name = j.data?.name ?? null } catch {}
  man.push({ file, url, fetchedAt: new Date().toISOString(), http: res.status, bytes: buf.length, name, rows, start, end, sha256: crypto.createHash('sha256').update(buf).digest('hex') })
  await sleep(2500)
}
fs.writeFileSync(`${OUT}/manifest-em.json`, JSON.stringify(man, null, 1))
console.log(man.map((m) => `${m.file} ${m.http} ${m.name} rows=${m.rows} ${m.start}→${m.end}`).join('\n'))
