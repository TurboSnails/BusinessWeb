import React, { useMemo, useState } from 'react'
import { ToneBadge } from './MacroViews'
import type { Tone } from './stages'
import { niceTicks, signed } from './spread'
import { US_HORIZONS, bucketOf, channelCheck, forwardPairs, horizonLabel, percentileRank, quantile, spreadBuckets, type UsSpreadSnapshot } from './usSpread'
import './macro.css'

const W = 720
const PAD = { l: 38, r: 44, t: 12, b: 20 }
const H1 = 260
const H2 = 150
const HS = 300
const RANGES = [{ id: '10y', label: '10 年', years: 10 }, { id: '20y', label: '20 年', years: 20 }, { id: 'all', label: '全部', years: 0 }] as const
type RangeId = (typeof RANGES)[number]['id']
const GROUP_NAMES = ['最低 20%', '20%–40%', '40%–60%', '60%–80%', '最高 20%']
const fmtR = (r: number): string => (Number.isFinite(r) ? `${r >= 0 ? '+' : ''}${r.toFixed(2)}` : '—')

function levelOf(pct: number): { tone: Tone; label: string; text: string } {
  if (pct <= 20) return { tone: 'red', label: '历史最低 20%', text: '股票相对债券处在 1990 年以来偏贵的一端。' }
  if (pct >= 80) return { tone: 'green', label: '历史最高 20%', text: '股票相对债券处在 1990 年以来偏便宜的一端。' }
  return { tone: 'gray', label: '历史中间区域', text: '股票相对债券不算特别贵，也不算特别便宜。' }
}

/** 美股股债息差：全样本分位、分组后的长期收益、散点，以及把 A 股通道规则套过来的对照回测 */
export function UsSpreadView({ data }: { data: UsSpreadSnapshot }): JSX.Element {
  const [range, setRange] = useState<RangeId>('all')
  const [showBand, setShowBand] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const { rows } = data
  const values = useMemo(() => rows.map(r => r[1]), [rows])
  const sorted = useMemo(() => [...values].sort((a, b) => a - b), [values])
  const buckets = useMemo(() => spreadBuckets(rows), [rows])
  const pairs1 = useMemo(() => forwardPairs(rows, 52), [rows])
  const pairs3 = useMemo(() => forwardPairs(rows, 156), [rows])
  const ey3 = useMemo(() => forwardPairs(rows, 156, r => 100 / r[3]), [rows])
  const check = useMemo(() => channelCheck(rows, data.window, data.k), [rows, data.window, data.k])

  const last = rows.length - 1
  if (last < 200) return <p role="alert" className="macro-muted">美股股债息差数据不足。</p>
  const now = rows[last]
  const pct = percentileRank(values, now[1])
  const lv = levelOf(pct)
  const cur3 = bucketOf(buckets, now[1])
  const pLines = [0.2, 0.5, 0.8].map(q => ({ q, v: quantile(sorted, q) }))
  const nowBand = check.bands[last]
  const sigma = nowBand ? (now[1] - nowBand.mid) / ((nowBand.upper - nowBand.mid) / data.k) : undefined
  const y1Row = check.rows.find(r => r.h === 52)
  const y3Row = check.rows.find(r => r.h === 156)
  const ly = data.latestYield && data.latestYield.date > now[0] ? data.latestYield : undefined

  // —— 走势图 ——
  const years = RANGES.find(r => r.id === range)!.years
  const cut = years ? `${Number(now[0].slice(0, 4)) - years}${now[0].slice(4)}` : ''
  const i0 = years ? Math.max(0, rows.findIndex(r => r[0] >= cut)) : 0
  const n = last - i0
  const x = (i: number): number => PAD.l + ((i - i0) / Math.max(1, n)) * (W - PAD.l - PAD.r)
  const idx = Array.from({ length: n + 1 }, (_, k) => i0 + k)
  let sLo = Infinity, sHi = -Infinity, pLo = Infinity, pHi = -Infinity
  for (const i of idx) {
    const b = check.bands[i], [, s, p] = rows[i]
    sLo = Math.min(sLo, s, showBand && b ? b.lower : s); sHi = Math.max(sHi, s, showBand && b ? b.upper : s)
    pLo = Math.min(pLo, p); pHi = Math.max(pHi, p)
  }
  const sPad = (sHi - sLo) * 0.08, sA = sLo - sPad, sB = sHi + sPad
  const y1 = (v: number): number => PAD.t + ((sB - v) / (sB - sA)) * (H1 - PAD.t - PAD.b)
  const lA = Math.log(pLo) - 0.05, lB = Math.log(pHi) + 0.05
  const y2 = (v: number): number => PAD.t + ((lB - Math.log(v)) / (lB - lA)) * (H2 - PAD.t - PAD.b)
  const priceTicks = [100, 200, 500, 1000, 2000, 4000, 8000, 16000].filter(v => Math.log(v) >= lA && Math.log(v) <= lB)
  const line = (get: (i: number) => number | undefined, y: (v: number) => number): string => {
    let d = '', pen = false
    for (const i of idx) { const v = get(i); if (v === undefined) { pen = false; continue } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true }
    return d
  }
  const withBand = idx.filter(i => check.bands[i])
  const area = showBand && withBand.length
    ? `${withBand.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y1(check.bands[i]!.upper).toFixed(1)}`).join('')}${[...withBand].reverse().map(i => `L${x(i).toFixed(1)},${y1(check.bands[i]!.lower).toFixed(1)}`).join('')}Z`
    : ''
  const span = n / 52
  const yearTicks: [number, string][] = []
  for (let i = i0 + 1; i <= last; i++) {
    const y = rows[i][0].slice(0, 4)
    if (y !== rows[i - 1][0].slice(0, 4) && Number(y) % (span > 24 ? 5 : span > 12 ? 2 : 1) === 0) yearTicks.push([i, y])
  }
  const cur = hover ?? last
  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - box.left) / box.width) * W
    setHover(Math.max(i0, Math.min(last, Math.round(i0 + ((rel - PAD.l) / (W - PAD.l - PAD.r)) * n))))
  }
  const xAxis = (H: number): JSX.Element[] => yearTicks.map(([i, label]) => <text key={label} className="macro-long__label" x={x(i)} y={H - 5} textAnchor="middle">{label}</text>)

  // —— 散点：息差 vs 3 年后年化收益 ——
  const pts = pairs3.points
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const qa = Math.min(...xs, now[1]) - 0.3, qb = Math.max(...xs, now[1]) + 0.3
  const ra = Math.min(...ys) - 2, rb = Math.max(...ys) + 2
  const sx = (v: number): number => PAD.l + ((v - qa) / (qb - qa)) * (W - PAD.l - PAD.r)
  const sy = (v: number): number => PAD.t + ((rb - v) / (rb - ra)) * (HS - PAD.t - PAD.b - 10)

  return (
    <div className="macro-stack">
      <section className={`macro-hero${lv.tone === 'gray' ? '' : ` macro-hero--${lv.tone}`}`} aria-label="当前位置">
        <div className="macro-hero__head">
          <span className="macro-muted">100 ÷ 标普500 Forward PE − 10 年期美债收益率 · 截至 {now[0]}</span>
          <ToneBadge tone={lv.tone} label={lv.label} />
        </div>
        <h2 className="macro-hero__name">{now[1].toFixed(2)}<small className="macro-spread__unit"> 个百分点</small></h2>
        <p className="macro-hero__summary">1990 年以来只有 {pct.toFixed(0)}% 的周份息差不高于现在。{lv.text}</p>
        <dl className="macro-spread__stats">
          <div><dt>Forward PE</dt><dd>{now[3].toFixed(1)}</dd></div>
          <div><dt>盈利收益率</dt><dd>{(100 / now[3]).toFixed(2)}%</dd></div>
          <div><dt>10 年期美债</dt><dd>{now[4].toFixed(2)}%</dd></div>
          <div><dt>标普500</dt><dd>{now[2].toFixed(0)}</dd></div>
        </dl>
        {ly && <p className="macro-muted" style={{ marginTop: 10 }}>Forward PE 序列只更新到 {now[0]}；10 年期美债最新为 {ly.value.toFixed(2)}%（{ly.date}），没有同期 PE，不拼进序列。</p>}
      </section>

      <section className="macro-card" aria-label="走势">
        <figure className="macro-long" style={{ margin: 0 }}>
          <div className="macro-long__bar" role="group" aria-label="美股股债息差时间范围">
            {RANGES.map(r => <button key={r.id} type="button" className={`macro-long__tab${range === r.id ? ' is-on' : ''}`} aria-pressed={range === r.id} onClick={() => { setRange(r.id); setHover(null) }}>{r.label}</button>)}
            <button type="button" className={`macro-long__tab${showBand ? ' is-on' : ''}`} aria-pressed={showBand} onClick={() => setShowBand(v => !v)}>叠加 A 股式通道</button>
            <span className="macro-long__pct">{rows[cur][0]} · 息差 {rows[cur][1].toFixed(2)} · PE {rows[cur][3].toFixed(1)} · 10Y {rows[cur][4].toFixed(2)}% · 标普 {rows[cur][2].toFixed(0)}</span>
          </div>
          <h3 className="macro-h3">息差（百分点）与全样本分位线</h3>
          <svg viewBox={`0 0 ${W} ${H1}`} role="img" onPointerMove={onMove} onPointerLeave={() => setHover(null)}
            aria-label={`美股股债息差 ${rows[i0][0].slice(0, 4)} 年至今走势，最新 ${now[1].toFixed(2)}，处在全样本 ${pct.toFixed(0)}% 分位`}>
            {niceTicks(sA, sB, 5).map(v => <g key={v}><line className="macro-spark__threshold" x1={PAD.l} x2={W - PAD.r} y1={y1(v)} y2={y1(v)} /><text className="macro-long__label" x={PAD.l - 5} y={y1(v) + 3.5} textAnchor="end">{v.toFixed(0)}</text></g>)}
            {xAxis(H1)}
            {area && <path className="macro-spread__band" d={area} />}
            {showBand && <path className="macro-spread__rail" d={line(i => check.bands[i]?.mid, y1)} strokeDasharray="4 3" />}
            {pLines.map(p => <g key={p.q}><line className="macro-spread__pct" x1={PAD.l} x2={W - PAD.r} y1={y1(p.v)} y2={y1(p.v)} /><text className="macro-long__label" x={W - PAD.r + 5} y={y1(p.v) + 3.5}>{p.q * 100}%</text></g>)}
            <path className="macro-spread__line" d={line(i => rows[i][1], y1)} />
            {hover !== null && <line className="macro-spark__cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H1 - PAD.b} />}
            <circle className="macro-spark__dot" cx={x(cur)} cy={y1(rows[cur][1])} r={4} />
          </svg>
          <h3 className="macro-h3" style={{ marginTop: 12 }}>标普500（对数坐标）</h3>
          <svg viewBox={`0 0 ${W} ${H2}`} role="img" onPointerMove={onMove} onPointerLeave={() => setHover(null)} aria-label={`标普500 同期走势，最新 ${now[2].toFixed(0)}`}>
            {priceTicks.map(v => <g key={v}><line className="macro-spark__threshold" x1={PAD.l} x2={W - PAD.r} y1={y2(v)} y2={y2(v)} /><text className="macro-long__label" x={PAD.l - 5} y={y2(v) + 3.5} textAnchor="end">{v}</text></g>)}
            {xAxis(H2)}
            <path className="macro-spark__line" d={line(i => rows[i][2], y2)} />
            {hover !== null && <line className="macro-spark__cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H2 - PAD.b} />}
            <circle className="macro-long__mark" cx={x(cur)} cy={y2(rows[cur][2])} r={4} />
          </svg>
          <figcaption className="macro-muted macro-spread__legend">
            <span><svg width="18" height="8" aria-hidden="true"><line className="macro-spread__line" x1="0" y1="4" x2="18" y2="4" /></svg>息差</span>
            <span><svg width="18" height="8" aria-hidden="true"><line className="macro-spread__pct" x1="0" y1="4" x2="18" y2="4" /></svg>1990 年以来 20% / 50% / 80% 分位</span>
            {showBand && <span><svg width="18" height="10" aria-hidden="true"><rect className="macro-spread__band" width="18" height="10" /></svg>{data.window} 周 ±{data.k} 倍标准差通道</span>}
          </figcaption>
        </figure>
      </section>

      <section className="macro-card" aria-label="分组收益">
        <h3>按息差高低分五组，之后标普500 的表现</h3>
        <p className="macro-muted">把 1990 年以来每一周按当周息差从低到高平均分成五组，统计每组之后的年化涨跌（价格指数，不含分红）。粗体是现在所在的组。</p>
        <div className="macro-table-wrap">
          <table className="macro-table macro-val">
            <thead><tr><th>息差分组</th><th className="macro-val__n">区间（百分点）</th>{US_HORIZONS.map(h => <th key={h} className="macro-val__n">{horizonLabel(h)}后年化</th>)}<th className="macro-val__n">3 年后上涨占比</th></tr></thead>
            <tbody>
              {buckets.map(b => {
                const on = b.index === cur3
                const cell = (s: React.ReactNode): React.ReactNode => (on ? <b>{s}</b> : s)
                return (
                  <tr key={b.index} className={on ? 'macro-spread__now' : undefined}>
                    <td>{cell(GROUP_NAMES[b.index])}{on && <span className="macro-muted">（现在）</span>}</td>
                    <td className="macro-val__n">{cell(`${b.lo.toFixed(2)} ~ ${b.hi.toFixed(2)}`)}</td>
                    {b.stats.map((s, c) => <td key={c} className="macro-val__n">{cell(signed(s.mean))}</td>)}
                    <td className="macro-val__n">{cell(b.stats.at(-1)?.win === undefined ? '—' : `${b.stats.at(-1)!.win!.toFixed(0)}%`)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="macro-card" aria-label="散点">
        <h3>息差与 3 年后年化收益</h3>
        <p className="macro-muted">每个点是一周。相关系数：息差对 1 年后 {fmtR(pairs1.r)}，对 3 年后 {fmtR(pairs3.r)}；只看盈利收益率（PE 倒数）对 3 年后 {fmtR(ey3.r)}。竖线是现在的息差。</p>
        <svg viewBox={`0 0 ${W} ${HS}`} role="img" aria-label={`散点图：息差与 3 年后年化收益，相关系数 ${fmtR(pairs3.r)}`}>
          {niceTicks(ra, rb, 5).map(v => <g key={v}><line className="macro-spark__threshold" x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} /><text className="macro-long__label" x={PAD.l - 5} y={sy(v) + 3.5} textAnchor="end">{v}%</text></g>)}
          {niceTicks(qa, qb, 6).map(v => <text key={v} className="macro-long__label" x={sx(v)} y={HS - 5} textAnchor="middle">{v}</text>)}
          <line className="macro-spread__rail" x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} />
          {pts.map(p => <circle key={p[2]} className="macro-spread__dot" cx={sx(p[0])} cy={sy(p[1])} r={2.2} />)}
          <line className="macro-spread__nowline" x1={sx(now[1])} x2={sx(now[1])} y1={PAD.t} y2={HS - PAD.b - 10} />
          <text className="macro-long__label" x={sx(now[1]) + 4} y={PAD.t + 10}>现在 {now[1].toFixed(2)}</text>
        </svg>
        <p className="macro-muted">横轴：息差（百分点）；纵轴：之后 3 年标普500 年化涨跌。</p>
      </section>

      <section className="macro-card" aria-label="通道对照">
        <h3>对照：把 A 股的通道规则原样套到美股</h3>
        <p className="macro-muted">同样用约 750 个交易日（{data.window} 周）均值 ±{data.k} 倍标准差，相隔不到 4 周的触轨算一次。上轨触发 {check.ups.length} 次，下轨触发 {check.downs.length} 次。表中是之后的平均涨跌（未年化）。</p>
        <div className="macro-table-wrap">
          <table className="macro-table macro-val">
            <thead><tr><th>之后</th><th className="macro-val__n">触及上轨（"便宜"）</th><th className="macro-val__n">跌破下轨（"贵"）</th><th className="macro-val__n">平时任意一周</th></tr></thead>
            <tbody>
              {check.rows.map(r => (
                <tr key={r.h}>
                  <td>{horizonLabel(r.h)}</td>
                  <td className="macro-val__n">{signed(r.up)} <span className="macro-muted">（涨 {r.upWin}/{r.upN}）</span></td>
                  <td className="macro-val__n">{signed(r.down)} <span className="macro-muted">（涨 {r.downWin}/{r.downN}）</span></td>
                  <td className="macro-val__n macro-muted">{signed(r.base)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="macro-muted">
          触及上轨的日期：{check.ups.map(i => rows[i][0]).join('、') || '无'}。<br />
          跌破下轨的日期：{check.downs.map(i => rows[i][0]).join('、') || '无'}。<br />
          {nowBand && sigma !== undefined && <>现在按通道看偏离中轨 {sigma >= 0 ? '+' : ''}{sigma.toFixed(2)} 倍标准差，处在通道内；按全样本看却在 {pct.toFixed(0)}% 分位。窗口跟着最近 3 年移动，把"长期偏低"当成了新常态。</>}
        </p>
      </section>

      <section className="macro-card">
        <h3>为什么美股不用通道，改看分位和长期收益</h3>
        <ul>
          <li><b>回测结果：</b>触及上轨之后 1 年平均 {signed(y1Row?.up)}，低于平时的 {signed(y1Row?.base)}（上涨 {y1Row?.upWin}/{y1Row?.upN} 次）；3 年平均 {signed(y3Row?.up)}，和平时的 {signed(y3Row?.base)} 差不多。2007 年底到 2008 年连续触发上轨，之后一年标普跌了 17%～40%。跌破下轨之后 1 年平均 {signed(y1Row?.down)}，也没有更容易下跌，2022–2023 年几次跌破后一年反而涨了 15%～22%。两条轨都不能当买卖信号。</li>
          <li><b>原因一，美股盈利周期性强：</b>Forward PE 用的是分析师预测，衰退初期预测还没下调，PE 看着便宜（2008 年只有 12～14 倍），息差被抬高，实际是价值陷阱。沪深300 银行权重高，盈利相对平稳，这个问题小得多。</li>
          <li><b>原因二，美债利率有长期趋势：</b>10 年期从 1990 年的 8% 一路降到 2020 年的 1% 以下，又回到 4% 以上。息差的大部分波动来自利率换挡，不是股票本身贵贱。这也是"美联储模型"常被批评的地方：盈利收益率是实际量，国债收益率是名义量，通胀变化时两者不可比。</li>
          <li><b>原因三，滚动窗口会适应新常态：</b>3 年窗口的通道会跟着息差整体漂移。息差长期处在低位时，通道也一起下移，结果显示"中轨附近"，看不出风险。打开图上的"叠加 A 股式通道"可以直接看到。</li>
          <li><b>还剩下的用处：</b>息差水平对 1 年后的涨跌几乎没有解释力（相关系数 {fmtR(pairs1.r)}），对 3 年后的年化收益有一定参考（{fmtR(pairs3.r)}，只看 PE 倒数是 {fmtR(ey3.r)}）。分组表里最低一档 1 年内照样可能大涨（1995–1999 年泡沫期），但 3 年后的表现明显最差。所以这里只把它当慢变量：看现在处在历史哪一档、那一档过去 3 年的平均表现，不给买卖时点。</li>
          <li><b>局限：</b>分位和分组用的是全样本，包含了"未来"数据，只能描述历史，不能当实时可得的规则；3 年前瞻收益的样本大量重叠，真正独立的观测只有十来段，相关系数看着比实际更可靠；指数不含分红（年化少约 1.5～2 个百分点）；Forward PE 与 A 股版的 TTM PE 口径不同，两边数值不能直接比较。</li>
          <li><b>数据：</b>{data.source}。快照生成于 {data.generatedAt}，更新命令：<code>npm run spread:us-update</code>（先跑 <code>npm run index:update</code> 才能拿到新的 Forward PE）。</li>
        </ul>
      </section>
    </div>
  )
}
