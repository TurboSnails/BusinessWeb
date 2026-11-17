// 第 ① 步：长历史（2011 年起）指数检验「择时＋只认金叉」。在 GitHub Actions 上运行（本机常被行情站限流）。
// 数据：中证指数官网全收益指数（含分红）作为被交易标的；择时用价格指数比值（沪深300÷中证红利、创业板指÷中证红利）。
// 全收益指数只有收盘价 → 信号次日收盘成交。规则来自 2019 年后的 ETF 数据，2011—2018 对它是真正的样本外。
// 输出：docs/research/etf-timing-long-history.md 与 data-raw/etf-timing-research/long-history.json。
import fs from 'node:fs'
import { ratioTiming, timingGold, macdOnly, ma20, windowStats } from './strategies.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TARGETS = ['H00300', 'H00905', 'H00852', 'H00016', 'H00922', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00991', 'H00992', 'H00993', 'H00994', 'H00995']
const WINDOWS = [
  ['全期 2011-01 起', '2011-01-01', null],
  ['2011—2018（规则未见过）', '2011-01-01', '2018-12-31'],
  ['2019 起（规则设计期）', '2019-01-01', null],
  ['2015 股灾 2015-06-12～2016-01-28', '2015-06-12', '2016-01-28'],
  ['2018 熊市 2018-01-24～2019-01-03', '2018-01-24', '2019-01-03'],
  ['2021—2024 下跌 2021-02-18～2024-02-05', '2021-02-18', '2024-02-05'],
]

async function csindex(code) {
  const rows = new Map()
  for (let y = 2004; y <= new Date().getFullYear(); y += 4) {
    const url = `https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=${code}&startDate=${y}0101&endDate=${y + 3}1231`
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const j = await (await fetch(url, { signal: AbortSignal.timeout(30000) })).json()
        for (const r of j.data || []) if (r.close > 0) rows.set(r.tradeDate, { date: `${r.tradeDate.slice(0, 4)}-${r.tradeDate.slice(4, 6)}-${r.tradeDate.slice(6)}`, close: r.close, name: r.indexNameCn })
        break
      } catch (e) { if (attempt === 2) throw new Error(`${code} ${y}: ${e.message}`); await sleep(5000) }
    }
    await sleep(1500)
  }
  const arr = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
  return { name: arr.at(-1)?.name ?? code, bars: arr.map(({ date, close }) => ({ date, open: close, high: close, low: close, close })) }
}
async function sinaIndex(symbol) {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=5000`
  const raw = await (await fetch(url, { signal: AbortSignal.timeout(30000) })).json()
  return raw.map((r) => ({ date: r.day, open: +r.open, high: +r.high, low: +r.low, close: +r.close }))
}

const hs300 = (await csindex('000300')).bars, div = (await csindex('000922')).bars, cyb = await sinaIndex('sz399006')
const tHs = ratioTiming(hs300, div), tCyb = ratioTiming(cyb, div)
const f1 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(1))
const results = []
for (const code of TARGETS) {
  let d
  try { d = await csindex(code) } catch (e) { results.push({ code, error: e.message }); continue }
  if (d.bars.length < 1500) { results.push({ code, error: 'too few ' + d.bars.length }); continue }
  const curves = {
    hold: d.bars.map((b) => b.close),
    hs: timingGold(d.bars, tHs, { fill: 'close' }).eq,
    cyb: timingGold(d.bars, tCyb, { fill: 'close' }).eq,
    macd: macdOnly(d.bars, { fill: 'close' }).eq,
    ma20: ma20(d.bars, { fill: 'close' }).eq,
  }
  const row = { code, name: d.name, start: d.bars[0].date, end: d.bars.at(-1).date, windows: {} }
  for (const [label, from, to] of WINDOWS) row.windows[label] = Object.fromEntries(Object.entries(curves).map(([k, eq]) => [k, windowStats(d.bars, eq, from, to)]))
  results.push(row)
}

// 验收：每段大跌窗口，择时最大回撤 ≤ 一直持有的 70%；全期年化 ≥ 一直持有 − 1 个百分点（扣费后）
const ok = results.filter((r) => !r.error)
const crash = WINDOWS.slice(3).map((w) => w[0])
const verdict = ok.map((r) => {
  const full = r.windows[WINDOWS[0][0]]
  const ddPass = crash.every((w) => { const x = r.windows[w]; return x.hs && x.hold && x.hs.dd >= 0.7 * x.hold.dd })
  return { code: r.code, name: r.name, ddPass, annualPass: full.hs.annual >= full.hold.annual - 1 }
})
const lines = []
lines.push('# 择时＋只认金叉 · 长历史指数检验（第 ① 步）', '')
lines.push(`生成：${new Date().toISOString().slice(0, 10)}（GitHub Actions，\`scripts/research/etf-strategy-oos/bt-index.mjs\`）。被交易标的为中证全收益指数（含分红），信号次日收盘成交，单边成本 0.1%。择时：沪深300÷中证红利、创业板指÷中证红利 价格比值高于 20 日线为牛。历史统计，不构成投资建议。`, '')
lines.push('验收标准（事先写定，见 [TODO](../TODO-投资工具优化.md)）：三段大跌里择时（沪深300 比值）最大回撤都不超过一直持有的 70%；全期扣费后年化不低于一直持有 −1 个百分点。', '')
lines.push(`通过：大跌回撤 ${verdict.filter((v) => v.ddPass).length}/${verdict.length}，全期年化 ${verdict.filter((v) => v.annualPass).length}/${verdict.length}，两项都过 ${verdict.filter((v) => v.ddPass && v.annualPass).length}/${verdict.length}。`, '')
for (const [label] of WINDOWS) {
  lines.push(`## ${label}`, '', '| 指数 | 持有 年化/回撤 | 沪深300择时 | 创业板择时 | MACD | 20日线 |', '|---|---|---|---|---|---|')
  for (const r of ok) {
    const w = r.windows[label]; const cell = (x) => (x ? `${f1(x.annual ?? x.total)} / ${f1(x.dd)}` : '—')
    lines.push(`| ${r.name}（${r.code}） | ${cell(w.hold)} | ${cell(w.hs)} | ${cell(w.cyb)} | ${cell(w.macd)} | ${cell(w.ma20)} |`)
  }
  lines.push('', label.includes('～') ? '大跌窗口不足一年，第一列为区间总收益%。' : '', '')
}
const errs = results.filter((r) => r.error)
if (errs.length) lines.push('## 取数失败', '', ...errs.map((e) => `- ${e.code}：${e.error}`), '')
fs.mkdirSync('data-raw/etf-timing-research', { recursive: true })
fs.writeFileSync('data-raw/etf-timing-research/long-history.json', JSON.stringify({ generatedAt: new Date().toISOString(), windows: WINDOWS, results, verdict }, null, 1))
fs.writeFileSync('docs/research/etf-timing-long-history.md', lines.join('\n'))
console.log(lines.slice(0, 8).join('\n'))
