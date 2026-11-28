import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum, fmtPct } from './LabTable'
import data from './data/liquidity-defense.json'

const signed = (v: number, digits = 3): string => (v < 0 ? `−${Math.abs(v).toFixed(digits)}` : `+${v.toFixed(digits)}`)
const ROWS = [
  { id: 'C1', name: 'C1 跌停潮', rule: '当天跌停股 ≥ 5% → 仓位降到 50%，持续 20 个交易日' },
  { id: 'C2', name: 'C2 冲击成本飙升', rule: '全市场冲击成本（Amihud）≥ 前 250 日中位数的 2 倍，且大盘跌破 20 日线 → 同样减仓' },
] as const

export default function LiquidityDefenseStudy(): JSX.Element {
  const c1 = data.candidates.C1
  const f1 = data.report.C1.forward
  return (
    <article className="ss-section lab-study" id="lab-liquidity-defense" aria-labelledby="lab-liquidity-defense-title" data-testid="lab-liquidity-defense">
      <p className="lab-status">2026-11-28 · 已完成 · L-047 · C1「{c1.verdict}」、C2「{data.candidates.C2.verdict}」 · 不改仓位规则</p>
      <h2 id="lab-liquidity-defense-title">A 股流动性踩踏防守：跌停潮、冲击成本飙升时减仓</h2>
      <div className="ss-cover lab-answer" data-testid="lab-liquidity-defense-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          出现跌停潮（当天 5% 以上股票跌停）就把 A 股仓位降到一半、持续一个月：2006–2023 年夏普从 {fmtNum(c1.sharpeB0)} 升到 {fmtNum(c1.sharpe)}，最大回撤从 {fmtPct(c1.maxddB0)} 收窄到 {fmtPct(c1.maxdd)}，前后两段都有效；但时机检验不显著，只判「部分成立」。
        </p>
        <p className="ss-p">
          流动性踩踏是 A 股特有的下跌方式：大量股票同时封跌停、想卖卖不出，杠杆资金被迫平仓。这里只用全市场汇总量（跌停家数、冲击成本），不选股。t 日收盘出信号，t+1 日收盘调仓，仓位变动扣 0.1%。2023-11 以后的数据留到 12 月锁箱解封后再看。
        </p>
      </div>
      <TableWrap label="两种写法的检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-liquidity-defense-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">写法</th>
              <th scope="col" className="num">夏普<span className="lab-th-sub">策略 / 满仓 / 同平均仓位</span></th>
              <th scope="col" className="num">最大回撤<span className="lab-th-sub">策略 / 满仓 / 同平均仓位</span></th>
              <th scope="col" className="num">大跌段损失比<span className="lab-th-sub">对同平均仓位，须 ≤ 0.90</span></th>
              <th scope="col" className="num">两段夏普差</th>
              <th scope="col" className="num">时机检验 p<span className="lab-th-sub">Holm，须 ≤ 0.10</span></th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ id, name, rule }) => {
              const c = data.candidates[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{name}<span className="lab-rule">{rule}</span></th>
                  <td className="num">{fmtNum(c.sharpe)} / {fmtNum(c.sharpeB0)} / {fmtNum(c.sharpeBc)}</td>
                  <td className="num">{fmtPct(c.maxdd)} / {fmtPct(c.maxddB0)} / {fmtPct(c.maxddBc)}</td>
                  <td className="num">{fmtNum(c.L)}</td>
                  <td className="num">{signed(c.halves[0])} / {signed(c.halves[1])}</td>
                  <td className="num">{fmtNum(c.pHolm)}</td>
                  <td><strong>{c.verdict}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <h3 className="ss-h3">C1 在各次大跌里</h3>
      <TableWrap label="大跌段跌幅" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-liquidity-defense-episodes">
          <thead><tr><th scope="col" className="lab-sticky">大跌段（大盘峰谷 ≥ 20%）</th><th scope="col" className="num">C1</th><th scope="col" className="num">同平均仓位</th></tr></thead>
          <tbody>
            {c1.episodes.map(e => (
              <tr key={e.from}><th scope="row" className="lab-sticky">{e.from} 至 {e.to}</th><td className="num">{fmtPct(e.cand)}</td><td className="num">{fmtPct(e.bc)}</td></tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>跌停潮常在恐慌顶点出现：每段第一次触发后，大盘 20 个交易日平均反而上涨 {fmtPct(f1['20'].mean)}，60 日 {fmtPct(f1['60'].mean)}（2020-02-03 当天几乎是底）。它有用，是因为 2008、2015 年这类连续多波下跌里，减仓一个月躲过了后面几波，而不是因为每次都卖对。</li>
        <li>平均仓位 {Math.round(c1.avgExposure * 100)}%。和一直放 {Math.round(c1.avgExposure * 100)}% 相比，夏普更高、回撤浅 {fmtNum((c1.maxdd - c1.maxddBc) * 100, 1)} 个百分点，所以不只是「少买一点」。</li>
        <li>时机检验的原始 p 是 {fmtNum(c1.p)}，Holm 校正后 {fmtNum(c1.pHolm)}，没到 0.10。18 年里只有几次真正的流动性危机，统计上很难证实。</li>
        <li>C2 冲击成本飙升：2015 年以后变差（后半夏普差 {signed(data.candidates.C2.halves[1])}），大跌段几乎没少亏。</li>
        <li>按规则放在「研究中」，不改仓位规则。2023-11 以后的数据等 12 月锁箱解封后只读一次；90 天内（2027-02-26 前）不试阈值、持续天数、减仓比例的变体。</li>
      </ul>
    </article>
  )
}
