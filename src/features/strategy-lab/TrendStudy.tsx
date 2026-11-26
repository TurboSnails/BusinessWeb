import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import { pct } from './LateCycleStudy'
import data from './data/trend.json'

type CandId = 'C1' | 'C2'
type Cand = (typeof data.candidates)[CandId]

const CANDS: { id: CandId; name: string; rule: string }[] = [
  { id: 'C1', name: 'C1 现行规则', rule: '底仓 85%，月均价跌破 10 个月均线时降到 70%' },
  { id: 'C2', name: 'C2 破位封顶', rule: '底仓 85%，跌破 10 个月均线时最多 50%' },
]

/** 带符号的数：+0.063 / −0.019 */
function signed(value: number, digits = 3): string {
  const body = Math.abs(value).toFixed(digits)
  return value < 0 ? `−${body}` : `+${body}`
}
/** 小数 → 带符号的「个百分点」数：0.0045 → +0.45 */
const pp = (value: number, digits = 2): string => signed(value * 100, digits)

type MetricRow = { key: string; head: string; sub?: string; cell: (c: Cand) => React.ReactNode }

const METRICS: MetricRow[] = [
  { key: 'wM', head: '同波动对照 w_M', sub: '恒定仓位、波动相同', cell: c => fmtNum(c.main.wM) },
  { key: 'L', head: '合并跌幅比 L', sub: '越小越好；括号内为门槛', cell: c => <><strong>{fmtNum(c.main.L)}</strong>（≤ {fmtNum(c.Lstar)}）</> },
  { key: 'Lm29', head: '去掉 1929–32 年的 L', cell: c => fmtNum(c.main.Lm29) },
  { key: 'wins', head: '下跌段逐段胜出', cell: c => `${c.main.wins}/${c.main.events.length}` },
  { key: 'dE', head: '全周期 ΔE', sub: '括号内为全周期差为正的段数', cell: c => `${signed(c.main.dE)}（${c.main.posE}/${c.main.events.length}）` },
  { key: 'calm', head: '非目标期', sub: '对同波动 / 对恒定 85%，个百分点/年', cell: c => `${pp(c.main.calmVsM)} / ${pp(c.main.calmVsB0)}` },
  { key: 'cost', head: '0.30% 成本下 L / ΔE', cell: c => `${fmtNum(c.cost30.L)} / ${signed(c.cost30.dE)}` },
  { key: 'p', head: '安慰剂 p（Holm）', sub: `随机时机 ${data.candidates.C1.placebo.draws.toLocaleString('en-US')} 次`, cell: c => <strong>{`${fmtNum(c.placebo.pRaw)}（${fmtNum(c.placebo.pHolm)}）`}</strong> },
  { key: 'verdict', head: '结论', cell: c => <strong>{c.verdict}</strong> },
]

function MainTable(): JSX.Element {
  return (
    <TableWrap label="C1、C2 在 1872–1934 年的主判定" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-trend-main">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">指标</th>
            {CANDS.map(c => (
              <th key={c.id} scope="col" className="num">{c.name}<span className="lab-th-sub">{c.rule}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map(m => (
            <tr key={m.key} className={m.key === 'verdict' ? 'is-base' : undefined}>
              <th scope="row" className="lab-sticky">{m.head}{m.sub ? <span className="lab-rule">{m.sub}</span> : null}</th>
              {CANDS.map(c => <td key={c.id} className="num">{m.cell(data.candidates[c.id])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

function EventTable(): JSX.Element {
  const c1 = data.candidates.C1.main.events
  const c2 = data.candidates.C2.main.events
  return (
    <TableWrap label="8 次 20% 以上的大跌逐段结果" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-trend-events">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">事件<span className="lab-th-sub">高点月 → 谷底月</span></th>
            <th scope="col" className="num">C1 下跌<span className="lab-th-sub">候选 / 同波动对照</span></th>
            <th scope="col" className="num">C1 全周期差<span className="lab-th-sub">个百分点</span></th>
            <th scope="col" className="num">C2 下跌<span className="lab-th-sub">候选 / 同波动对照</span></th>
            <th scope="col" className="num">C2 全周期差<span className="lab-th-sub">个百分点</span></th>
          </tr>
        </thead>
        <tbody>
          {c1.map((e, i) => {
            const f = c2[i]
            return (
              <tr key={e.id} className={e.dE < 0 ? 'is-base' : undefined}>
                <th scope="row" className="lab-sticky">
                  <span className="lab-name">{e.id}</span>
                  <span className="lab-rule">{e.peak} → {e.trough}</span>
                </th>
                <td className="num">{pct(e.downC)} / {pct(e.downM)}</td>
                <td className="num">{signed(e.dE * 100, 1)}</td>
                <td className="num">{pct(f.downC)} / {pct(f.downM)}</td>
                <td className="num">{signed(f.dE * 100, 1)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}

function OverlayTable(): JSX.Element {
  const rows = [
    { key: 'base', name: 'v2.2 基线', s: data.g9.base, changed: '—' },
    { key: 'C2', name: 'v2.2 + C2', s: data.g9.C2, changed: String(data.g9.C2.changedMonths) },
  ]
  return (
    <TableWrap label="1973–2026 年把 C2 叠加到宏观攻守上" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-trend-overlay">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">写法</th>
            <th scope="col" className="num">年化</th>
            <th scope="col" className="num">夏普</th>
            <th scope="col" className="num">按日最大回撤</th>
            <th scope="col" className="num">改变档位的月数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className={r.key === 'base' ? 'is-base' : undefined}>
              <th scope="row" className="lab-sticky">{r.name}</th>
              <td className="num">{pct(r.s.cagr, 2)}</td>
              <td className="num">{fmtNum(r.s.sharpe)}</td>
              <td className="num">{pct(r.s.dailyMaxDd)}</td>
              <td className="num">{r.changed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function TrendStudy(): JSX.Element {
  const { C1, C2 } = data.candidates
  const { g9, explore } = data
  const e8 = (c: Cand) => c.main.events.find(e => e.id === 'E8')!
  return (
    <article className="ss-section lab-study" id="lab-trend" aria-labelledby="lab-trend-title" data-testid="lab-trend">
      <p className="lab-status">2026-11-26 · 已完成 · {data.ledger} · 两种写法都「部分成立」 · 仓位规则不变</p>
      <h2 id="lab-trend-title">趋势防下跌：1872–1934 年确认检验</h2>

      <div className="ss-cover lab-answer" data-testid="lab-trend-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          两种写法都「部分成立」：在本项目从没用过的 1872–1934 年，8 次 20% 以上的大跌里 8/8 段都少跌；但随机时机的安慰剂检验不显著（Holm 校正后都是 {fmtNum(C1.placebo.pHolm, 2)}）。
          叠加到现行规则上，1973–2026 年没有加分（夏普 {fmtNum(g9.base.sharpe)} → {fmtNum(g9.C2.sharpe)}）。规则不变，C2 进影子记录。
        </p>
        <p className="ss-p">
          现行规则里已经有趋势防下跌（破位降一档），它在这段老数据上也站得住。想更强地防下跌，C2 的方向是对的，但证据只够「影子观察」；急跌仍然只能靠事先定低上限来承受。
        </p>
      </div>

      <h3 className="cs-subhead">一、主判定：1872–1934 年（{data.window[0]} 至 {data.window[1]}）</h3>
      <p className="ss-p">
        预注册在任何 1871–1934 年计算之前提交。两种写法都和「同波动对照」比：恒定仓位、波动和候选一样。
        合并跌幅比 L = 8 段候选跌幅之和 ÷ 对照跌幅之和，越小越好。安慰剂检验把破位月份随机打乱，看真实时机是否明显更好。
      </p>
      <MainTable />
      <ul className="ss-list">
        <li>两种写法除安慰剂显著性外，其他门槛全部满足；C2 另满足「不劣于 C1」。</li>
        <li>好处不靠 1929–32 年一次：去掉它，L 反而更好（{fmtNum(C1.main.Lm29)}、{fmtNum(C2.main.Lm29)}）。</li>
        <li>非目标期（平静期）比同波动对照好，比恒定 85% 略差，也就是不比「直接调低上限」更贵。</li>
        <li>防守段共 {data.spells} 段，其中 {pct(data.twoMonthReversalShare, 0)} 不超过 2 个月就收复，这是趋势规则的主要代价。</li>
      </ul>

      <h3 className="cs-subhead">二、8 次大跌逐段看</h3>
      <EventTable />
      <p className="ss-p">
        下跌段全部少跌。唯一全周期为负的是 1929–32 年（C1 {signed(e8(C1).dE * 100, 1)}、C2 {signed(e8(C2).dE * 100, 1)} 个百分点）：下跌段少跌，但 1932 年夏天谷底后的暴涨在破位状态里踏空，省下的又还回去一部分。
      </p>

      <h3 className="cs-subhead">三、叠加到现行宏观攻守（1973–2026 年）</h3>
      <OverlayTable />
      <ul className="ss-list">
        <li>7 次按日 20% 以上回调的合并跌幅：基线 {pct(g9.sumBase)}，C2 {pct(g9.sumC2)}，只有 1987、2022 年少跌一点。否决条件都没触发。</li>
        <li>1973 年以后的大熊市，宏观攻守已经先降仓，C2 在那里不起作用；1987、2020 年这类急跌，按月的趋势规则都来不及。</li>
        <li>C2 真正可能起作用的，是「宏观看起来没问题、但价格已经破位」的慢跌；1973 年以后这类下跌很少，所以历史上看不出来。</li>
      </ul>

      <h3 className="cs-subhead">四、探索（不能据此采用）</h3>
      <ul className="ss-list" data-testid="lab-trend-explore">
        <li>
          多周期投票：三票（3/6/12 个月）L {fmtNum(explore.X1three.L)}、{explore.X1three.wins}/8 段少跌、年切换 {explore.X1three.switchesPerYear.toFixed(1)} 次；四票（加 1 个月）L {fmtNum(explore.X1four.L)}，但年切换 {explore.X1four.switchesPerYear.toFixed(1)} 次。
          看起来比 C2 好，但它是探索项，平均仓位更低，还藏着参数空间。不采用。
        </li>
        <li>
          利率收紧加破位（德鲁肯米勒式）：设计失败。收紧状态在 {pct(explore.X2.Lshare, 0)} 的月份成立，超过 60% 的上限；结果比单纯 C2 还差（L 高 {fmtNum(explore.X2.vsC2.L)}）。这段历史里，利率收紧没有给价格破位提供额外信息。
        </li>
      </ul>

      <p className="ss-note" role="note">
        席勒月均价含息口径，底仓 85%，现金按商业票据利率换算；只有 8 次事件，样本小。独立第二实现（Python）结果一致。
        90 天内（2027-02-24 前）不在同一数据上试均线长度、封顶档位或缓冲带变体。预注册、脚本与结果在 docs/research/trend-1871-2026-11-26/。历史统计，不构成买卖建议。
      </p>
    </article>
  )
}
