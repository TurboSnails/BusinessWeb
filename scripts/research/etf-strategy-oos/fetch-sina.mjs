// 新浪日线（不复权）→ 检测拆分/合并（隔夜跳空超过 ±25% 且与前后走势不连贯）并按比例前复权；分红未调整。
// 用法：BARS_DIR=<目录> node fetch-sina.mjs <code...>   （Ashare 库在腾讯不可用时也回落到同一新浪接口）
import fs from 'node:fs'
const dir = (process.env.BARS_DIR || process.env.HOME + '/.businessweb-etf-oos/bars-sina') + '/'
fs.mkdirSync(dir, { recursive: true })
const sym = (c) => (/^(5|6)/.test(c) ? 'sh' : 'sz') + c
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = { ok: [], fail: [], splits: {} }
for (const c of process.argv.slice(2)) {
  const file = dir + c + '.json'
  if (fs.existsSync(file)) { out.ok.push(c); continue }
  try {
    const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sym(c)}&scale=240&ma=no&datalen=5000`
    const raw = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json()
    let bars = raw.map((r) => ({ date: r.day, open: +r.open, high: +r.high, low: +r.low, close: +r.close })).filter((b) => b.open > 0 && b.close > 0)
    if (bars.length < 300) throw new Error('too few ' + bars.length)
    // 从后往前累积拆分因子：open[i] / close[i-1] 偏离超过 25% 视为份额拆分/合并
    let factor = 1; const found = []
    for (let i = bars.length - 1; i > 0; i--) {
      const r = bars[i].open / bars[i - 1].close
      bars[i] = { ...bars[i], f: factor }
      if (r < 0.75 || r > 1.33) { factor *= r; found.push(`${bars[i].date}×${r.toFixed(3)}`) }
    }
    bars[0] = { ...bars[0], f: factor }
    bars = bars.map(({ f, ...b }) => ({ date: b.date, open: b.open * f, high: b.high * f, low: b.low * f, close: b.close * f }))
    if (found.length) out.splits[c] = found
    fs.writeFileSync(file, JSON.stringify(bars)); out.ok.push(c)
  } catch (e) { out.fail.push(c + ':' + e.message.slice(0, 50)) }
  await sleep(1500)
}
console.log(JSON.stringify({ ok: out.ok.length, fail: out.fail, splits: out.splits }))
