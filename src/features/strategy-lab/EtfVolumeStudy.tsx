import React from 'react'
import { TableWrap } from '../../components/ui'
import data from './data/etf-volume.json'

type Id = 'V1' | 'V2' | 'V3'
const ROWS: { id: Id; rule: string }[] = [
  { id: 'V1', rule: '金叉时 5 日平均成交额 ≥ 20 日平均才买' },
  { id: 'V2', rule: '持仓中放量（≥ 20 日平均 1.5 倍）下跌且跌破 20 日线，提前卖' },
  { id: 'V3', rule: '20 日平均成交额处在过去一年最高 5% 时不开新仓' },
]

function signed(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (Math.abs(value) < 0.05) return '0.0'
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`
}

export default function EtfVolumeStudy(): JSX.Element {
  const base = data.summary.base
  const v1 = data.decision.V1
  return (
    <article className="ss-section lab-study" id="lab-etf-volume" aria-labelledby="lab-etf-volume-title" data-testid="lab-etf-volume">
      <p className="lab-status">2026-11-25 · 已完成 · 不改规则</p>
      <h2 id="lab-etf-volume-title">A 股 ETF 择时加成交量：没有帮助</h2>

      <div className="ss-cover lab-answer" data-testid="lab-etf-volume-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          三种成交量条件都没有让「择时 + 只认金叉」更好：要求放量才买明显更差，另外两种几乎没有差别。规则维持不加成交量。
        </p>
      </div>

      <p className="ss-p">
        15 个中证全收益指数，2011 年起，与 v0.1 完全相同的规则和成本，只多一个成交额条件（取指数自身的每日成交额）。判定沿用之前 R1、KD10 检验的写法：「两项都过」（三段大跌回撤不超过一直持有的 70%、全期年化不低于一直持有减 1 个百分点）的指数要多 2 个以上，且全期和 2011—2018 年的年化中位差都不为负，才算更好。基线 {base.both}/15。
      </p>
      <TableWrap label="三个成交量条件的结果">
        <table className="cs-table" data-testid="lab-etf-volume-table">
          <thead>
            <tr>
              <th scope="col">条件</th>
              <th scope="col" className="num">两项都过</th>
              <th scope="col" className="num">全期年化中位差</th>
              <th scope="col" className="num">2011—2018 中位差</th>
              <th scope="col" className="num">平均持仓时间</th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            <tr className="is-highlight">
              <th scope="row">v0.1 基线（不加成交量）</th>
              <td className="num">{base.both}/15</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">{(data.exposure.base * 100).toFixed(0)}%</td>
              <td>—</td>
            </tr>
            {ROWS.map(row => {
              const d = data.decision[row.id]
              return (
                <tr key={row.id}>
                  <th scope="row">{row.id} {d.label}<span className="lab-rule">{row.rule}</span></th>
                  <td className="num">{data.summary[row.id].both}/15</td>
                  <td className="num">{signed(d.medianFullAnnualDiff)} 个百分点</td>
                  <td className="num">{signed(d.medianOosAnnualDiff)} 个百分点</td>
                  <td className="num">{(data.exposure[row.id] * 100).toFixed(0)}%</td>
                  <td>{d.text}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>
          V1 更差的原因：金叉多出现在一段回调之后，那时成交通常还在萎缩，要求放量就把大部分金叉挡掉了，持仓时间从 {(data.exposure.base * 100).toFixed(0)}% 降到 {(data.exposure.V1 * 100).toFixed(0)}%。回撤是浅了（中位浅 {v1.medianFullDdDiff.toFixed(1)} 个百分点），但年化中位少 {Math.abs(v1.medianFullAnnualDiff).toFixed(1)} 个百分点，「两项都过」从 {base.both} 个降到 {data.summary.V1.both} 个。
        </li>
        <li>V2 很少改变结果：放量破位时，MACD 往往一两天内也会死叉，只是提前一点卖。</li>
        <li>V3 偶尔挡掉过热时的进场，年化中位略少，没有改善回撤。</li>
      </ul>
      <p className="ss-note" role="note">
        数据说明：本次重新从中证官网取数，{data.dataMismatch.join('、')} 三个指数在 2011—2018 年个别交易日的收盘与 11 月 15 日取到的不同（一直持有的收益和回撤一致，个别金叉日期改变），所以这三个指数的基线数字与 v0.1 原检验略有出入。候选都与用同一份新数据重算的基线比较。这一点在算候选结果之前写进了预注册修订。
        预注册、脚本与结果在 docs/research/etf-volume-2026-11-25/。
      </p>
    </article>
  )
}
