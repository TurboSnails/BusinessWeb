// 取 ETF 前复权日线（腾讯 fqkline），缓存到 $BARS_DIR（默认 ~/.businessweb-etf-oos/bars）。
// 用法：FRIEND_REPO=<朋友仓库路径> node fetch.mjs；遇到腾讯 WAF 返回 HTML 时停手稍后重跑，不绕过。
import fs from 'node:fs'
const FR = (process.env.FRIEND_REPO || '') + '/src/data/'
const dir = (process.env.BARS_DIR || process.env.HOME + '/.businessweb-etf-oos/bars') + '/'
fs.mkdirSync(dir, { recursive: true })
const codes = new Set(['510300', '510880', '159915'])
const collect = (x) => { if (Array.isArray(x)) x.forEach(collect); else if (x && typeof x === 'object') { for (const [k, v] of Object.entries(x)) { if (k === 'code' && typeof v === 'string' && /^\d{6}$/.test(v)) codes.add(v); else collect(v) } } }
for (const f of ['industryEtf.json', 'strategyAssetEtf.json', 'etfMacdGood.json', 'etfHs300Timing.json', 'etfReviewResearch.json']) { try { collect(JSON.parse(fs.readFileSync(FR + f, 'utf8'))) } catch (e) { console.error('skip', f, e.message) } }
const sym = (c) => (/^(5|6)/.test(c) ? 'sh' : 'sz') + c
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ok = 0
const fail = []
for (const c of codes) {
  const out = dir + c + '.json'
  if (fs.existsSync(out)) { ok++; continue }
  const bars = new Map()
  try {
    for (let y = 2005; y <= 2026; y += 3) {
      const host = y % 2 ? "https://proxy.finance.qq.com/ifzqgtimg" : "https://web.ifzq.gtimg.cn"
      const url = `${host}/appstock/app/fqkline/get?param=${sym(c)},day,${y}-01-01,${y + 2}-12-31,1000,qfq`
      const j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json()
      const d = j?.data?.[sym(c)]; const rows = d?.qfqday || d?.day || []
      for (const r of rows) bars.set(r[0], { date: r[0], open: +r[1], close: +r[2], high: +r[3], low: +r[4] })
      await sleep(900)
    }
    const arr = [...bars.values()].sort((a, b) => a.date.localeCompare(b.date)).filter((b) => b.open > 0 && b.close > 0)
    if (arr.length < 300) throw new Error('too few ' + arr.length)
    fs.writeFileSync(out, JSON.stringify(arr)); ok++
  } catch (e) { fail.push(c + ':' + e.message) }
}
console.log('codes', codes.size, 'ok', ok, 'fail', fail.length, fail.slice(0, 10))
