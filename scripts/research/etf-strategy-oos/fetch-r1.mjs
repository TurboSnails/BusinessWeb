// R1/KD10 补充检验取数：中证官网（价格指数带 OHLC，全收益指数只有收盘）与新浪创业板指/创业板50，缓存到 $R1_DIR（默认 ~/.businessweb-etf-oos/r1）。
// 每次请求间隔数秒；已有缓存跳过。用法：node fetch-r1.mjs
import fs from 'node:fs'
const dir = (process.env.R1_DIR || process.env.HOME + '/.businessweb-etf-oos/r1') + '/'
fs.mkdirSync(dir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const CSI_CODES = ['H30269', 'H20269', '000300', '000922', 'H00300', 'H00905', 'H00852', 'H00016', 'H00922', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00991', 'H00992', 'H00993', 'H00994', 'H00995']
for (const code of CSI_CODES) {
  const f = dir + code + '.json'; if (fs.existsSync(f)) continue
  try {
    const j = await (await fetch(`https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=${code}&startDate=20040101&endDate=${new Date().getFullYear()}1231`, { signal: AbortSignal.timeout(30000) })).json()
    const arr = (j.data || []).filter((r) => r.close > 0).map((r) => ({ date: `${r.tradeDate.slice(0, 4)}-${r.tradeDate.slice(4, 6)}-${r.tradeDate.slice(6)}`, open: +r.open || r.close, high: +r.high || r.close, low: +r.low || r.close, close: r.close, name: r.indexNameCn })).sort((a, b) => a.date.localeCompare(b.date))
    fs.writeFileSync(f, JSON.stringify(arr)); console.log(code, arr.at(-1)?.name, arr.length)
  } catch (e) { console.log(code, 'FAIL', e.message) }
  await sleep(4000)
}
for (const s of ['sz399006', 'sz399673']) {
  const f = dir + s + '.json'; if (fs.existsSync(f)) continue
  const raw = await (await fetch(`https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${s}&scale=240&ma=no&datalen=5000`, { signal: AbortSignal.timeout(30000) })).json()
  const arr = raw.map((r) => ({ date: r.day, open: +r.open, high: +r.high, low: +r.low, close: +r.close }))
  fs.writeFileSync(f, JSON.stringify(arr)); console.log(s, arr.length); await sleep(3000)
}
