import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/rotation-heat.json'

function signed(value: number, digits = 3): string {
  const body = Math.abs(value).toFixed(digits)
  return value < 0 ? `−${body}` : `+${body}`
}
const pp = (v: number, digits = 1): string => signed(v * 100, digits)

const MOM_ROWS: { id: keyof typeof data.momentum; name: string; bench: string }[] = [
  { id: 'C1', name: '美国 / 海外二选一', bench: '美国、海外各一半' },
  { id: 'C2', name: '14 个市场挑最强 5 个', bench: '14 个市场等权' },
]

const VS_US: { id: keyof typeof data.vsUS; name: string }[] = [
  { id: 'C1', name: '美国 / 海外二选一' },
  { id: 'B1', name: '美国、海外各一半' },
  { id: 'C2', name: '挑最强 5 个' },
  { id: 'B2', name: '14 个市场等权' },
]

export function CountryMomentumStudy(): JSX.Element {
  const ex = data.explore
  return (
    <article className="ss-section lab-study" id="lab-country-momentum" aria-labelledby="lab-country-momentum-title" data-testid="lab-country-momentum">
      <p className="lab-status">2026-11-26 · 已完成 · L-034 · 二选一「不通过」（打平）、挑最强「不稳定」 · 方案不变</p>
      <h2 id="lab-country-momentum-title">跨国动量轮动：在美国和海外之间切换有没有用</h2>
      <div className="ss-cover lab-answer" data-testid="lab-momentum-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          每月看过去一年谁涨得多就持有谁，1978–2025 年没有比固定持有更好：美国 / 海外二选一和各持一半打平；在 14 个发达市场里挑最强的 5 个，2001 年以前有效，之后反而更差。2014 年以后，一直只持有美国比任何轮动都好。
        </p>
        <p className="ss-p">
          方案维持「宽基指数、不在国家之间轮动」。想配海外，固定比例比按动量切换省心，交易成本和税也更低。
        </p>
      </div>
      <TableWrap label="两种轮动的检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-momentum-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">候选<span className="lab-th-sub">对照</span></th>
              <th scope="col" className="num">夏普<span className="lab-th-sub">候选 / 对照</span></th>
              <th scope="col" className="num">年化<span className="lab-th-sub">候选 / 对照</span></th>
              <th scope="col" className="num">两半夏普差<span className="lab-th-sub">1978–2001 / 2002–2025</span></th>
              <th scope="col" className="num">2014 年后<span className="lab-th-sub">夏普差</span></th>
              <th scope="col" className="num">随机平移 p<span className="lab-th-sub">Holm 校正后</span></th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            {MOM_ROWS.map(({ id, name, bench }) => {
              const r = data.momentum[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{name}<span className="lab-rule">对照：{bench}</span></th>
                  <td className="num">{fmtNum(r.full.cand.sharpe)} / {fmtNum(r.full.bench.sharpe)}</td>
                  <td className="num">{pct(r.full.cand.cagr)} / {pct(r.full.bench.cagr)}</td>
                  <td className="num">{signed(r.half1.dS)} / {signed(r.half2.dS)}</td>
                  <td className="num">{signed(r.post2014.dS)}</td>
                  <td className="num">{fmtNum(r.pHolm, 2)}</td>
                  <td><strong>{r.verdict}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <h3 className="ss-h3">和「一直只持有美国」比</h3>
      <p className="ss-p">美国 1978–2025 年夏普 {fmtNum(data.usOnly.sharpe)}、年化 {pct(data.usOnly.cagr)}。下表是各组合减去只持有美国的夏普差：</p>
      <TableWrap label="相对只持有美国的夏普差" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-momentum-vsus">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">组合</th>
              <th scope="col" className="num">全样本</th>
              <th scope="col" className="num">1978–2001</th>
              <th scope="col" className="num">2002–2025</th>
              <th scope="col" className="num">2014–2025</th>
            </tr>
          </thead>
          <tbody>
            {VS_US.map(({ id, name }) => {
              const v = data.vsUS[id]
              return (
                <tr key={id}>
                  <th scope="row" className="lab-sticky">{name}</th>
                  <td className="num">{signed(v.full)}</td>
                  <td className="num">{signed(v.half1)}</td>
                  <td className="num">{signed(v.half2)}</td>
                  <td className="num">{signed(v.post2014)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>海外换成市值加权（更接近能买到的海外宽基，1991 年起）：二选一比各持一半夏普高 {fmtNum(ex.devx.dS)}，但仍比只持有美国低 {fmtNum(Math.abs(ex.devx.vsUS))}。</li>
        <li>加「两边都跑输国库券就持有现金」：2014 年以后夏普差 {signed(ex.absolute.dSpost)}，现金月几乎都出现在下跌之后，错过了随后的反弹。</li>
        <li>不计交易成本时，二选一 {signed(ex.cost0.C1)}、挑最强 {signed(ex.cost0.C2)}；轮动每年换手 1.4–2.4 倍，还会触发资本利得税。</li>
        <li>局限：美国是全市场口径、其他国家是 MSCI 口径；13 个海外国家是按今天的发达市场挑的；前三分之二样本与动量文献重叠。</li>
      </ul>
    </article>
  )
}

const HEAT_ROWS: { id: keyof typeof data.heat; name: string }[] = [
  { id: 'R1', name: '罗素 2000 相对 200 日均线' },
  { id: 'H1', name: '恒生指数相对 200 日均线' },
  { id: 'A1', name: '上证综指相对 200 日均线' },
  { id: 'E1', name: '能源占美股市值' },
  { id: 'F1', name: '金融占美股市值' },
]

export function HeatMoreStudy(): JSX.Element {
  const p = data.p49
  return (
    <article className="ss-section lab-study" id="lab-heat-more" aria-labelledby="lab-heat-more-title" data-testid="lab-heat-more">
      <p className="lab-status">2026-11-26 · 已完成 · L-035 · 五个读数都「没有预测力」、49 个行业「方向偏负、不显著」 · 作为展示指标加入市场雷达</p>
      <h2 id="lab-heat-more-title">更多「过热 / 超配」读数：小盘、港股、A 股、能源、金融与 49 个行业</h2>
      <div className="ss-cover lab-answer" data-testid="lab-heat-more-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          罗素 2000、恒生、上证远高于 200 日均线时，之后一年并不更差；能源、金融占美股市值处在高位时也一样。全部 49 个行业放在一起，平均斜率略为负，但远不显著。和纳指、半导体的结论相同：「热」是值得知道的背景，不能用来择时。
        </p>
        <p className="ss-p">
          唯一的影子是崩盘频率：行业占比处在高位时，之后一年中途跌三成以上的频率从 {pct(p.crash30.rest)} 升到 {pct(p.crash30.top)}，略高，但幅度很小。
        </p>
      </div>
      <TableWrap label="五个读数的检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-heat-more-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">指标<span className="lab-th-sub">目标：自身未来 12 个月</span></th>
              <th scope="col" className="num">斜率<span className="lab-th-sub">为负才说明「热了会跌」</span></th>
              <th scope="col" className="num">随机平移 p<span className="lab-th-sub">下尾</span></th>
              <th scope="col" className="num">高位时收益差<span className="lab-th-sub">个百分点</span></th>
              <th scope="col" className="num">当前<span className="lab-th-sub">近十年百分位</span></th>
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
                  <td className="num">{pct(r.current.value, 1, id !== 'E1' && id !== 'F1')}（{Math.round(r.current.pct * 100)}%）</td>
                  <td><strong>{r.verdict}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p" data-testid="lab-heat-more-p49">
        49 个行业一起看（{p.from.slice(0, 4)}–{p.to.slice(0, 4)}）：平均斜率 {signed(p.betaBar)}，随机平移 p {fmtNum(p.pLower, 2)}，{p.nNeg} / {p.industries} 个行业为负，判「{p.verdict}」。
      </p>
      <ul className="ss-list">
        <li>上证高位之后反而平均更好，几乎全部来自 2006–07 年一段，其余 6 段里 4 段之后是跌的，很不稳定。</li>
        <li>能源、金融是因为 1980、2007 年的著名泡沫挑出来的，挑选本身偏向「热了会跌」，结果仍几乎为零；行业层面以 49 个行业一起检验为准。</li>
        <li>1926–1973 年的行业占比没有计算，留作以后确认用的干净数据。</li>
      </ul>
    </article>
  )
}
