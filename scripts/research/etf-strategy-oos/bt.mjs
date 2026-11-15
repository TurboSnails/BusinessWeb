// 样本外检验：复现朋友仓库的三套 ETF 规则，按切分点之前的数据选 ETF，冻结名单，看切分点之后。
// 用法：FRIEND_REPO=<路径> [BARS_DIR=...] SPLIT=2023-01-01 node bt.mjs
// 说明见 docs/research/2026-11-15-friend-etf-strategies-oos.md。历史统计，不构成投资建议。
import fs from 'node:fs'
const dir = (process.env.BARS_DIR || process.env.HOME + '/.businessweb-etf-oos/bars') + '/'
const load = (c) => JSON.parse(fs.readFileSync(dir + c + '.json', 'utf8'))
const COST = 0.001
const SPLIT = process.env.SPLIT || '2023-01-01'

function macdCross(bars) {
  const gold = [], dead = []; let f = bars[0].close, s = f, dea = 0, prev
  for (let i = 0; i < bars.length; i++) {
    if (i) { f += 2 / 13 * (bars[i].close - f); s += 2 / 27 * (bars[i].close - s) }
    const dif = f - s; dea += 0.2 * (dif - dea)
    gold.push(!!prev && prev[0] <= prev[1] && dif > dea); dead.push(!!prev && prev[0] >= prev[1] && dif < dea); prev = [dif, dea]
  }
  return { gold, dead }
}
// 择时：a/b 收盘比值高于其 20 日均线为牛；缺数据为 undefined
function timing(aCode, bCode) {
  const a = new Map(load(aCode).map((x) => [x.date, x.close])), b = load(bCode)
  const out = new Map(); const q = []
  for (const x of b) { const av = a.get(x.date); if (!av) continue; const r = av / x.close; q.push(r); if (q.length > 20) q.shift(); if (q.length === 20) out.set(x.date, r > q.reduce((s, v) => s + v, 0) / 20) }
  return out
}
// 通用撮合：返回逐日权益（按收盘计）。signal(i) 决定 pending。
// 策略 A：MACD 金叉次日开盘买，死叉次日开盘卖（MACD优秀规则），从第 60 根起
function stratMacd(bars) {
  const { gold, dead } = macdCross(bars); const eq = new Array(bars.length).fill(1)
  let cash = 1, units = 0, pend
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    if (pend === 'buy') { units = cash * (1 - COST) / b.open; cash = 0 } else if (pend === 'sell') { cash = units * b.open * (1 - COST); units = 0 }
    pend = undefined
    if (i >= 60) { if (!units && gold[i]) pend = 'buy'; else if (units && dead[i]) pend = 'sell' }
    eq[i] = units ? units * b.close : cash
  }
  return eq
}
// 策略 B：只认金叉 + 择时；牛市金叉次日开盘买、熊市不开仓；死叉当天收盘卖（买入当天则次日开盘），预热 120
function stratTimingGold(bars, bull) {
  const { gold, dead } = macdCross(bars); const eq = new Array(bars.length).fill(1)
  let cash = 1, units = 0, pend, buyIdx = -1, lastBull
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]; const t = bull.get(b.date); if (t !== undefined) lastBull = t; const isBull = lastBull !== false
    if (pend === 'buy') { units = cash * (1 - COST) / b.open; cash = 0; buyIdx = i } else if (pend === 'sellOpen') { cash = units * b.open * (1 - COST); units = 0 }
    pend = undefined
    if (i >= 120) {
      if (!units && gold[i] && isBull) pend = 'buy'
      else if (units && dead[i]) { if (buyIdx === i) pend = 'sellOpen'; else { cash = units * b.close * (1 - COST); units = 0 } }
    }
    eq[i] = units ? units * b.close : cash
  }
  return eq
}
// 基准 C：收盘在 20 日线上则次日开盘持有，跌破次日开盘卖（简单趋势基准），从第 60 根起
function stratMa20(bars) {
  const eq = new Array(bars.length).fill(1); let cash = 1, units = 0, pend, sum = 0
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    if (pend === 'buy') { units = cash * (1 - COST) / b.open; cash = 0 } else if (pend === 'sell') { cash = units * b.open * (1 - COST); units = 0 }
    pend = undefined; sum += b.close; if (i >= 20) sum -= bars[i - 20].close
    if (i >= 60) { const ma = sum / 20; if (!units && b.close > ma) pend = 'buy'; else if (units && b.close < ma) pend = 'sell' }
    eq[i] = units ? units * b.close : cash
  }
  return eq
}
// 区间统计：[from, to) 按收盘权益
function stats(bars, eq, from, to, startIdx = 0) {
  let i0 = bars.findIndex((b, i) => i >= startIdx && b.date >= from); if (i0 < 0) return null
  let i1 = to ? bars.findIndex((b) => b.date >= to) - 1 : bars.length - 1; if (i1 < 0) i1 = bars.length - 1
  if (i1 <= i0) return null
  const years = (Date.parse(bars[i1].date) - Date.parse(bars[i0].date)) / (365.25 * 864e5)
  const ret = eq[i1] / eq[i0]; let peak = -Infinity, dd = 0
  for (let i = i0; i <= i1; i++) { peak = Math.max(peak, eq[i]); dd = Math.min(dd, eq[i] / peak - 1) }
  return { years, annual: (ret ** (1 / years) - 1) * 100, dd: dd * 100, i0, i1 }
}
const holdEq = (bars) => bars.map((b) => b.close)

const codes = fs.readdirSync(dir).map((f) => f.slice(0, 6)).filter((c) => !['510300', '510880', '159915'].includes(c))
const tHs = timing('510300', '510880'), tCyb = timing('159915', '510880')
const rows = []
for (const c of codes) {
  const bars = load(c)
  const e = { macd: stratMacd(bars), hold: holdEq(bars), hs: stratTimingGold(bars, tHs), cyb: stratTimingGold(bars, tCyb), ma20: stratMa20(bars) }
  const r = { code: c, start: bars[60]?.date }
  for (const [k, eq] of Object.entries(e)) {
    const st = k === 'hs' || k === 'cyb' ? 120 : 60
    r[k] = { full: stats(bars, eq, '0000', null, st), ins: stats(bars, eq, '0000', SPLIT, st), oos: stats(bars, eq, SPLIT, null) }
  }
  // 样本内两半段
  const ins = r.macd.ins
  if (ins) { const mid = bars[Math.floor((ins.i0 + ins.i1) / 2)].date; r.half = [stats(bars, e.macd, '0000', mid, 60), stats(bars, e.hold, '0000', mid, 60), stats(bars, e.macd, mid, SPLIT), stats(bars, e.hold, mid, SPLIT)] }
  const fl = r.macd.full; if (fl) { const mid = bars[Math.floor((fl.i0 + fl.i1) / 2)].date; r.halfFull = [stats(bars, e.macd, '0000', mid, 60), stats(bars, e.hold, '0000', mid, 60), stats(bars, e.macd, mid, null), stats(bars, e.hold, mid, null)] }
  rows.push(r)
}
const macdRule = (m, h, half) => m && h && half && half.every(Boolean) && m.years >= 3 && m.annual - h.annual >= 3 && half[0].annual > half[1].annual && half[2].annual > half[3].annual && m.dd > h.dd
const hsRule = (hs, cyb) => hs && cyb && hs.years >= 3 && hs.annual - cyb.annual >= 3 && hs.annual >= 10
const avg = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—')

// 复现核对：全期规则 vs 朋友的数值
const FR = (process.env.FRIEND_REPO || '') + '/src/data/'
const fm = JSON.parse(fs.readFileSync(FR + 'etfMacdGood.json')).items
const fh = JSON.parse(fs.readFileSync(FR + 'etfHs300Timing.json')).items
console.log('== 复现核对（全期，我的 vs 朋友）')
for (const x of fm) { const r = rows.find((y) => y.code === x.code); if (r?.macd.full) console.log('MACD', x.code, x.name.padEnd(10), 'macd', f1(r.macd.full.annual), 'vs', x.macdAnnual, ' hold', f1(r.hold.full.annual), 'vs', x.holdAnnual) }
for (const x of fh) { const r = rows.find((y) => y.code === x.code); if (r?.hs.full) console.log('HS  ', x.code, x.name.padEnd(10), 'hs', f1(r.hs.full.annual), 'vs', x.hs300Annual, ' cyb', f1(r.cyb.full.annual), 'vs', x.cybAnnual) }

// 全期规则下我选出的
const fullMacd = rows.filter((r) => macdRule(r.macd.full, r.hold.full, r.halfFull)).map((r) => r.code)
const fullHs = rows.filter((r) => hsRule(r.hs.full, r.cyb.full)).map((r) => r.code)
console.log('\n全期规则入选 MACD', fullMacd.length, fullMacd.join(' '))
console.log('全期规则入选 HS  ', fullHs.length, fullHs.join(' '))

// 样本外：只用 2022 年底前数据选
const insMacd = rows.filter((r) => macdRule(r.macd.ins, r.hold.ins, r.half))
const insHs = rows.filter((r) => hsRule(r.hs.ins, r.cyb.ins))
const oosAll = rows.filter((r) => r.macd.oos && r.hold.oos)
const report = (label, set, key) => {
  const s = set.filter((r) => r[key].oos && r.hold.oos)
  const ex = s.map((r) => r[key].oos.annual - r.hold.oos.annual)
  console.log(label.padEnd(34), 'n=' + String(s.length).padEnd(3), '策略年化', f1(avg(s.map((r) => r[key].oos.annual))).padStart(6), ' 持有年化', f1(avg(s.map((r) => r.hold.oos.annual))).padStart(6), ' 超额', f1(avg(ex)).padStart(6), ' 跑赢持有', s.filter((r, i) => ex[i] > 0).length + '/' + s.length, ' 策略回撤', f1(avg(s.map((r) => r[key].oos.dd))), ' 持有回撤', f1(avg(s.map((r) => r.hold.oos.dd))))
}
console.log(`\n== 样本外 ${SPLIT} 起（等权平均，各 ETF 单独计算）`)
console.log(`样本内（${SPLIT} 前）MACD 入选:`, insMacd.map((r) => r.code).join(' ') || '无')
console.log(`样本内（${SPLIT} 前）HS 入选:  `, insHs.map((r) => r.code).join(' ') || '无')
report('MACD｜样本内入选', insMacd, 'macd')
report('MACD｜未入选', oosAll.filter((r) => !insMacd.includes(r)), 'macd')
report('MACD｜全部', oosAll, 'macd')
report('MA20 基准｜全部', oosAll, 'ma20')
report('MA20 基准｜MACD 入选同一批', insMacd, 'ma20')
report('沪深300择时｜样本内入选', insHs, 'hs')
report('沪深300择时｜全部', oosAll, 'hs')
report('创业板择时｜全部', oosAll, 'cyb')
// 沪深300 择时 vs 创业板择时 在入选组样本外是否仍更好
const s = insHs.filter((r) => r.hs.oos && r.cyb.oos)
console.log('HS 入选组样本外 沪深300择时 - 创业板择时 =', f1(avg(s.map((r) => r.hs.oos.annual - r.cyb.oos.annual))), '个百分点；仍更好', s.filter((r) => r.hs.oos.annual > r.cyb.oos.annual).length + '/' + s.length)
fs.writeFileSync(dir + '../rows-' + SPLIT + '.json', JSON.stringify(rows.map((r) => ({ code: r.code, start: r.start, macd: r.macd, hold: r.hold, hs: r.hs, cyb: r.cyb, ma20: r.ma20 }))))
