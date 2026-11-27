import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum } from './LabTable'
import data from './data/overfit-audit.json'

const S_NAMES: Record<string, string> = {
  S0: '现行 v2.2',
  S3: '宏观 + 熔断 + 均线修正',
  S1: '只用宏观打分',
  S2: '宏观 + 熔断',
  S4: '只用十个月均线',
  B: '恒定仓位',
}
const S_ORDER = ['S0', 'S3', 'S1', 'S2', 'S4', 'B'] as const

const years = (v: number | null): string => (v == null ? '不可达' : v < 100 ? `${v.toFixed(0)} 年` : `${Math.round(v).toLocaleString('en-US')} 年`)

function DsrTable(): JSX.Element {
  return (
    <TableWrap label="按试过多少种写法校正后的 Deflated Sharpe" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-audit-dsr">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">按试过多少种算</th>
            <th scope="col" className="num">纯靠运气的最好水平<span className="lab-th-sub">每期信息比率</span></th>
            <th scope="col" className="num">紧缩夏普（DSR）<span className="lab-th-sub">≥ 0.95 才算显著</span></th>
            <th scope="col" className="num">确认要多久<span className="lab-th-sub">最短记录长度（MinTRL）</span></th>
          </tr>
        </thead>
        <tbody>
          {data.T1.byN.map(r => (
            <tr key={r.N} className={r.N === 86 ? 'is-base' : undefined}>
              <th scope="row" className="lab-sticky">{r.N === 1 ? '1（不校正）' : r.N === 86 ? '86（主值）' : r.N}</th>
              <td className="num">{fmtNum(r.irStar)}</td>
              <td className="num">{r.N === 86 ? <strong>{fmtNum(r.dsr, 2)}</strong> : fmtNum(r.dsr, 2)}</td>
              <td className="num">{years(r.minTRLYears)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

function McsTable(): JSX.Element {
  const inSet = new Set(data.T3.included)
  return (
    <TableWrap label="结构写法与模型置信集" className="lab-wrap">
      <table className="cs-table lab-table" data-testid="lab-audit-mcs">
        <thead>
          <tr>
            <th scope="col" className="lab-sticky">写法</th>
            <th scope="col" className="num">净夏普<span className="lab-th-sub">真实成交口径（E1），各自仓位</span></th>
            <th scope="col" className="num">模型置信集（MCS）p 值</th>
            <th scope="col">在 90% 最优集</th>
          </tr>
        </thead>
        <tbody>
          {S_ORDER.map(id => (
            <tr key={id} className={id === 'S0' ? 'is-base' : undefined}>
              <th scope="row" className="lab-sticky">{S_NAMES[id]}</th>
              <td className="num">{fmtNum(data.T3.sharpe[id])}</td>
              <td className="num">{fmtNum(data.T3.pvalues[id], 2)}</td>
              <td>{inSet.has(id) ? '在' : '不在'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export default function OverfitAuditStudy(): JSX.Element {
  const { T1, T2, T3, T4 } = data
  const main = T1.byN.find(r => r.N === 86)!
  const psr = T1.byN.find(r => r.N === 1)!
  return (
    <article className="ss-section lab-study" id="lab-overfit-audit" aria-labelledby="lab-overfit-audit-title" data-testid="lab-overfit-audit">
      <p className="lab-status">2026-11-26 · 已完成 · {data.ledger} · 审计，不是候选检验 · 仓位规则不变</p>
      <h2 id="lab-overfit-audit-title">现行规则的过拟合审计</h2>

      <div className="ss-cover lab-answer" data-testid="lab-audit-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          把试过的 86 种写法算进去以后，不能排除宏观攻守 v2.2 的优势来自挑选（按试验次数校正后的紧缩夏普 DSR {fmtNum(main.dsr, 2)}，0.95 以上才算显著；预注册判定「{T1.verdict}」）；
          现行参数是这段历史上调出来的（过拟合概率 {fmtNum(T4.P.pbo, 2)}，{T4.P.verdict}）。但宏观打分这一类写法整体不是一无是处：
          1,058 个变体里，校正挑选后确有写法显著好于同等波动的恒定仓位（把挑选算进去的 SPA 检验，p = {fmtNum(T2.spa, 3)}）。
        </p>
        <p className="ss-p">
          读法：方向大概率是对的，幅度被回测高估了，具体参数不可信。往后按同波动夏普约 0.56 预期（参数邻域的中位数），而不是 {fmtNum(T1.sharpe.S0, 2)}。
          靠前推记录在统计上确认它需要 {years(T1.forward.optimisticYears)}到 {years(T1.forward.years)}，现实中做不到；所以它只能当「大熊市保险」用，复核看下一次大熊市里的表现。
        </p>
      </div>

      <h3 className="ss-h3">为什么做</h3>
      <p className="ss-p">
        之前的显著性检验（L-010）只看单个规则：夏普差 p 约 0.05。但开发过程中在 1973–2026 年数据上试过很多写法，留下最好的那个，这本身就会让它看起来更好。
        这次用开源统计库 arch（SPA、StepM、模型置信集、平稳自助法）和 scipy，按事先写定的四项检验把「挑选」算进去。数据全部是已用过的，所以这是审计，不改规则。
      </p>

      <h3 className="ss-h3">T1 算上挑选次数：不能排除优势来自挑选</h3>
      <p className="ss-p">
        对象是 v2.2 相对同波动恒定仓位的差额收益（年化信息比率 {fmtNum(T1.irAnnual, 2)}，偏度 {fmtNum(T1.skew, 2)}，峰度 {fmtNum(T1.kurtosis, 1)}：好处集中在少数大跌月份）。
        不校正时 DSR {fmtNum(psr.dsr, 2)}，单看是显著的；问题全在「试了很多种才留下它」。
      </p>
      <DsrTable />

      <h3 className="ss-h3">T2 整类写法：确实有比恒定仓位好的</h3>
      <p className="ss-p">
        在现行参数附近的 1,054 组扰动加 5 种结构写法里（去重后 {data.members.all} 个），Hansen SPA 检验 p = {fmtNum(T2.spa, 3)}（块长 24 时 {fmtNum(T2.spa24, 3)}）：{T2.verdict}。
        但 Romano–Wolf 逐步检验认出的 {T2.stepmBetter} 个全是参数扰动，现行参数{T2.s0InStepm ? '在' : '不在'}其中。宏观打分这个方向在整类层面有证据，落不到「现行这一组参数」上。
      </p>

      <h3 className="ss-h3">T3 和简单写法比：分不开</h3>
      <p className="ss-p">{T3.verdict}。点估计很整齐：每加一层，夏普都略高一点，但都在噪声以内。</p>
      <McsTable />

      <h3 className="ss-h3">T4 参数调整：过拟合风险高</h3>
      <p className="ss-p">
        把 644 个月切成 16 块，12,870 种「一半挑参数、一半检验」的组合里，挑出来的最好参数在另一半排到中位数以下的比例是 {fmtNum(T4.P.pbo, 2)}（{T4.P.verdict}）。
        结构层面（5 种写法）只有 {fmtNum(T4.S.pbo, 2)}：选「用宏观打分」这一步不像选参数那样靠运气，但列太少，只作参考。
      </p>

      <h3 className="ss-h3">结论与局限</h3>
      <ul className="ss-list">
        <li>仓位规则不变（事先写定）。说明书补「多重检验校正」一段；待办登记「简化规则」为将来的题目，只能用前推数据或新数据检验。</li>
        <li>最可靠的仍是美股上限 80% 本身；宏观攻守是在此之上的大熊市保险。不要因为回测数字加大仓位，也没有理由放弃它。</li>
        <li>局限：86 是按登记簿逐项数出来的，v2.0–v2.2 的迭代没有计入，各次检验又高度相关；参数族只覆盖现行参数附近；同波动缩放用了全样本波动。</li>
        <li>独立第二实现（numpy 自写全部检验）一致，并查出主实现一处成员口径错误，已改正。</li>
      </ul>
    </article>
  )
}
