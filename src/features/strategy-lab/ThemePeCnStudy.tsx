import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum, fmtPct } from './LabTable'
import data from './data/theme-pe-cn.json'

const CANDS = [
  { id: 'C1a', name: 'C1a 持续主线', rule: '连续两个月进前 2 名才买入，掉出前 4 名或资金不再集中就卖出' },
  { id: 'C1b', name: 'C1b 每月主线', rule: '每月按 3 个月和 6 个月相对强度重排，取前 2 名' },
] as const
const ROWS = [
  { id: 'C1a', name: 'C1a 持续主线' },
  { id: 'C1b', name: 'C1b 每月主线' },
  { id: 'B1', name: '行业等权（主基准）' },
  { id: 'B0', name: '全市场市值加权' },
  { id: 'B2p', name: 'C1a 不做估值过滤' },
  { id: 'B4', name: 'C1a 不要求持续（每月取前 2）' },
] as const
const GATES = [
  { key: 'c1', label: '降波动', need: '波动 ≤ 行业等权、回撤不深 1 个百分点以上，同波动下夏普不差 0.02 以上' },
  { key: 'c2', label: '大跌段少亏', need: '大跌段损失比 ≤ 0.95' },
  { key: 'c3', label: '夏普不差', need: '夏普 ≥ 行业等权 − 0.02' },
  { key: 'c4', label: '估值过滤有增量', need: '比不过滤的版本回撤浅 ≥ 2 个百分点，夏普不差 0.01 以上' },
] as const

function Mark({ ok }: { ok: boolean }): JSX.Element {
  return <span className={`lab-tag ${ok ? 'lab-tag--pass' : 'lab-tag--fail'}`}>{ok ? '过' : '不过'}</span>
}

export default function ThemePeCnStudy(): JSX.Element {
  const { rows, C1a: a, decomposition: dec } = data
  const actual = (id: 'C1a' | 'C1b', key: (typeof GATES)[number]['key']): string => {
    const r = rows[id]
    const b1 = rows.B1
    const c = data[id]
    const noFilter = rows[c.vs4 === 'B2p' ? 'B2p' : 'B2b']
    if (key === 'c1') return `波动 ${fmtPct(r.vol)} 对 ${fmtPct(b1.vol)}`
    if (key === 'c2') return fmtNum(c.L)
    if (key === 'c3') return `${fmtNum(r.sharpe)} 对 ${fmtNum(b1.sharpe)}`
    return `回撤 ${fmtPct(r.maxdd)} 对 ${fmtPct(noFilter.maxdd)}，夏普 ${fmtNum(r.sharpe)} 对 ${fmtNum(noFilter.sharpe)}`
  }
  return (
    <article className="ss-section lab-study" id="lab-theme-pe-cn" aria-labelledby="lab-theme-pe-cn-title" data-testid="lab-theme-pe-cn">
      <p className="lab-status">2026-11-28 · 已完成 · L-052 · C1a「{data.verdict.C1a}」、C1b「{data.verdict.C1b}」 · 不改仓位规则</p>
      <h2 id="lab-theme-pe-cn-title">A 股主线行业 + 估值过滤：跟强势行业、估值过高就跳过</h2>
      <div className="ss-cover lab-answer" data-testid="lab-theme-pe-cn-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          这里检验的是申万一级行业的「6 个月相对强 + 成交额集中 + 行业市盈率在自身历史 90% 分位以上就跳过」，不是题材或概念本身（人工智能、机器人这类主线横跨多个一级行业）。2015 年至 2023-10，持续主线写法年化波动 {fmtPct(rows.C1a.vol)}（行业等权 {fmtPct(rows.B1.vol)}）、夏普 {fmtNum(rows.C1a.sharpe)}（{fmtNum(rows.B1.sharpe)}）；每月主线写法夏普 {fmtNum(rows.C1b.sharpe)}。两个都不通过。
        </p>
        <p className="ss-p">
          还要知道：两种写法都集中持有 1–2 个行业，本来就不是降波动的写法；验证段不是样本外；已退市股票不在行业篮子里，行业收益偏乐观；整行业篮子普通账户难以买齐，行业 ETF 大多 2013 年以后才有、多数跟踪中证指数而不是申万行业。以下数字都已扣交易成本。
        </p>
      </div>
      <h3 className="ss-h3">判定：门槛与实际</h3>
      <TableWrap label="两种写法的判定条件" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-theme-pe-cn-gates">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">条件<span className="lab-th-sub">门槛</span></th>
              {CANDS.map(c => <th key={c.id} scope="col" className="num">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {GATES.map(g => (
              <tr key={g.key}>
                <th scope="row" className="lab-sticky">{g.label}<span className="lab-rule">{g.need}</span></th>
                {CANDS.map(c => (
                  <td key={c.id} className="num"><Mark ok={data[c.id].pass[g.key]} /><span className="lab-th-sub">{actual(c.id, g.key)}</span></td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="lab-sticky">时机检验<span className="lab-rule">随机换成同样多的行业，大跌段损失比的 p（Holm）≤ 0.10</span></th>
              {CANDS.map(c => (
                <td key={c.id} className="num"><Mark ok={data[c.id].holm <= 0.1} /><span className="lab-th-sub">p {fmtNum(data[c.id].placeboP, 2)}（Holm {fmtNum(data[c.id].holm, 2)}）</span></td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="lab-sticky">结论<span className="lab-rule">全部满足才通过</span></th>
              {CANDS.map(c => <td key={c.id} className="num"><strong>{data[c.id].grade}</strong></td>)}
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <h3 className="ss-h3">验证段 2015 年至 2023-10</h3>
      <TableWrap label="验证段各组合表现" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-theme-pe-cn-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">组合</th>
              <th scope="col" className="num">年化收益</th>
              <th scope="col" className="num">年化波动</th>
              <th scope="col" className="num">夏普</th>
              <th scope="col" className="num">最大回撤</th>
              <th scope="col" className="num">年化成本</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ id, name }) => {
              const r = rows[id]
              const rule = CANDS.find(c => c.id === id)?.rule
              return (
                <tr key={id} className={id === 'B1' ? 'is-base' : undefined}>
                  <th scope="row" className="lab-sticky">{name}{rule ? <span className="lab-rule">{rule}</span> : null}</th>
                  <td className="num">{fmtPct(r.cagr)}</td>
                  <td className="num">{fmtPct(r.vol)}</td>
                  <td className="num">{fmtNum(r.sharpe)}</td>
                  <td className="num">{fmtPct(r.maxdd)}</td>
                  <td className="num">{fmtPct(r.costAnn)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <h3 className="ss-h3">必须一起读的限制</h3>
      <ul className="ss-list" data-testid="lab-theme-pe-cn-limits">
        <li>估值过滤的增量在门槛边缘：持续主线比不过滤的版本回撤浅 {fmtNum((rows.C1a.maxdd - rows.B2p.maxdd) * 100, 1)} 个百分点（门槛 2 个），夏普几乎一样；买不进的部分改按其他口径处理时这一条能过，严格「留现金」口径不过。不稳健，不能当成估值过滤有效的证据。</li>
        <li>持续主线每年比行业等权少 {fmtPct(Math.abs(dec.totalAnn))}：没有主线的 {dec.emptyMonths} 个月拿全市场，贡献 {fmtPct(dec.emptyAnn, 1, true)}；有持仓的 {dec.heldMonths} 个月贡献 {fmtPct(dec.heldAnn, 1, true)}。跟主线本身就落后。</li>
        <li>检验力有限：即使大跌段损失比真能降低 0.05，这次检验也只有约 {Math.round(data.power.C1a * 100)}%（持续主线）/ {Math.round(data.power.C1b * 100)}%（每月主线）的机会看出来；但实际结果连方向都不对，大跌段损失比 {fmtNum(a.L)} 大于 1。</li>
        <li>前后共记录 {data.trials} 条试验；2005–2014 年行业归属不是当时口径，只作描述。</li>
      </ul>
      <h3 className="ss-h3">处理</h3>
      <ul className="ss-list">
        <li>两个都不通过：不改仓位规则，A 股 ETF 部分不按主线行业轮动。</li>
        <li>历史统计，不构成买卖建议。</li>
      </ul>
    </article>
  )
}
