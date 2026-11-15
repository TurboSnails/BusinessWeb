// R1（创业板50÷红利低波）与择时+KD10 补充检验，按 docs/TODO-投资工具优化.md「补充检验」事先写定的标准。历史统计，不构成投资建议。
// 先运行 fetch-r1.mjs 取数。输出：docs/research/etf-timing-r1-kd10.md（表格部分）与 data-raw/etf-timing-research/r1-kd10.json。
import fs from 'node:fs'
import { ratioTiming, timingGold, kd10, windowStats } from './strategies.mjs'

const dir = (process.env.R1_DIR || process.env.HOME + '/.businessweb-etf-oos/r1') + '/'
const load = (c) => JSON.parse(fs.readFileSync(dir + c + '.json', 'utf8'))
const TARGETS = ['H00300', 'H00905', 'H00852', 'H00016', 'H00922', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00991', 'H00992', 'H00993', 'H00994', 'H00995']
const cyb = load('sz399006'), cyb50 = load('sz399673'), divLv = load('H30269'), divLvTr = load('H20269'), div = load('000922')
const timing = { R2: ratioTiming(cyb, div), R1a: ratioTiming(cyb50, divLv), R1b: ratioTiming(cyb, divLv) }
const CRASH = [['2015 股灾', '2015-06-12', '2016-01-28'], ['2018 熊市', '2018-01-24', '2019-01-03'], ['2021—2024 下跌', '2021-02-18', '2024-02-05']]
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const f1 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(1))
const sg = (x) => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1))

const idx = TARGETS.map((code) => { const bars = load(code).map(({ date, close }) => ({ date, open: close, high: close, low: close, close })); return { code, name: load(code).at(-1).name, bars } })

/** 对一组曲线算：全期年化、三段大跌回撤、两项判定 */
function evaluate(from, curvesOf) {
  const rows = idx.map(({ code, name, bars }) => {
    const curves = curvesOf(bars); const out = { code, name, s: {} }
    for (const [k, eq] of Object.entries(curves)) {
      const full = windowStats(bars, eq, from, null)
      const crash = CRASH.map(([, a, b]) => windowStats(bars, eq, a < from ? from : a, b))
      out.s[k] = { annual: full.annual, dd: full.dd, crash: crash.map((c) => c?.dd ?? null) }
    }
    for (const k of Object.keys(curves)) {
      if (k === 'hold') continue
      const x = out.s[k], h = out.s.hold
      const ddPass = x.crash.every((d, i) => d == null || h.crash[i] == null || CRASH[i][2] < from || d >= 0.7 * h.crash[i])
      x.ddPass = ddPass; x.annualPass = x.annual >= h.annual - 1; x.both = ddPass && x.annualPass
    }
    return out
  })
  return rows
}
const count = (rows, k) => ({ dd: rows.filter((r) => r.s[k].ddPass).length, annual: rows.filter((r) => r.s[k].annualPass).length, both: rows.filter((r) => r.s[k].both).length })
const verdict = (rows, k, base) => {
  const a = count(rows, k).both, b = count(rows, base).both; const med = median(rows.map((r) => r.s[k].annual - r.s[base].annual))
  return { diffBoth: a - b, medAnnualDiff: med, label: a - b >= 2 && med >= 0 ? '更好' : Math.abs(a - b) <= 1 ? '无实质差别' : '更差' }
}

// ---------- A：R1 vs R2 ----------
const A_FROM = '2014-07-01'
const A = evaluate(A_FROM, (bars) => ({ hold: bars.map((b) => b.close), R2: timingGold(bars, timing.R2, { fill: 'close' }).eq, R1a: timingGold(bars, timing.R1a, { fill: 'close' }).eq, R1b: timingGold(bars, timing.R1b, { fill: 'close' }).eq }))
const A11 = evaluate('2011-01-01', (bars) => ({ hold: bars.map((b) => b.close), R2: timingGold(bars, timing.R2, { fill: 'close' }).eq, R1b: timingGold(bars, timing.R1b, { fill: 'close' }).eq }))
// 择时信号本身的相似度：两种择时同为牛/熊的交易日占比（2014-07 起）
const agree = (x, y) => { let s = 0, n = 0; for (const [d, v] of x) { if (d < A_FROM || !y.has(d)) continue; n++; if (v === y.get(d)) s++ } return (s / n) * 100 }

// ---------- C：KD10 vs 只认金叉（R2） ----------
const C = evaluate('2011-01-01', (bars) => ({ hold: bars.map((b) => b.close), gold: timingGold(bars, timing.R2, { fill: 'close' }).eq, ...Object.fromEntries([0, 3, 5.3, 8].map((t) => [`kd${t}`, kd10(bars, timing.R2, { fill: 'close', threshold: t }).eq])) }))

// ---------- B：周线比值历史分位 → 未来 52 周超额 ----------
function weekly(bars) { const m = new Map(); for (const b of bars) { const d = new Date(b.date + 'T00:00:00Z'); const mon = new Date(d - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); m.set(mon, b) } return m }
function cycle(numer, label) {
  const wn = weekly(numer), wd = weekly(divLv), wt = weekly(divLvTr), wc = wn
  const weeks = [...wn.keys()].filter((w) => wd.has(w) && wt.has(w)).sort()
  const ratio = weeks.map((w) => wn.get(w).close / wd.get(w).close)
  const pts = []
  for (let i = 0; i < weeks.length; i++) {
    if (i < 156) continue // 至少 3 年历史
    const hist = ratio.slice(0, i); const pct = (hist.filter((v) => v < ratio[i]).length / hist.length) * 100
    const j = i + 52; const fwd = j < weeks.length ? { rel: ((wc.get(weeks[j]).close / wc.get(weeks[i]).close) / (wt.get(weeks[j]).close / wt.get(weeks[i]).close) - 1) * 100, abs: (wc.get(weeks[j]).close / wc.get(weeks[i]).close - 1) * 100 } : null
    pts.push({ week: weeks[i], date: wn.get(weeks[i]).date, ratio: ratio[i], pct, fwd })
  }
  const bucket = (lo, hi, from = '0', to = '9') => { const s = pts.filter((p) => p.fwd && p.pct >= lo && p.pct < hi && p.week >= from && p.week < to); return { n: s.length, rel: s.length ? s.reduce((a, p) => a + p.fwd.rel, 0) / s.length : null, abs: s.length ? s.reduce((a, p) => a + p.fwd.abs, 0) / s.length : null } }
  const split = (from, to) => { const hi = bucket(80, 101, from, to), lo = bucket(0, 20, from, to); return { hi, lo, spread: hi.rel != null && lo.rel != null ? hi.rel - lo.rel : null } }
  const all = split('0', '9'), pre = split('0', '2019-01-01'), post = split('2019-01-01', '9')
  const pass = all.spread != null && all.spread <= -15 && pre.spread != null && pre.spread < 0 && post.spread != null && post.spread < 0
  const quint = [0, 20, 40, 60, 80].map((lo) => ({ lo, ...bucket(lo, lo === 80 ? 101 : lo + 20) }))
  const at = (d) => { const p = pts.filter((x) => x.date <= d).at(-1); return p ? { date: p.date, pct: p.pct } : null }
  const marks = [['2015-06-05 创业板顶', '2015-06-05'], ['2016-01-29 股灾后', '2016-01-29'], ['2018-10-19 熊市底', '2018-10-19'], ['2021-07-23 创业板高位', '2021-07-23'], ['2021-12-03', '2021-12-03'], ['2024-02-02 小盘踩踏', '2024-02-02'], ['2024-09-20 政策前', '2024-09-20'], ['最新', '2099-01-01']].map(([l, d]) => ({ label: l, ...at(d) }))
  return { label, start: pts[0]?.date, all, pre, post, pass, quint, marks, latest: pts.at(-1) }
}
const B = [cycle(cyb, 'R1b 创业板指÷红利低波'), cycle(cyb50, 'R1a 创业板50÷红利低波')]

// ---------- 输出 ----------
const L = []
const vA1 = verdict(A, 'R1a', 'R2'), vA2 = verdict(A, 'R1b', 'R2'), vA11 = verdict(A11, 'R1b', 'R2')
const vC = verdict(C, 'kd5.3', 'gold')
L.push('## A. R1 与 R2 做短线择时（套在「择时＋只认金叉」上）', '')
L.push(`择时信号一致度（2014-07 起，同为牛或同为熊的交易日占比）：R1a 与 R2 ${f1(agree(timing.R1a, timing.R2))}%，R1b 与 R2 ${f1(agree(timing.R1b, timing.R2))}%，R1a 与 R1b ${f1(agree(timing.R1a, timing.R1b))}%。`, '')
L.push('| 区间 | 择时 | 大跌回撤通过 | 全期年化通过 | 两项都过 | 相对 R2 全期年化中位差 | 判定 |', '|---|---|---|---|---|---|---|')
const cA = (rows, k) => count(rows, k)
L.push(`| 2014-07 起 | R2 创业板指÷中证红利 | ${cA(A, 'R2').dd}/15 | ${cA(A, 'R2').annual}/15 | ${cA(A, 'R2').both}/15 | — | 基准 |`)
L.push(`| 2014-07 起 | R1a 创业板50÷红利低波 | ${cA(A, 'R1a').dd}/15 | ${cA(A, 'R1a').annual}/15 | ${cA(A, 'R1a').both}/15 | ${sg(vA1.medAnnualDiff)} | **${vA1.label}** |`)
L.push(`| 2014-07 起 | R1b 创业板指÷红利低波 | ${cA(A, 'R1b').dd}/15 | ${cA(A, 'R1b').annual}/15 | ${cA(A, 'R1b').both}/15 | ${sg(vA2.medAnnualDiff)} | **${vA2.label}** |`)
L.push(`| 2011 起 | R2 | ${cA(A11, 'R2').dd}/15 | ${cA(A11, 'R2').annual}/15 | ${cA(A11, 'R2').both}/15 | — | 基准 |`)
L.push(`| 2011 起 | R1b | ${cA(A11, 'R1b').dd}/15 | ${cA(A11, 'R1b').annual}/15 | ${cA(A11, 'R1b').both}/15 | ${sg(vA11.medAnnualDiff)} | **${vA11.label}** |`, '')
L.push('逐个指数（2014-07 起，全期年化% / 最大回撤%）：', '', '| 指数 | 一直持有 | R2 | R1a | R1b |', '|---|---|---|---|---|')
for (const r of A) L.push(`| ${r.name} | ${f1(r.s.hold.annual)} / ${f1(r.s.hold.dd)} | ${f1(r.s.R2.annual)} / ${f1(r.s.R2.dd)} | ${f1(r.s.R1a.annual)} / ${f1(r.s.R1a.dd)} | ${f1(r.s.R1b.annual)} / ${f1(r.s.R1b.dd)} |`)
L.push('', '## B. R1 周线比值的历史分位能否提示周期位置', '')
L.push('分位只用当时之前的周（至少 3 年历史后）。超额 = 未来 52 周创业板指（价格）相对红利低波全收益；因创业板指不含分红，超额整体偏低约 3～4 个百分点，但高低分位比较不受影响。', '')
for (const b of B) {
  L.push(`### ${b.label}（分位自 ${b.start} 起）`, '', `判定：**${b.pass ? '有周期参考价值' : '未通过'}**。高分位(≥80%)减低分位(≤20%)的未来 52 周平均超额：全期 ${sg(b.all.spread)}，2019 年前 ${sg(b.pre.spread)}，2019 年后 ${sg(b.post.spread)} 个百分点（标准：全期 ≤ −15 且两段都为负）。`, '')
  L.push('| 分位段 | 周数 | 未来 52 周超额（平均）| 未来 52 周创业板涨跌（平均）|', '|---|---|---|---|')
  for (const q of b.quint) L.push(`| ${q.lo}～${q.lo === 80 ? 100 : q.lo + 20}% | ${q.n} | ${sg(q.rel)}% | ${sg(q.abs)}% |`)
  L.push('', '| 时点 | 当周 | 历史分位 |', '|---|---|---|')
  for (const m of b.marks) L.push(`| ${m.label} | ${m.date ?? '—'} | ${m.pct == null ? '—' : f1(m.pct) + '%'} |`)
  L.push('')
}
L.push('## C. 择时+KD10 与「只认金叉」（同用 R2，2011 起）', '', '全收益指数只有收盘价，KD 用收盘近似；ETF 实盘 KD 会用最高/最低价，结果需打折扣。', '')
L.push('| 方案 | 大跌回撤通过 | 全期年化通过 | 两项都过 | 相对只认金叉 年化中位差 |', '|---|---|---|---|---|')
L.push(`| 只认金叉 | ${count(C, 'gold').dd}/15 | ${count(C, 'gold').annual}/15 | ${count(C, 'gold').both}/15 | — |`)
for (const t of [0, 3, 5.3, 8]) { const k = `kd${t}`; const v = verdict(C, k, 'gold'); L.push(`| KD10 阈值 ${t}${t === 5.3 ? '（原方案）' : ''} | ${count(C, k).dd}/15 | ${count(C, k).annual}/15 | ${count(C, k).both}/15 | ${sg(v.medAnnualDiff)} |`) }
L.push('', `判定（阈值 5.3）：**${vC.label}**。`, '')
L.push('逐个指数（2011 起，全期年化% / 最大回撤%）：', '', '| 指数 | 一直持有 | 只认金叉 | KD10(5.3) |', '|---|---|---|---|')
for (const r of C) L.push(`| ${r.name} | ${f1(r.s.hold.annual)} / ${f1(r.s.hold.dd)} | ${f1(r.s.gold.annual)} / ${f1(r.s.gold.dd)} | ${f1(r.s['kd5.3'].annual)} / ${f1(r.s['kd5.3'].dd)} |`)
const md = L.join('\n')
fs.mkdirSync('data-raw/etf-timing-research', { recursive: true })
fs.writeFileSync('data-raw/etf-timing-research/r1-kd10.json', JSON.stringify({ generatedAt: new Date().toISOString(), A: { rows: A, v: { R1a: vA1, R1b: vA2, R1b2011: vA11 } }, A2011: A11, B, C: { rows: C, v: vC } }, null, 1))
fs.writeFileSync('/dev/stdout', md + '\n')
