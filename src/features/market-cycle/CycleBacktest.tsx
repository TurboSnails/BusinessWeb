import React, { useEffect, useState } from 'react'
import { MARKETS, type Market } from './engine'

// 「规则回测」：读 scripts/cycle-backtest.mjs 每周生成的 public/data/market-cycle-backtest.json，只展示、不重算。
interface Perf { totalReturn: number | null; cagr: number | null; maxDrawdown: number | null; volatility: number | null; switches?: number }
interface Dist { n: number; mean?: number | null; median?: number | null; p25?: number | null; p75?: number | null; min?: number | null; max?: number | null; negativeShare?: number | null }
export interface BacktestMarket {
  label: string; start: string; end: string; weeks: number; years: number
  buyHold: Perf; defense: Perf & { switches: number }; variants: Record<string, Perf & { lag: number; cost: number }>
  timeInDefense: number; defenseNow: boolean; episodeCount: number; whipsaws: number; closedEpisodes: number; shortEpisodes: number; medianEpisodeWeeks: number | null
  forward: Record<string, { afterEntry: Dist; allWeeks: Dist }>
  curve: [string, number, number, number][]
}
export interface BacktestData { schemaVersion: 1; version: string; ruleVersion: string; asOf: string; method: Record<string, string>; limitations: string[]; horizons: number[]; markets: Partial<Record<Market, BacktestMarket>> }

const pct = (v: number | null | undefined, digits = 1): string => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`)
const signed = (v: number | null | undefined, digits = 1): string => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`)
export const validBacktest = (v: unknown): v is BacktestData => {
  const b = v as BacktestData | null
  return !!b && b.schemaVersion === 1 && typeof b.asOf === 'string' && !!b.markets && typeof b.markets === 'object' && Array.isArray(b.limitations)
}

function EquityChart({ m }: { m: BacktestMarket }): JSX.Element {
  const c = m.curve
  const values = c.flatMap(p => [p[1], p[2]]).filter(v => v > 0)
  const lo = Math.log(Math.min(...values)), hi = Math.log(Math.max(...values)), span = hi - lo || 1
  const x = (i: number) => 48 + i / Math.max(1, c.length - 1) * 740
  const y = (v: number) => 198 - (Math.log(v) - lo) / span * 180
  const line = (k: 1 | 2) => c.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')
  // 连续空仓周合并成一段阴影
  const shades: [number, number][] = []
  c.forEach((p, i) => { if (p[3] === 0) { const last = shades.at(-1); if (last && last[1] === i - 1) last[1] = i; else shades.push([i, i]) } })
  const ticks = [...new Set(c.map(p => p[0].slice(0, 4)))].filter((_, i, a) => a.length <= 8 || i % 2 === 0)
  const gridValues = [Math.min(...values), 1, Math.max(...values)].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)
  return (
    <figure className="cycle-bt-chart">
      <svg viewBox="0 0 800 228" role="img" aria-label={`${m.label} ${m.start} 至 ${m.end}：买入持有终值 ${c.at(-1)?.[1].toFixed(2)}，防守变体终值 ${c.at(-1)?.[2].toFixed(2)}（起点为 1，对数刻度）`}>
        {shades.map(([a, b]) => { const from = x(Math.max(0, a - 1)); return <rect key={a} x={from} y="14" width={Math.max(1, x(b) - from)} height="186" className="cycle-bt-chart__shade" /> })}
        {gridValues.map(v => <g key={v}><line x1="48" x2="788" y1={y(v)} y2={y(v)} className="cycle-bt-chart__grid" /><text x="42" y={y(v) + 4} textAnchor="end" className="cycle-bt-chart__tick">{v.toFixed(2)}</text></g>)}
        {ticks.map(t => { const i = c.findIndex(p => p[0].startsWith(t)); return <text key={t} x={x(i)} y="220" textAnchor="middle" className="cycle-bt-chart__tick">{t}</text> })}
        <path d={line(1)} className="cycle-bt-chart__bh" />
        <path d={line(2)} className="cycle-bt-chart__def" />
      </svg>
      <figcaption>
        <span><i className="cycle-bt-key cycle-bt-key--bh" />买入持有 {c.at(-1)?.[1].toFixed(2)}</span>
        <span><i className="cycle-bt-key cycle-bt-key--def" />防守变体 {c.at(-1)?.[2].toFixed(2)}</span>
        <span><i className="cycle-bt-key cycle-bt-key--shade" />空仓（趋势防守）</span>
        <span>起点 = 1，对数刻度，不含分红，0 成本</span>
      </figcaption>
    </figure>
  )
}

export function BacktestTables({ data, market }: { data: BacktestData; market: Market }): JSX.Element {
  const rows = MARKETS.flatMap(({ id }) => (data.markets[id] ? [[id, data.markets[id]!] as const] : []))
  const m = data.markets[market]
  const better = rows.filter(([, r]) => (r.defense.maxDrawdown ?? -1) > (r.buyHold.maxDrawdown ?? -1)).length
  const higher = rows.filter(([, r]) => (r.variants.lag1_cost10bp?.cagr ?? -1) > (r.buyHold.cagr ?? -1)).length
  return <>
    <p className="cycle-bt-summary">{rows.length} 个指数中，防守变体的最大回撤小于买入持有的有 <strong>{better}</strong> 个；计入每次切换 0.1% 成本后，年化收益高于买入持有的有 <strong>{higher}</strong> 个。降低回撤的代价是踏空反弹与频繁打脸，详见下表。</p>
    <div className="cycle-bt-table" role="region" aria-label="各指数回测统计" tabIndex={0}>
      <table>
        <thead>
          <tr><th rowSpan={2} scope="col">指数</th><th rowSpan={2} scope="col">区间</th><th colSpan={3} scope="colgroup">买入持有</th><th colSpan={3} scope="colgroup">防守变体（0 成本）</th><th colSpan={2} scope="colgroup">敏感性：年化</th><th rowSpan={2} scope="col">空仓时间</th><th rowSpan={2} scope="col">切换</th><th rowSpan={2} scope="col">打脸 / 完结防守</th></tr>
          <tr><th scope="col">年化</th><th scope="col">最大回撤</th><th scope="col">波动</th><th scope="col">年化</th><th scope="col">最大回撤</th><th scope="col">波动</th><th scope="col">0.1%/次</th><th scope="col">周一开盘成交</th></tr>
        </thead>
        <tbody>
          {rows.map(([id, r]) => (
            <tr key={id} className={id === market ? 'is-current' : undefined}>
              <th scope="row">{r.label}</th><td>{r.start.slice(0, 7)}～{r.end.slice(0, 7)}<small>{r.years} 年</small></td>
              <td>{signed(r.buyHold.cagr)}</td><td>{pct(r.buyHold.maxDrawdown)}</td><td>{pct(r.buyHold.volatility)}</td>
              <td>{signed(r.defense.cagr)}</td><td>{pct(r.defense.maxDrawdown)}</td><td>{pct(r.defense.volatility)}</td>
              <td>{signed(r.variants.lag1_cost10bp?.cagr)}</td><td>{signed(r.variants.lag0_cost10bp?.cagr)}</td>
              <td>{pct(r.timeInDefense, 0)}</td><td>{r.defense.switches}</td><td>{r.whipsaws} / {r.closedEpisodes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {m && <>
      <h4>{m.label}：进入趋势防守后的指数表现</h4>
      <div className="cycle-bt-table" role="region" aria-label={`${m.label}进入防守后的远期收益`} tabIndex={0}>
        <table>
          <thead>
            <tr><th rowSpan={2} scope="col">之后</th><th colSpan={4} scope="colgroup">进入防守那周起</th><th colSpan={3} scope="colgroup">对照：样本内所有周</th></tr>
            <tr><th scope="col">次数</th><th scope="col">中位数</th><th scope="col">四分位区间</th><th scope="col">下跌占比</th><th scope="col">中位数</th><th scope="col">平均</th><th scope="col">下跌占比</th></tr>
          </thead>
          <tbody>
            {data.horizons.map(h => { const f = m.forward[h]; if (!f) return null; const e = f.afterEntry, a = f.allWeeks
              return <tr key={h}><th scope="row">{h} 周</th><td>{e.n}{e.n < 30 && <small>样本少</small>}</td><td>{signed(e.median)}</td><td>{signed(e.p25)}～{signed(e.p75)}</td><td>{pct(e.negativeShare, 0)}</td><td>{signed(a.median)}</td><td>{signed(a.mean)}</td><td>{pct(a.negativeShare, 0)}</td></tr> })}
          </tbody>
        </table>
      </div>
      <p className="macro-muted">进入防守 {m.episodeCount} 次，其中持续不超过 4 周的 {m.shortEpisodes} 次，中位持续 {m.medianEpisodeWeeks ?? '—'} 周。若「进入防守后」的下跌占比与对照组接近，说明该信号本身对后续涨跌的区分度有限，作用主要体现在避开少数深跌段。</p>
    </>}
  </>
}

/** 牛熊周期页底部：趋势防守规则的样本内历史回测。 */
export default function CycleBacktest({ market }: { market: Market }): JSX.Element {
  const [data, setData] = useState<BacktestData | null | 'loading'>('loading')
  useEffect(() => {
    let alive = true
    fetch(`${import.meta.env.BASE_URL}data/market-cycle-backtest.json`, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then((body: unknown) => { if (alive) setData(validBacktest(body) ? body : null) })
    return () => { alive = false }
  }, [])
  const m = data && data !== 'loading' ? data.markets[market] : undefined
  return (
    <section className="cycle-section cycle-bt" aria-labelledby="cycle-bt-title">
      <h3 id="cycle-bt-title">规则回测：趋势防守（样本内）</h3>
      <p className="cycle-bt-caveat" role="note"><strong>只回测了一条规则，而且是样本内。</strong>检验的是「连续两周收于20周线下 → 趋势防守，收回即解除」：防守期间持现金（0% 收益），其余时间持有指数，与一直持有对比。估值、资金、宽度、流动性、海外五个维度及其组合状态都未回测。历史结果不代表未来，也不是交易建议。</p>
      {data === 'loading' && <p className="macro-muted">正在加载回测结果…</p>}
      {data === null && <p className="macro-muted">回测结果暂时无法加载。</p>}
      {data && data !== 'loading' && <>
        {m ? <EquityChart m={m} /> : <p className="macro-muted">该指数历史不足，暂无回测。</p>}
        <BacktestTables data={data} market={market} />
        <details className="cycle-bt-more"><summary>回测口径与局限</summary>
          <ul>{Object.entries(data.method).map(([k, v]) => <li key={k}>{v}</li>)}</ul>
          <p><strong>局限</strong></p>
          <ul>{data.limitations.map(t => <li key={t}>{t}</li>)}</ul>
          <p className="macro-muted">数据截至 {data.asOf}；规则版本 {data.ruleVersion}，回测版本 {data.version}。每周由 scripts/cycle-backtest.mjs 用同一份行情快照重算。</p>
        </details>
      </>}
    </section>
  )
}
