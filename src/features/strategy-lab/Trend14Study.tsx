import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/trend-14.json'

const NAMES: Record<string, string> = {
  Australia: '澳大利亚', Belgium: '比利时', Canada: '加拿大', Denmark: '丹麦', France: '法国', Germany: '德国', Italy: '意大利',
  Japan: '日本', Netherlands: '荷兰', Norway: '挪威', Spain: '西班牙', Sweden: '瑞典', Switzerland: '瑞士', UK: '英国',
}
function signed(value: number, digits = 2): string {
  const body = Math.abs(value).toFixed(digits)
  return value < 0 ? `−${body}` : `+${body}`
}
const mark = (ok: boolean): string => (ok ? ' ✓' : ' ✗')

type Cand = typeof data.C1
const ROWS: { key: string; head: string; sub?: string; cell: (c: Cand) => string }[] = [
  { key: 'L', head: '合并跌幅比 L', sub: 'G1：括号内为门槛 L*', cell: c => `${fmtNum(c.L)}（${fmtNum(c.Lstar)}）${mark(c.gates.G1)}` },
  { key: 'wins', head: '逐段胜出', cell: c => pct(c.wins, 0) },
  { key: 'dE', head: '全周期 ΔE / 逐段为正', sub: 'G2：为正须 ≥ 62.5%', cell: c => `${signed(c.dE)} / ${pct(c.posE, 0)}${mark(c.gates.G2)}` },
  { key: 'halves', head: '前段（≤ 2000）全周期 ΔE', sub: 'G4', cell: c => `${signed(c.halves.first.dE)}${mark(c.gates.G4)}` },
  { key: 'p', head: '安慰剂 p（Holm）', sub: `G5：${data.shifts} 种共同平移`, cell: c => `${fmtNum(c.pHolm)}${mark(c.gates.G5)}` },
  { key: 'sw', head: '年切换次数', sub: 'G7 ≤ 1.5', cell: c => `${fmtNum(c.switchesPerYear, 2)}${mark(c.gates.G7)}` },
  { key: 'lag2', head: '晚一个月执行 L / ΔE', sub: 'G9：ΔE 须 ≥ 0', cell: c => `${fmtNum(c.lag2.L)} / ${signed(c.lag2.dE)}${mark(c.gates.G9)}` },
]

export default function Trend14Study(): JSX.Element {
  const { C1, C2 } = data
  return (
    <article className="ss-section lab-study" id="lab-trend-14" aria-labelledby="lab-trend-14-title" data-testid="lab-trend-14">
      <p className="lab-status">2026-11-26 · 已完成 · {data.ledger} · 两种写法都「{C1.verdict}」 · 仓位规则不变</p>
      <h2 id="lab-trend-14-title">十个月均线：14 个发达国家的确认检验</h2>

      <div className="ss-cover lab-answer" data-testid="lab-trend14-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          时机确实有信息，但作用太小，而且怕慢。{data.countries} 国全部少跌，随机平移检验显著（p {fmtNum(C1.pHolm)}）；
          但 {C1.n} 次熊市里现行写法只少跌约 {Math.round((1 - C1.L) * 100)}%，全周期只有约一半算下来是赚的，晚一个月执行就变成亏钱。两种写法按预注册都「不通过」。
        </p>
        <p className="ss-p">
          和美国 1872–1934 年的结果（L 0.967）几乎一样：效果真实、稳定，但很小。最终方案的退路因此从「上限 + 十个月均线」改成「只保留上限」。
        </p>
      </div>

      <TableWrap label="14 国合并判定" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-trend14-main">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">指标</th>
              <th scope="col" className="num">C1 现行<span className="lab-th-sub">破位 85% → 70%</span></th>
              <th scope="col" className="num">C2 破位封顶<span className="lab-th-sub">破位 85% → 50%</span></th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(r => (
              <tr key={r.key}>
                <th scope="row" className="lab-sticky">{r.head}{r.sub ? <span className="lab-rule">{r.sub}</span> : null}</th>
                <td className="num">{r.cell(C1)}</td>
                <td className="num">{r.cell(C2)}</td>
              </tr>
            ))}
            <tr className="is-base">
              <th scope="row" className="lab-sticky">结论</th>
              <td className="num"><strong>{C1.verdict}</strong></td>
              <td className="num"><strong>{C2.verdict}</strong></td>
            </tr>
          </tbody>
        </table>
      </TableWrap>

      <h3 className="ss-h3">各国（现行写法）</h3>
      <TableWrap label="各国结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-trend14-countries">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">国家</th>
              <th scope="col" className="num">熊市数</th>
              <th scope="col" className="num">L</th>
              <th scope="col" className="num">逐段胜出</th>
              <th scope="col" className="num">全周期 ΔE</th>
              <th scope="col" className="num">C2 的 L</th>
            </tr>
          </thead>
          <tbody>
            {data.perCountry.map(c => (
              <tr key={c.id}>
                <th scope="row" className="lab-sticky">{NAMES[c.id] ?? c.id}</th>
                <td className="num">{c.n}</td>
                <td className="num">{fmtNum(c.L)}</td>
                <td className="num">{pct(c.wins, 0)}</td>
                <td className="num">{signed(c.dE, 3)}</td>
                <td className="num">{fmtNum(c.L2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <h3 className="ss-h3">结论与局限</h3>
      <ul className="ss-list">
        <li>仓位规则不变：十个月均线修正仍是现行规则的一部分，作用小但方向稳定。破位封顶 50% 继续只在影子记录里观察。</li>
        <li>从未进过任何计算的新增样本（{data.fresh.C1.n} 次熊市）结果一样：L {fmtNum(data.fresh.C1.L)}。</li>
        <li>局限：信号用月末含息指数、次月执行，比现行规则偏乐观；晚一个月执行是偏悲观的另一端。数据在上一项研究里作为组合股票腿用过。</li>
      </ul>
    </article>
  )
}
