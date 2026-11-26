import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/trend-momentum.json'

function signed(value: number, digits = 3): string {
  const body = Math.abs(value).toFixed(digits)
  return value < 0 ? `−${body}` : `+${body}`
}

const ROWS: { id: keyof typeof data.main; name: string; rule: string }[] = [
  { id: 'T1', name: '趋势 + 动量', rule: '按 3/6/12 个月动量选前 2 类，各 50%；破十个月均线的那一半改放现金' },
  { id: 'T2', name: '只看趋势', rule: '四类各 25%；破十个月均线的改放现金' },
]

const BEAR_COLS: { id: 'US' | 'B' | 'T1' | 'T2'; name: string }[] = [
  { id: 'US', name: '美股' },
  { id: 'B', name: '四类等权' },
  { id: 'T1', name: '趋势 + 动量' },
  { id: 'T2', name: '只看趋势' },
]

export default function TrendMomentumStudy(): JSX.Element {
  const t1 = data.main.T1
  const t2 = data.main.T2
  return (
    <article className="ss-section lab-study" id="lab-trend-momentum" aria-labelledby="lab-trend-momentum-title" data-testid="lab-trend-momentum">
      <p className="lab-status">2026-11-26 · 已完成 · L-036 · 两个都「不稳定」 · 不新开页签，方案不变</p>
      <h2 id="lab-trend-momentum-title">多资产「趋势 + 动量」轮动：美股、海外股、国债、黄金</h2>
      <div className="ss-cover lab-answer" data-testid="lab-tm-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          这是目前最接近成立的一次：两个写法在随机时机检验里都显著，2000–02、2008 年的大熊市里甚至还在赚钱。但各卡在一道稳健性门槛上：「趋势 + 动量」晚一个月执行就比基准差，「只看趋势」2010 年以后一直落后。按事先的规则判「不稳定」，不新开页签，方案不变。
        </p>
        <p className="ss-p">
          另外，「只看趋势」后半段的好处主要来自对股票的均线过滤，和十个月均线的研究是同一份证据；现行方案已经用宏观攻守和 80% 上限防大熊市，所以这里没有足够的新增证据去改方案。
        </p>
      </div>
      <TableWrap label="两个写法的检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-tm-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">写法<span className="lab-th-sub">基准：四类各 25%</span></th>
              <th scope="col" className="num">夏普<span className="lab-th-sub">候选 / 基准</span></th>
              <th scope="col" className="num">年化<span className="lab-th-sub">候选 / 基准</span></th>
              <th scope="col" className="num">最大回撤<span className="lab-th-sub">候选 / 基准</span></th>
              <th scope="col" className="num">2010 年后<span className="lab-th-sub">夏普差</span></th>
              <th scope="col" className="num">晚一个月执行<span className="lab-th-sub">夏普差</span></th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ id, name, rule }) => {
              const r = data.main[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{name}<span className="lab-rule">{rule}</span></th>
                  <td className="num">{fmtNum(r.cand.sharpe)} / {fmtNum(r.bench.sharpe)}</td>
                  <td className="num">{pct(r.cand.cagr)} / {pct(r.bench.cagr)}</td>
                  <td className="num">{pct(r.cand.maxDd)} / {pct(r.bench.maxDd)}</td>
                  <td className="num">{signed(r.dS.post2010)}</td>
                  <td className="num">{signed(r.dS.delay)}</td>
                  <td><strong>{r.verdict}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">
        1978–2025 年，576 个月，扣交易成本与持有费。随机平移检验 Holm 校正后 p 都是 {fmtNum(t1.pHolm, 3)}；两半夏普差：趋势 + 动量 {signed(t1.dS.half1)} / {signed(t1.dS.half2)}，只看趋势 {signed(t2.dS.half1)} / {signed(t2.dS.half2)}。
      </p>
      <h3 className="ss-h3">美股大熊市里（高点到低点）</h3>
      <TableWrap label="美股大熊市里的区间收益" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-tm-bears">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">时段</th>
              {BEAR_COLS.map(c => <th key={c.id} scope="col" className="num">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.bears.map(b => (
              <tr key={b.from}>
                <th scope="row" className="lab-sticky">{b.from} → {b.to}</th>
                {BEAR_COLS.map(c => <td key={c.id} className="num">{pct(b[c.id], 1, true)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>按两个写法的平均权重固定持有，夏普只比基准高 {fmtNum(data.explore.fixedAvg.T1)}、{fmtNum(data.explore.fixedAvg.T2)}：好处几乎全部来自择时，不是长期多配了哪类资产。</li>
        <li>2010–2025 年只持有美股：夏普 {fmtNum(data.refs.US.post2010.sharpe)}、年化 {pct(data.refs.US.post2010.cagr)}；趋势 + 动量 {fmtNum(data.refs.T1.post2010.sharpe)}、{pct(data.refs.T1.post2010.cagr)}；只看趋势 {fmtNum(data.refs.T2.post2010.sharpe)}、{pct(data.refs.T2.post2010.cagr)}。</li>
        <li>趋势 + 动量对执行时点很敏感：晚一个月，1987、2009–2011、2020 年都多亏不少；月末信号必须几天内执行。</li>
        <li>局限：黄金 2000–2004 年是期货价、更早有插值；国债是 5 年期收益率换算的；基准里黄金占 25%，不是现在的持仓；2004 年以前没有黄金 ETF；轮动会产生税费。</li>
      </ul>
    </article>
  )
}
