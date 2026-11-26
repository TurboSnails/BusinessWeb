import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/heat-liquidity.json'

function signed(value: number, digits = 3): string {
  const body = Math.abs(value).toFixed(digits)
  return value < 0 ? `−${body}` : `+${body}`
}
const pp = (v: number, digits = 1): string => signed(v * 100, digits)

const HEAT_ROWS: { id: keyof typeof data.heat; name: string; target: string }[] = [
  { id: 'N1', name: '纳指相对 200 日均线', target: '纳指' },
  { id: 'S1', name: '费城半导体相对 200 日均线', target: '费城半导体' },
  { id: 'N2', name: '科技股占美股市值', target: '科技股组合' },
  { id: 'S2', name: '电子设备（含半导体）占美股市值', target: '电子设备行业' },
]

export function NasdaqSemisHeatStudy(): JSX.Element {
  return (
    <article className="ss-section lab-study" id="lab-nasdaq-semis" aria-labelledby="lab-nasdaq-semis-title" data-testid="lab-nasdaq-semis">
      <p className="lab-status">2026-11-26 · 已完成 · L-032 · 四种口径都「没有预测力」 · 作为展示指标加入市场雷达</p>
      <h2 id="lab-nasdaq-semis-title">纳斯达克与半导体的「超配 / 过热」读数</h2>
      <div className="ss-cover lab-answer" data-testid="lab-heat-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          纳指、半导体过热或拥挤的时候，之后一年并没有更差，回撤也没有更深。科技股、电子设备的市值占比处在高位之后，收益反而略好（统计上不显著）。美银基金经理调查只有当期读数，无法检验。
        </p>
        <p className="ss-p">
          现在科技股占美股市值约 {fmtNum(data.heat.N2.current.value * 100, 1)}%、处在近十年最高附近；按这项研究，这本身不预示接下来一年更差。这几项已加进市场雷达的「科技与半导体」一组，只展示、不计分。
        </p>
      </div>
      <TableWrap label="四种口径的检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-heat-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">指标<span className="lab-th-sub">目标：自身未来 12 个月</span></th>
              <th scope="col" className="num">斜率<span className="lab-th-sub">为负才说明「热了会跌」</span></th>
              <th scope="col" className="num">随机平移 p<span className="lab-th-sub">下尾，越小越显著</span></th>
              <th scope="col" className="num">高位时收益差<span className="lab-th-sub">个百分点</span></th>
              <th scope="col" className="num">高位时最差点差<span className="lab-th-sub">正 = 跌得更浅</span></th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            {HEAT_ROWS.map(({ id, name }) => {
              const r = data.heat[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{name}<span className="lab-rule">{r.from.slice(0, 4)}–{r.to.slice(0, 4)}</span></th>
                  <td className="num">{signed(r.beta)}</td>
                  <td className="num">{fmtNum(r.pLower, 2)}</td>
                  <td className="num">{pp(r.dR)}</td>
                  <td className="num">{pp(r.dD)}</td>
                  <td><strong>{r.verdict}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>资管机构在纳指期货上的净多头（CFTC，2013 年起，样本短，只作探索）同样没有预测力。</li>
        <li>局限：电子设备行业比半导体口径宽；费城半导体的检验从 2000 年开始，第一段高位正是泡沫顶；真正的行业崩盘样本只有 2000 年一次左右。</li>
      </ul>
    </article>
  )
}

const LIQ_ROWS: { id: keyof typeof data.liquidity; name: string; rule: string }[] = [
  { id: 'Q1', name: '实际 M2 增速', rule: '实际同比 < 0 扣 1 分，> +4% 加 1 分' },
  { id: 'Q2', name: '美联储净流动性 13 周变化', rule: '≤ −2% 扣 1 分，≥ +2% 加 1 分（2003 年起）' },
]

export function LiquidityStudy(): JSX.Element {
  return (
    <article className="ss-section lab-study" id="lab-liquidity" aria-labelledby="lab-liquidity-title" data-testid="lab-liquidity">
      <p className="lab-status">2026-11-26 · 已完成 · L-033 · 两个都「不采用」 · 仓位规则不变</p>
      <h2 id="lab-liquidity-title">流动性能不能加进宏观攻守</h2>
      <div className="ss-cover lab-answer" data-testid="lab-liquidity-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          政策流动性本来就在宏观攻守里（「货币与流动性」支柱，看利率路径、实际利率、长短利差和金融条件）。再加货币数量（实际 M2）或美联储资产负债表（净流动性），规则反而变差，两个都「不采用」。
        </p>
        <p className="ss-p">
          净流动性的方向常常是反的：2008 年 10–12 月暴跌时美联储紧急扩表，它在加分；2009 年 3 月见底时扩表放缓，它在扣分。资产负债表扩张往往是危机的结果，不是买点。
        </p>
      </div>
      <TableWrap label="两个流动性候选的检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-liquidity-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">候选</th>
              <th scope="col" className="num">两段夏普<span className="lab-th-sub">基准 → 加入</span></th>
              <th scope="col" className="num">两段最大回撤<span className="lab-th-sub">基准 → 加入</span></th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            {LIQ_ROWS.map(({ id, name, rule }) => {
              const r = data.liquidity[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{name}<span className="lab-rule">{rule}</span></th>
                  <td className="num">{r.base.map((b, i) => `${fmtNum(b.sharpe)} → ${fmtNum(r.cand[i].sharpe)}`).join(' / ')}</td>
                  <td className="num">{r.base.map((b, i) => `${pct(b.maxDd)} → ${pct(r.cand[i].maxDd)}`).join(' / ')}</td>
                  <td><strong>{r.verdict}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>美联储净流动性、银行准备金在市场雷达里继续只展示。</li>
        <li>局限：美国 1973–2026 年已用过约 88 次，只能当弱证据；候选用修订值，比较略偏向候选，即便如此仍更差。</li>
      </ul>
    </article>
  )
}
