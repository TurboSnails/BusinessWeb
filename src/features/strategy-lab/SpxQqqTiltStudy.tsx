import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum, fmtPct } from './LabTable'
import data from './data/spx-qqq-tilt.json'

type Gate = { label: string; need: string; actual: string; ok: boolean | null }

const signed = (v: number, digits = 3): string => (v < 0 ? `−${Math.abs(v).toFixed(digits)}` : `+${v.toFixed(digits)}`)
const signedPct = (v: number, digits = 2): string => fmtPct(v, digits, true)

function GateTable({ label, testId, gates }: { label: string; testId: string; gates: Gate[] }): JSX.Element {
  return (
    <TableWrap label={label} className="lab-wrap">
      <table className="cs-table lab-table" data-testid={testId}>
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">条件</th>
            <th scope="col">门槛</th>
            <th scope="col" className="num">实际</th>
            <th scope="col">是否满足</th>
          </tr>
        </thead>
        <tbody>
          {gates.map(g => (
            <tr key={g.label}>
              <th scope="row" className="lab-sticky">{g.label}</th>
              <td>{g.need}</td>
              <td className="num">{g.actual}</td>
              <td><span className={`lab-tag ${g.ok ? 'lab-tag--pass' : 'lab-tag--fail'}`}>{g.ok ? '满足' : '不满足'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function SpxQqqTiltStudy(): JSX.Element {
  const { K1: k1, K2: k2, E1: e1, proxy, known1999: kn } = data
  const k1Gates: Gate[] = [
    { label: '效率更好', need: '月度夏普比大盘高 ≥ 0.03', actual: `${fmtNum(k1.sharpe)} 对 ${fmtNum(k1.sharpeM)}（${signed(k1.dSharpe, 4)}）`, ok: k1.dSharpePass },
    { label: '回撤不加深', need: '最大回撤不比同波动大盘深 1 个百分点以上', actual: `${fmtPct(k1.maxDd, 2)} 对 ${fmtPct(k1.maxDdM, 2)}`, ok: k1.maxDdPass },
    { label: '大跌段损失比', need: '≤ 1.00', actual: fmtNum(k1.L), ok: k1.LPass },
    { label: '1973–1984 否决窗口', need: '夏普不比大盘低 0.03 以上', actual: signed(k1.veto1973.dSharpe, 3), ok: !k1.veto1973.triggered },
  ]
  const k2Gates: Gate[] = [
    { label: '对同波动大盘', need: '确定性等价收益每年多 ≥ 0.20%', actual: signedPct(k2.dCerVsMstar), ok: k2.dCerVsMstarPass },
    { label: '对不加杠杆的大盘', need: '确定性等价收益不为负', actual: signedPct(k2.dCerVsM), ok: k2.dCerVsMPass },
    { label: '回撤不加深', need: '最大回撤不比大盘深 1 个百分点以上', actual: `${fmtPct(k2.maxDd, 2)} 对 ${fmtPct(k2.maxDdM, 2)}`, ok: k2.maxDd - k2.maxDdM >= -0.01 },
    { label: '大跌段损失比', need: '≤ 1.00', actual: fmtNum(k2.L), ok: k2.LPass },
    { label: '时机检验', need: '平移安慰剂 p ≤ 0.10', actual: `p ≈ ${fmtNum(k2.placeboP, 2)}`, ok: k2.placeboPass },
    { label: '不靠单一段', need: '单一回撤段贡献 ≤ 50%', actual: `${k2.concentration.from}–${k2.concentration.to} 一段占 ${Math.round(k2.concentration.share * 100)}%`, ok: k2.concentrationPass },
  ]
  return (
    <article className="ss-section lab-study" id="lab-spx-qqq-tilt" aria-labelledby="lab-spx-qqq-tilt-title" data-testid="lab-spx-qqq-tilt">
      <p className="lab-status">2026-11-28 · 已完成 · L-049 · K1「{data.verdict.K1}」、K2「{data.verdict.K2}」 · 不改仓位规则</p>
      <h2 id="lab-spx-qqq-tilt-title">股票部分 30% 大盘成长倾斜，与深度回调后有限加杠杆（1.3 倍）</h2>
      <div className="ss-cover lab-answer" data-testid="lab-spx-qqq-tilt-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          30% 大盘成长倾斜（K1）在 1927–1972 年年化波动 {fmtPct(k1.vol, 2)}（大盘 {fmtPct(k1.volM, 2)}）、最大回撤 {fmtPct(k1.maxDd, 2)}（大盘 {fmtPct(k1.maxDdM, 2)}），几乎和大盘一样：既没降波动，也没换来足够的效率。深度回调后加杠杆（K2）最大回撤 {fmtPct(k2.maxDd, 2)}，比大盘略深；1929–1932 年累计 {fmtPct(k2.crash1929.cand)}（大盘 {fmtPct(k2.crash1929.m)}）。两个都不通过。
        </p>
        <p className="ss-p">
          用户提议：股票部分做成 70% 标普 500 + 30% 纳指 100，偏离超过 5 个百分点再平衡；「明显回调」时允许加杠杆，但不超过 1.3 倍。K1 用美国大盘成长股组合代替纳指 100（纳指 1985 年才有）；K2 只在大盘从高点回撤 ≥ 20% 且站上 200 日均线时加到 1.3 倍，跌破均线或回撤收窄到 5% 以内就退出。主判定 1927–1972 年，1973–1984 年与 1999–2026 年只用来否决。
        </p>
      </div>
      <h3 className="ss-h3">K1：30% 大盘成长倾斜 · {data.verdict.K1}</h3>
      <GateTable label="K1 判定条件" testId="lab-spx-qqq-tilt-k1" gates={k1Gates} />
      <h3 className="ss-h3">K2：深度回调后加到 1.3 倍 · {data.verdict.K2}</h3>
      <GateTable label="K2 判定条件" testId="lab-spx-qqq-tilt-k2" gates={k2Gates} />
      <h3 className="ss-h3">必须一起读的限制</h3>
      <ul className="ss-list" data-testid="lab-spx-qqq-tilt-limits">
        <li>代用品比纳指 100 温和得多：1927–1972 年的成长组合与大盘相关 {fmtNum(proxy.corr)}、波动是大盘的 {fmtNum(proxy.volRatio, 2)} 倍；而 1999–2026 年纳指 100 对标普 500 相关 {fmtNum(proxy.qqqCorr, 2)}、波动 {fmtNum(proxy.qqqVolRatio, 2)} 倍。所以 K1 不通过只说明「价值股占优的年代里，大盘成长倾斜在同波动下没有更好」，不能直接套到纳指 100。</li>
        <li>1999–2026 年真实的 70 / 30（已知结果，不算证据）：年化 {fmtPct(kn.mix.cagr)}（标普 {fmtPct(kn.spy.cagr)}），但波动 {fmtPct(kn.mix.vol)}（{fmtPct(kn.spy.vol)}）、最大回撤 {fmtPct(kn.mix.maxDd)}（{fmtPct(kn.spy.maxDd)}），回撤深约 {Math.round((kn.spy.maxDd - kn.mix.maxDd) * 100)} 个百分点；按低风险偏好折算的收益也更低。纳指大涨的年代里，它也不是降波动的写法。</li>
        <li>用户原话「回撤 20% 就加到 1.3 倍」：加杠杆后若不调回，{e1.liquidateDate} 净值归零被强平；每天调回 1.3 倍虽没强平，最大回撤也加深到 {fmtPct(e1.maxDd)}。</li>
        <li>均线确认确实有用：和在同样的回撤期里随机加杠杆比，p ≈ {fmtNum(k2.conditionalP, 4)}，每年约好 {fmtNum(k2.maIncrement * 100, 1)} 个百分点；但仍不如不加杠杆。</li>
        <li>1934–1972 年多数年份受保证金规定限制，1.3 倍当时无法执行，结果只作假想；借钱成本按无风险利率 + 1.5% 计，散户实际更高。</li>
      </ul>
      <h3 className="ss-h3">处理</h3>
      <ul className="ss-list">
        <li>两个都不通过：不进入综合策略，不改仓位规则；90 天内不在同一批数据上试参数变体。</li>
        <li>历史统计，不构成买卖建议。</li>
      </ul>
    </article>
  )
}
