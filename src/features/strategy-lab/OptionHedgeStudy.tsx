import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/option-hedge.json'

type CandId = 'PPUT' | 'CLLZ'
type Cand = (typeof data.confirm)[CandId]

const CANDS: { id: CandId; name: string; rule: string }[] = [
  { id: 'PPUT', name: 'C1 每月买看跌', rule: 'CBOE PPUT：标普 + 每月 5% 价外看跌' },
  { id: 'CLLZ', name: 'C2 零成本领口', rule: 'CBOE CLLZ：买 2.5% 卖 5% 价外看跌，卖看涨付钱' },
]

/** 小数 → 带符号的「个百分点」：−0.0109 → −1.09 */
function pp(value: number, digits = 2): string {
  const body = Math.abs(value * 100).toFixed(digits)
  return value < 0 ? `−${body}` : `+${body}`
}
const mark = (ok: boolean): string => (ok ? ' ✓' : ' ✗')

type Row = { key: string; head: string; sub?: string; cell: (c: Cand) => React.ReactNode }
const ROWS: Row[] = [
  { key: 'w', head: '同波动对照的股票比例', cell: c => fmtNum(c.w) },
  { key: 'L', head: '急跌合并损失比 L', sub: 'G1 ≤ 0.85，越小越好', cell: c => <strong>{fmtNum(c.L)}{mark(c.gates.G1)}</strong> },
  { key: 'wins', head: '逐事件胜出', sub: 'G2 ≥ 70%', cell: c => `${c.wins}/${c.n}${mark(c.gates.G2)}` },
  { key: 'dA', head: '同波动年化差', sub: 'G3 ≥ −0.50 个百分点', cell: c => `${pp(c.deltaA)}${mark(c.gates.G3)}` },
  { key: 'sub', head: '前段 / 后段 L', sub: 'G4 都 ≤ 0.95', cell: c => `${fmtNum(c.Lfirst)} / ${fmtNum(c.Lsecond)}${mark(c.gates.G4)}` },
  { key: 'cost', head: '每年多扣 0.50% 后 L / 年化差', sub: 'G5', cell: c => `${fmtNum(c.costly.L)} / ${pp(c.costly.deltaA)}${mark(c.gates.G5)}` },
  { key: 'same', head: '同急跌损失下的年化差', sub: '直接降仓到多少股票、贵多少（只报告）', cell: c => `${pct(c.sameLoss.w, 0)} 股票，${pp(c.sameLoss.deltaA)}` },
  { key: 'verdict', head: '结论', cell: c => <strong>{c.verdict}</strong> },
]

function MainTable(): JSX.Element {
  return (
    <TableWrap label="期权保护对同波动降仓的主判定" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-hedge-main">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">指标</th>
            {CANDS.map(c => <th key={c.id} scope="col" className="num">{c.name}<span className="lab-th-sub">{c.rule}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(r => (
            <tr key={r.key} className={r.key === 'verdict' ? 'is-base' : undefined}>
              <th scope="row" className="lab-sticky">{r.head}{r.sub ? <span className="lab-rule">{r.sub}</span> : null}</th>
              {CANDS.map(c => <td key={c.id} className="num">{r.cell(data.confirm[c.id])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

function EventTable(): JSX.Element {
  const p = data.confirm.PPUT.events
  const z = data.confirm.CLLZ.events
  return (
    <TableWrap label={`${p.length} 次急跌逐个结果`} className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-hedge-events">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">急跌<span className="lab-th-sub">高点 → 低点，标普含息跌幅</span></th>
            <th scope="col" className="num">80% 标普<span className="lab-th-sub">现行</span></th>
            <th scope="col" className="num">每月买看跌<span className="lab-th-sub">候选 / 同波动对照</span></th>
            <th scope="col" className="num">零成本领口<span className="lab-th-sub">候选 / 同波动对照</span></th>
          </tr>
        </thead>
        <tbody>
          {p.map((e, i) => (
            <tr key={e.peak} className={e.cand > e.m ? undefined : 'is-base'}>
              <th scope="row" className="lab-sticky">
                <span className="lab-name">{e.peak} → {e.trough}</span>
                <span className="lab-rule">{pct(e.depth)}</span>
              </th>
              <td className="num">{pct(e.b80)}</td>
              <td className="num">{pct(e.cand)} / {pct(e.m)}</td>
              <td className="num">{pct(z[i].cand)} / {pct(z[i].m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

const EXPLORE_NAMES: Record<string, string> = {
  VXTH: 'VIX 看涨尾部对冲（VXTH）',
  PPUT3M: '季度 10% 价外看跌（PPUT3M）',
  CLL_SPLICED: '季度看跌 + 月度看涨领口（CLL）',
  PUT: '卖看跌（PUT，参照）',
  BXM: '备兑看涨（BXM，参照）',
}

function ExploreTable(): JSX.Element {
  return (
    <TableWrap label="探索项（不能据此采用）" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-hedge-explore">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">指数</th>
            <th scope="col" className="num">L</th>
            <th scope="col" className="num">胜出</th>
            <th scope="col" className="num">同波动年化差</th>
            <th scope="col" className="num">同急跌损失下年化差</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data.explore).map(([id, x]) => (
            <tr key={id}>
              <th scope="row" className="lab-sticky">{EXPLORE_NAMES[id] ?? id}<span className="lab-rule">{x.from.slice(0, 4)}–{x.to.slice(0, 4)}</span></th>
              <td className="num">{fmtNum(x.L)}</td>
              <td className="num">{x.wins}/{x.n}</td>
              <td className="num">{pp(x.deltaA)}</td>
              <td className="num">{x.sameLossDeltaA == null ? '—' : pp(x.sameLossDeltaA)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function OptionHedgeStudy(): JSX.Element {
  const { PPUT, CLLZ } = data.confirm
  const savedShare = 1 - PPUT.L
  return (
    <article className="ss-section lab-study" id="lab-option-hedge" aria-labelledby="lab-option-hedge-title" data-testid="lab-option-hedge">
      <p className="lab-status">2026-11-26 · 已完成 · {data.ledger} · 每月买看跌「{PPUT.verdict}」，零成本领口「{CLLZ.verdict}」 · 仓位规则不变</p>
      <h2 id="lab-option-hedge-title">期权保护能不能比调低上限更便宜地防急跌</h2>

      <div className="ss-cover lab-answer" data-testid="lab-hedge-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          期权保护确实能在急跌里少亏，但不比直接调低仓位便宜。每月买 5% 价外看跌，{PPUT.n} 次急跌合并少亏约 {Math.round(savedShare * 100)}%，
          可同等波动下每年少赚 {pp(PPUT.deltaA).replace('−', '')} 个百分点；想在急跌里亏得一样少，直接把股票降到约 {pct(PPUT.sameLoss.w, 0)}，代价几乎相同（差 {pp(PPUT.sameLoss.deltaA).replace('−', '')} 个百分点）。
          零成本领口在急跌里和降仓亏得一样多（L {fmtNum(CLLZ.L, 2)}）。
        </p>
        <p className="ss-p">所以「急跌只能靠事先定低上限」仍然成立：买看跌只是把代价从「平时少持股」换成「平时付保费」，而且在一路阴跌里保护不到。</p>
      </div>

      <h3 className="ss-h3">问的是什么</h3>
      <p className="ss-p">
        趋势防下跌的研究说明，按月的规则来不及应对 1987、2020 年这类急跌。这次检验另一条路：不择时、一直持有的期权保护。数据是 CBOE 的期权策略指数（1986 年起，含股息），本项目第一次使用。
        组合为 80% 指数 + 20% 现金，和「同等波动的标普 + 现金」比；急跌按事先写定的算法取：60 个交易日内跌 15% 以上，共 {data.events.length} 次。
      </p>
      <MainTable />

      <h3 className="ss-h3">在哪里赢、在哪里输</h3>
      <p className="ss-p">
        每月买看跌在一两个月内的暴跌里少亏一半以上（1987、2008 年秋、2020 年）；但在 1990、2002 年秋、2009 年初、2022 年这类一路阴跌里，行权价每月跟着下移，看跌一直在价外，保费照付、保护落不到实处，反而比降仓亏得多。
        谷底之后的反弹里，保费又成了拖累。
      </p>
      <EventTable />

      <h3 className="ss-h3">稳健性</h3>
      <ul className="ss-list">
        <li>从 1990 年起（早期期权价格来源未说明，同时去掉 1987）：L {fmtNum(PPUT.from1990.L)}，胜 {PPUT.from1990.wins}/{PPUT.from1990.n}，年化差 {pp(PPUT.from1990.deltaA)} 个百分点，方向不变。</li>
        <li>逐个去掉一个急跌，L 在 {fmtNum(PPUT.looRange[0])}–{fmtNum(PPUT.looRange[1])} 之间：不靠某一次。</li>
        <li>换一种波动匹配方式（按月波动，或去掉急跌日再匹配），急跌优势更明显（L 约 {fmtNum(PPUT.Mex.L, 2)}–{fmtNum(PPUT.Mmon.L, 2)}），长期代价也更大（每年少赚 {pp(PPUT.Mmon.deltaA).replace('−', '')}–{pp(PPUT.Mex.deltaA).replace('−', '')} 个百分点）。保护是真的，但要付钱。</li>
      </ul>

      <h3 className="ss-h3">探索项</h3>
      <p className="ss-p">
        VIX 看涨尾部对冲看起来最好，同等急跌损失下反而更赚钱；但它的好处几乎全部来自 2008 年秋和 2020 年，10 次只赢 5 次，只有 20 年数据，VIX 期权实际成交与回测差别大。只能作为以后有新数据时的候选。
      </p>
      <ExploreTable />

      <h3 className="ss-h3">结论与局限</h3>
      <ul className="ss-list">
        <li>仓位规则不变。说明书第十四章补记：期权保护不是比降仓更便宜的办法；零成本领口不推荐。</li>
        <li>想在急跌里少亏，最简单的仍是事先把上限定低。</li>
        <li>局限：1986–2015 年是 CBOE 的回测；标普这段数据已用过很多次；只有 {PPUT.n} 次急跌，没有显著性检验。下载数据时看到过指数首尾值（已在预注册披露），长期代价的方向事先大致知道。</li>
      </ul>
    </article>
  )
}
