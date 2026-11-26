import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import data from './data/defensive-trend.json'

const NAMES: Record<string, string> = {
  Australia: '澳大利亚', Belgium: '比利时', Canada: '加拿大', Denmark: '丹麦', France: '法国', Germany: '德国', Italy: '意大利',
  Japan: '日本', Netherlands: '荷兰', Norway: '挪威', Spain: '西班牙', Sweden: '瑞典', Switzerland: '瑞士', UK: '英国',
}

/** 小数 → 带符号的「个百分点」：−0.014 → −1.4 */
function pp(value: number | null, digits = 1): string {
  if (value == null) return '—'
  const body = Math.abs(value * 100).toFixed(digits)
  return value < 0 ? `−${body}` : `+${body}`
}
function signed(value: number, digits = 3): string {
  const body = Math.abs(value).toFixed(digits)
  return value < 0 ? `−${body}` : `+${body}`
}
const mark = (ok: boolean | undefined): string => (ok == null ? '' : ok ? ' ✓' : ' ✗')

function MainTable(): JSX.Element {
  const { C1, C2 } = data
  const rows: { key: string; head: string; sub?: string; c1: string; c2: string }[] = [
    { key: 'dS', head: '合并夏普差（对全放现金）', sub: 'G1 ≥ +0.03；括号内为欧元区并 1 后的 9 单元', c1: `${signed(C1.dS)}（${signed(C1.dSUnits)}）${mark(C1.gates.G1)}`, c2: `${signed(C2.dS)}（${signed(C2.dSUnits)}）${mark(C2.gates.G1)}` },
    { key: 'pos', head: '为正的国家 / 单元', sub: 'G2', c1: `${Math.round(C1.positiveShare * data.countries)}/${data.countries} · ${C1.positiveUnits}/${C1.units}${mark(C1.gates.G2)}`, c2: `${Math.round(C2.positiveShare * data.countries)}/${data.countries} · ${C2.positiveUnits}/${C2.units}${mark(C2.gates.G2)}` },
    { key: 'rising', head: '利率上行月里相对现金', sub: 'G3 ≥ −0.5 个百分点/年', c1: `${pp(C1.rising)}${mark(C1.gates.G3)}`, c2: `${pp(C2.rising)}${mark(C2.gates.G3)}` },
    { key: 'dedrift', head: '去掉债券牛市后的择时价值', sub: 'G4 ≥ 0', c1: `${signed(C1.dedrift)}${mark(C1.gates.G4)}`, c2: '—' },
    { key: 'halves', head: '前段（≤ 2000）/ 后段', sub: 'G5 都 > 0', c1: `${signed(C1.first)} / ${signed(C1.second)}${mark(C1.gates.G5)}`, c2: `${signed(C2.first)} / ${signed(C2.second)}${mark(C2.gates.G5)}` },
    { key: 'placebo', head: '随机时机安慰剂 p', sub: 'G6 ≤ 0.05', c1: `${fmtNum(C1.placeboP)}${mark(C1.gates.G6)}`, c2: '—' },
  ]
  return (
    <TableWrap label="14 国合并判定" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-deftrend-main">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">指标</th>
            <th scope="col" className="num">C1 趋势债券<span className="lab-th-sub">跌破十个月均线换现金</span></th>
            <th scope="col" className="num">C2 一直债券<span className="lab-th-sub">10 年期国债</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <th scope="row" className="lab-sticky">{r.head}{r.sub ? <span className="lab-rule">{r.sub}</span> : null}</th>
              <td className="num">{r.c1}</td>
              <td className="num">{r.c2}</td>
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
  )
}

function CountryTable(): JSX.Element {
  return (
    <TableWrap label="各国结果" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-deftrend-countries">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">国家</th>
            <th scope="col" className="num">C1 夏普差</th>
            <th scope="col" className="num">C1 上行月<span className="lab-th-sub">个百分点/年</span></th>
            <th scope="col" className="num">C2 夏普差</th>
            <th scope="col" className="num">C2 上行月<span className="lab-th-sub">个百分点/年</span></th>
          </tr>
        </thead>
        <tbody>
          {data.perCountry.map(c => (
            <tr key={c.id}>
              <th scope="row" className="lab-sticky">{NAMES[c.id] ?? c.id}<span className="lab-rule">{c.from.slice(0, 4)}–{c.to.slice(0, 4)}</span></th>
              <td className="num">{signed(c.C1.dS)}</td>
              <td className="num">{pp(c.C1.rising)}</td>
              <td className="num">{signed(c.C2.dS)}</td>
              <td className="num">{pp(c.C2.rising)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function DefensiveTrendStudy(): JSX.Element {
  const { C1, C2 } = data
  return (
    <article className="ss-section lab-study" id="lab-defensive-trend" aria-labelledby="lab-defensive-trend-title" data-testid="lab-defensive-trend">
      <p className="lab-status">2026-11-26 · 已完成 · {data.ledger} · 趋势债券「{C1.verdict}」，一直债券「{C2.verdict}」 · 防守部分继续放现金</p>
      <h2 id="lab-defensive-trend-title">防守部分放债券、但债券也看十个月均线</h2>

      <div className="ss-cover lab-answer" data-testid="lab-deftrend-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          债券上的趋势择时确实有价值，但没能解决「利率上行期吃亏」这个老问题，按预注册判「{C1.verdict}」。
          {data.countries} 个国家全部比放现金好（夏普 {signed(C1.dS)}），随机时机检验显著（p {fmtNum(C1.placeboP)}）；
          但利率上行的月份里，组合每年仍比现金少 {pp(C1.rising).replace('−', '')} 个百分点（一直放债券少 {pp(C2.rising).replace('−', '')}）。
        </p>
        <p className="ss-p">趋势过滤把加息期的亏损砍掉一半多，但按月看、再滞后两个月才换仓，来不及应对快速加息。防守部分继续放现金或 1 年以内的短期国债。</p>
      </div>

      <h3 className="ss-h3">为什么做</h3>
      <p className="ss-p">
        之前两次「防守部分放债券」（L-015、L-021）都输在 1970 年代末和 2022 年这类利率上行期。这次检验最有名的低频量化办法之一，时间序列趋势，用在债券上：债券总收益跌破十个月均线就换现金。
        美国 1973 年以后的数据按规则 2027 年 2 月前不能再测这类变体，所以用从没动过的 14 个发达国家本币股债数据（1975–2025）。
      </p>
      <MainTable />

      <h3 className="ss-h3">各国</h3>
      <p className="ss-p">覆盖 1970 年代末加息期的老样本国家，趋势债券在上行月里多少亏 1.2–2.5 个百分点/年：真正的快速加息，它只能少亏，不能不亏。</p>
      <CountryTable />

      <h3 className="ss-h3">结论与局限</h3>
      <ul className="ss-list">
        <li>不进影子记录，不改规则。「放长期债券」的好处有一部分来自 1981–2020 年收益率长期下行，未来未必重复。</li>
        <li>没有检验中短久期债券，不据此推荐。</li>
        <li>局限：OECD 收益率多为月均值；欧元区 6 国 1999 年后不独立（已用 9 个单元同时把关）；锁箱的启用条件是本次改变的，用掉后不再是锁箱。</li>
      </ul>
    </article>
  )
}
