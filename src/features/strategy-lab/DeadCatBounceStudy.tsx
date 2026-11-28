import React from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum, fmtPct } from './LabTable'
import data from './data/dead-cat-bounce.json'

type Row = (typeof data.layers.validate)['C1']

const NAMES = [
  { id: 'C1', name: 'C1 笼统回避', rule: '10 日内跌 ≥ 25%、随后 20 日内从低点反弹 ≥ 10% 的股票，之后 60 日不持有' },
  { id: 'C2lo', name: 'C2 定期报告暴跌（下界）', rule: '只回避暴跌期间发过定期报告的；已退市股的事件一律不算' },
  { id: 'C2hi', name: 'C2 定期报告暴跌（上界）', rule: '同上；已退市股的事件一律算' },
] as const
const LAYERS = [
  { id: 'explore', name: '探索' },
  { id: 'validate', name: '验证' },
] as const
const H3_STAGES = [
  { id: 'sc', name: '抛售高潮' },
  { id: 'ar', name: '自动反弹' },
  { id: 'st', name: '二次测试' },
  { id: 'spring', name: '弹簧（跌破后收回）' },
  { id: 'sos', name: '强势信号' },
  { id: 'lps', name: '最后支撑点（入场）' },
] as const

function Mark({ ok }: { ok: boolean }): JSX.Element {
  return <span className={`lab-tag ${ok ? 'lab-tag--pass' : 'lab-tag--fail'}`}>{ok ? '过' : '不过'}</span>
}

export default function DeadCatBounceStudy(): JSX.Element {
  const h = data.headline
  const v = data.layers.validate
  return (
    <article className="ss-section lab-study" id="lab-dead-cat-bounce" aria-labelledby="lab-dead-cat-bounce-title" data-testid="lab-dead-cat-bounce">
      <p className="lab-status">2026-11-28 · 已完成 · L-051 · C1、C2 都不晋级 · 不改仓位规则</p>
      <h2 id="lab-dead-cat-bounce-title">A 股暴跌后反弹（死猫跳）回避：剔除这类股票能不能降波动</h2>
      <div className="ss-cover lab-answer" data-testid="lab-dead-cat-bounce-answer">
        <p className="ss-cover__kicker">一句话</p>
        <p className="ss-cover__summary">
          同等仓位下，2015–2023 年全 A 股票池剔除「暴跌后刚反弹」的股票，年化波动从 {fmtPct(h.volFull, 2)} 降到 {fmtPct(h.volAvoid, 2)}，最大回撤却从 {fmtPct(h.mddFull)} 加深到 {fmtPct(h.mddAvoid)}，夏普 {fmtNum(h.sharpeFull)} → {fmtNum(h.sharpeAvoid)}。这些股票之后 60 日确实跑输（死猫跳存在），但回避它们降不了风险、扣掉买卖成本也不赚，两个写法都不晋级。
        </p>
        <p className="ss-p">
          这是全 A 股票池的结论，不等于对 ETF 或综合策略持仓的结论。2005–2014 年作探索，2015 年至 2023-10 作验证；2023-11 以后的数据没有读。信号日只用当日及以前的数据，跌停封死不能成交。
        </p>
      </div>
      <h3 className="ss-h3">判定：门槛与实际</h3>
      <p className="lab-legend">门槛：60 日超额 ≤ −1.5% 且 t ≤ −2；逐年稳定 = 去掉事件最多的一年后仍 ≤ −0.75%，且事件 ≥ 50 的年份里至少 60% 为负；降波动 = 同等仓位下波动比 ≤ 0.98 或回撤浅 ≥ 1 个百分点、夏普不低 0.02 以上，且优于随机剔除；扣成本后回避净收益 ≥ +1.0%。</p>
      <TableWrap label="两种回避写法在探索段和验证段的检验结果" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-dead-cat-bounce-table">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">写法</th>
              <th scope="col" className="num">事件数</th>
              <th scope="col" className="num">之后 60 日超额<span className="lab-th-sub">t 值</span></th>
              <th scope="col">超额显著</th>
              <th scope="col">逐年稳定</th>
              <th scope="col">降波动<span className="lab-th-sub">波动比</span></th>
              <th scope="col">扣成本<span className="lab-th-sub">回避净收益</span></th>
              <th scope="col">结论</th>
            </tr>
          </thead>
          <tbody>
            {NAMES.flatMap(({ id, name, rule }) => LAYERS.map(({ id: layer, name: layerName }) => {
              const r: Row = data.layers[layer][id]
              return (
                <tr key={`${id}-${layer}`}>
                  <th scope="row" className="lab-sticky">
                    {name} · {layerName}
                    {layer === 'explore' ? <span className="lab-rule">{rule}</span> : null}
                  </th>
                  <td className="num">{r.events.toLocaleString('en-US')}</td>
                  <td className="num">{fmtPct(r.mean, 2, true)}<span className="lab-th-sub">t {fmtNum(r.t, 2)}</span></td>
                  <td><Mark ok={r.s1} /></td>
                  <td><Mark ok={r.s2} /></td>
                  <td><Mark ok={r.s3} /><span className="lab-th-sub">{fmtNum(r.volRatio)}</span></td>
                  <td><Mark ok={r.s5} /><span className="lab-th-sub">{fmtPct(r.avoidNet, 2, true)}</span></td>
                  <td><strong>{r.grade}</strong></td>
                </tr>
              )
            }))}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">
        晋级要求探索段和验证段都「支持」。C1 两段都「{data.verdict.C1.validate}」；C2 只有验证段上界「{v.C2hi.grade}」，下界和探索段都不支持，所以也不晋级。
      </p>
      <h3 className="ss-h3">必须一起读的限制</h3>
      <ul className="ss-list" data-testid="lab-dead-cat-bounce-limits">
        <li>按事件逐个平均，反弹股之后反而小幅跑赢（验证段 {fmtPct(h.eventMean, 2, true)}）；按日历时间组合算是跑输。差别来自 2008、2015 这类事件扎堆的危机期——那时反弹股之后多是涨的。所以「死猫跳」只在平常年份明显，危机里不成立，这也是逐年稳定不过的原因。</li>
        <li>回避要换手：来回成本平均约 {fmtPct(data.costMean, 2)}，吃掉了大部分少亏的部分。</li>
        <li>和随机剔除同样多市值的股票比，C1 的波动比更低，但随机剔除本身会抬高波动（危机期停牌股多），这一项不能单独当成选股有效的证据。</li>
        <li>前后共记录 {data.trials} 条试验；探索变体全部只作报告，不能用来挽救结论。</li>
      </ul>
      <h3 className="ss-h3">威科夫完整吸筹形态：只出现 7 次，结案</h3>
      <p className="ss-p">机械化识别 2005 年至 2023-10 全部 A 股，每一步剩下的次数：</p>
      <TableWrap label="威科夫吸筹形态逐步筛选的次数" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-dead-cat-bounce-h3">
          <thead><tr><th scope="col" className="lab-sticky">形态阶段</th><th scope="col" className="num">次数</th></tr></thead>
          <tbody>
            {H3_STAGES.map(s => (
              <tr key={s.id}><th scope="row" className="lab-sticky">{s.name}</th><td className="num">{data.h3.stages[s.id]}</td></tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">
        走完整个形态的只有 {data.h3.stages.lps} 次（{Object.entries(data.h3.byYear).map(([y, n]) => `${y} 年 ${n} 次`).join('、')}），平均一年不到 0.4 次，凑不成可以检验的组合，不做预注册检验。截图里「缩量到 20 日均量的 30–50%」「止盈 2 倍止损」在威科夫原始资料里都找不到出处。
      </p>
      <h3 className="ss-h3">截图里的「做空胜率 77%」</h3>
      <ul className="ss-list" data-testid="lab-dead-cat-bounce-bulkowski">
        <li>形态统计作者 Bulkowski 的原始资料里没有「第一次反弹顶部做空胜率 77%」这个统计。</li>
        <li>77% 来自他的一个做多设定：单日暴跌 41%–46% 的股票，第 7 个交易日挂当天最低价买入、持有 42 天；样本内只有 43 笔，参数是一步步挑出来的，样本外只有 1 笔，不计滑点。方向和截图相反。</li>
        <li>最接近做空的数字是「67% 最终跌破暴跌当天低点」，但用的是事后才能确认的反弹顶部，没法直接交易。</li>
      </ul>
      <h3 className="ss-h3">处理</h3>
      <ul className="ss-list">
        <li>两个写法都不晋级，不改仓位规则，也不用于 ETF 或综合策略；威科夫形态结案，以后若重开须先写更短的形态定义、另起编号。</li>
        <li>历史统计，不构成买卖建议。</li>
      </ul>
    </article>
  )
}
