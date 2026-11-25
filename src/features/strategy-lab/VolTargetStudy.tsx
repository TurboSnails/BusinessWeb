import React from 'react'
import { TableWrap } from '../../components/ui'
import data from './data/vol-target.json'
import { pct } from './LateCycleStudy'

type Id = 'base' | 'VT1' | 'VT2' | 'VT3'
const ROWS: { id: Id; name: string; rule: string }[] = [
  { id: 'base', name: '宏观攻守 v2.2（现行）', rule: '按月档位，不缩放' },
  { id: 'VT1', name: 'VT1 只降不升（按日）', rule: '档位仓位 × min(1, 参照波动 ÷ 近 20 日波动)，变动 ≥ 5 个百分点才调' },
  { id: 'VT2', name: 'VT2 双向（按日）', rule: '平静时可高于档位仓位，最高 100%，不加杠杆' },
  { id: 'VT3', name: 'VT3 只降不升（按月）', rule: '每月按月末的波动缩放一次，当月不变' },
]
const EVENT_PEAKS = ['1987-08-25', '1998-07-17', '2000-03-24', '2007-10-09', '2018-09-20', '2020-02-19', '2022-01-03', '2025-02-19']

function num(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value < 0 ? `−${Math.abs(value).toFixed(digits)}` : value.toFixed(digits)
}

function ResultTable(): JSX.Element {
  return (
    <TableWrap label="波动率目标三个写法与基线对比">
      <table className="cs-table" data-testid="lab-vt-table">
        <thead>
          <tr>
            <th scope="col">写法</th>
            <th scope="col" className="num">训练期夏普<br />1973–1999</th>
            <th scope="col" className="num">验证期夏普<br />2000–2026</th>
            <th scope="col" className="num">全样本夏普</th>
            <th scope="col" className="num">年化</th>
            <th scope="col" className="num">按日最大回撤</th>
            <th scope="col" className="num">平均仓位</th>
            <th scope="col" className="num">年换手</th>
            <th scope="col">结论</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(row => {
            const s = data.strategies[row.id]
            return (
              <tr key={row.id} className={row.id === 'base' ? 'is-highlight' : undefined}>
                <th scope="row">{row.name}<span className="lab-rule">{row.rule}</span></th>
                <td className="num">{num(s.train.sharpeNet)}</td>
                <td className="num">{num(s.valid.sharpeNet)}</td>
                <td className="num">{num(s.full.sharpeNet)}</td>
                <td className="num">{pct(s.full.cagr)}</td>
                <td className="num">{pct(s.full.dailyMaxDd)}</td>
                <td className="num">{pct(s.full.avgEquity, 0)}</td>
                <td className="num">{pct(s.full.turnoverPerYear, 0)}</td>
                <td>{row.id === 'base' ? '—' : data.verdict[row.id]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableWrap>
  )
}

function EventTable(): JSX.Element {
  const rows = data.events.filter(e => EVENT_PEAKS.includes(e.peak))
  return (
    <TableWrap label="高位回落时的下跌与反弹">
      <table className="cs-table" data-testid="lab-vt-events">
        <thead>
          <tr>
            <th scope="col">回调（高点 → 低点）</th>
            <th scope="col" className="num">标普</th>
            <th scope="col" className="num">现行</th>
            <th scope="col" className="num">现行缩到同等仓位</th>
            <th scope="col" className="num">VT3</th>
            <th scope="col" className="num">反弹：现行 / VT3</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(e => (
            <tr key={e.peak}>
              <th scope="row">{e.peak} → {e.trough}</th>
              <td className="num">{pct(e.spxLoss)}</td>
              <td className="num">{pct(e.loss.base)}</td>
              <td className="num">{pct(e.loss.baseScaled)}</td>
              <td className="num">{pct(e.loss.VT3)}</td>
              <td className="num">{pct(e.gain.base)} / {pct(e.gain.VT3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function VolTargetStudy(): JSX.Element {
  const b = data.strategies.base; const v3 = data.strategies.VT3; const v1 = data.strategies.VT1
  const rm = data.riskMatched.VT3
  const s50 = data.standalone['1950–1972']; const s73 = data.standalone['1973–2026']
  const e2020 = data.events.find(e => e.peak === '2020-02-19')
  const now = data.sigmaNow

  return (
    <article className="ss-section lab-study" id="lab-vol-target" aria-labelledby="lab-vt-title" data-testid="lab-vol-target">
      <p className="lab-status">2026-11-25 · 已完成 · 按事先门槛不通过 · 不改仓位规则</p>
      <h2 id="lab-vt-title">波动率目标：市场越乱，仓位越低</h2>

      <div className="ss-cover lab-answer" data-testid="lab-vt-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          这是今天唯一真正减轻高位回落损失的方法：按日最大回撤从 {pct(b.full.dailyMaxDd, 0)} 降到 {pct(v1.full.dailyMaxDd, 0)}–{pct(v3.full.dailyMaxDd, 0)}，大多数回调都少亏。但年化少约 1 个百分点，反弹也拿得少；按事先定的夏普门槛差一点没过（VT3 训练期只高 {num(data.strategies.VT3.train.sharpeNet - b.train.sharpeNet)}，门槛 +0.02）。
        </p>
        <p className="ss-p">它换来的是更浅的回撤，不是更高的收益。是否值得，取决于你更在意少亏还是多赚。</p>
      </div>

      <h3 className="cs-subhead">做法</h3>
      <ul className="ss-list">
        <li>每天算标普最近 20 个交易日的实际波动（年化），和 1950 年以来所有读数的中位数（约 11–12%）比较。</li>
        <li>近期波动高于中位数时，仓位按比例缩小：例如近期波动是中位数的 2 倍，仓位减半。只降不升的写法，最多等于宏观档位的仓位。</li>
        <li>它看的是市场「有多乱」，不是「跌了多少」。急跌开头往往先出现大幅震荡，所以能比均线、回撤类规则更早减仓。</li>
      </ul>

      <h3 className="cs-subhead">结果（预注册，门槛用扣 0.1% 成本后的夏普）</h3>
      <ResultTable />

      <h3 className="cs-subhead">回撤更浅，不只是因为仓位更低（事后检验，不改变结论）</h3>
      <p className="ss-p">
        波动率目标的平均仓位只有约 55%，比现行规则低。把现行规则按比例缩到同样的平均仓位（{pct(rm.baseScaled.avgEquity, 0)}）再比：
        年化同为 {pct(rm.baseScaled.cagr)} 对 {pct(rm.candidate.cagr)}，按日最大回撤 {pct(rm.baseScaled.dailyMaxDd)} 对 VT3 的 {pct(rm.candidate.dailyMaxDd)}，扣成本夏普 {num(rm.baseScaled.sharpeNet)} 对 {num(rm.candidate.sharpeNet)}。
        同样的收益、同样的平均仓位，回撤浅约 9 个百分点。独立审稿测算：回撤减少里约 5.5 个百分点来自平均仓位更低，其余约 8.8 个百分点来自减仓时点更好。
      </p>
      <EventTable />
      <ul className="ss-list">
        <li>高位开始的急跌里普遍少亏：1987、1998、2018、2020、2025 年都明显好于现行规则，也好于缩到同等仓位的现行规则。慢跌和小回调里差别不大，2015、1989 年还略差。</li>
        <li>
          代价在反弹：波动在底部附近仍然很高，仓位要等市场平静下来才加回。2020 年低点后到收复前高，现行规则涨 {pct(e2020?.gain.base)}，VT3 只涨 {pct(e2020?.gain.VT3)}。
        </li>
        <li>去掉 2020 年 1–4 月再算，只有按月的 VT3 仍好于现行（扣成本夏普 {num(v3.without2020)} 对 {num(b.without2020)}）；按日的 VT1、VT2 优势完全来自 2020 年。</li>
        <li>按日写法换手很高（VT1 每年约 {pct(v1.full.turnoverPerYear, 0)}、VT2 约 300%），扣成本后优势被吃掉；按月的 VT3 换手较低、夏普最高。</li>
        <li>
          不叠加宏观档位、只用波动率目标时：1973–2026 年恒定七成的回撤从 {pct(s73.static70.dailyMaxDd, 0)} 降到 {pct(s73.static70xK.dailyMaxDd, 0)}，夏普 {num(s73.static70.sharpeNet)} → {num(s73.static70xK.sharpeNet)}；
          1950–1972 年回撤 {pct(s50.static70.dailyMaxDd, 0)} → {pct(s50.static70xK.dailyMaxDd, 0)}，但夏普 {num(s50.static70.sharpeNet)} → {num(s50.static70xK.sharpeNet)}，反而下降。降回撤在两段都成立，提高夏普只在 1973 年以后成立。
        </li>
      </ul>

      <h3 className="cs-subhead">现在的读数（只作参考）</h3>
      <p className="ss-p" data-testid="lab-vt-now">
        截至 {now.date}，标普近 20 日实际波动约 {pct(now.sigma, 0)}，参照中位数约 {pct(now.sigmaStar, 0)}，缩放系数 {now.k.toFixed(2)}。按这个规则，仓位会缩到宏观档位的约 {pct(now.k, 0)}。
        11 月出现了多次 ±4% 左右的单日波动（11 月 5 日 −4.4%、20 日 −3.7%、23 日 +4.7%，已与 FRED 逐日核对），这正是规则设计要应对的情形。但它没通过检验，现行仓位仍按宏观攻守执行。
      </p>

      <h3 className="cs-subhead">怎么理解、下一步</h3>
      <ol className="ss-list">
        <li>按事先定的门槛，三个写法都不通过，仓位规则不变。</li>
        <li>但在今天检验过的 10 个美股高位回落写法里（月中刹车 4 个、按日执行 3 个、波动率目标 3 个），它是唯一在同等仓位下明显降低损失的。如果你的目标是「少亏」而不是「多赚」，VT3 值得继续：要先用「同等收益下回撤更浅」重新写一次门槛，并用 1950–1972 年和影子跟踪检验，不能因为这次结果好看就直接放宽门槛采用。</li>
        <li>它和宏观攻守互补：宏观管慢的衰退型下跌，波动率管快的急跌。</li>
      </ol>

      <h3 className="cs-subhead">局限与复现</h3>
      <ul className="ss-list">
        <li>波动率目标在学术上广为人知（Moreira &amp; Muir 2017），后续研究认为样本外不稳、扣成本后打折；参数用的是常见默认值，但不能排除文献本身的数据挖掘。</li>
        <li>「同等仓位」比较是看过结果后加的，属于探索；今天已检验约 20 个改动，应合在一起看多重比较风险；只有美国数据；未计税费。</li>
        <li>预注册、脚本和结果在 docs/research/vol-target-2026-11-25/，用 node docs/research/vol-target-2026-11-25/run.mjs 和 explore.mjs 复现。</li>
      </ul>
    </article>
  )
}
