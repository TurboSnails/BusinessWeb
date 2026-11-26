import { Link } from 'react-router-dom'
import React from 'react'
import { TableWrap } from '../../components/ui'
import { pct } from './LateCycleStudy'
import data from './data/druckenmiller.json'

export default function DruckenmillerNote(): JSX.Element {
  return (
    <article className="ss-section lab-study" id="lab-druckenmiller" aria-labelledby="lab-druckenmiller-title" data-testid="lab-druckenmiller">
      <p className="lab-status">{data.date} · 事实核查 · 不是回测</p>
      <h2 id="lab-druckenmiller-title">德鲁肯米勒「这次逃顶了」核查</h2>

      <div className="ss-cover lab-answer" data-testid="lab-druckenmiller-answer">
        <p className="ss-cover__kicker">结论</p>
        <p className="ss-cover__summary">
          {data.verdict}。他 9 月在高点前把 AI 相关敞口减到半年前的约 20%；但公开说「不做多股票」是在 11 月 17 日，那时标普已比 {data.peak.date} 的纪录高点低约 6%。
        </p>
        <p className="ss-p">
          9 月 30 日的 13F 仍有约 45 亿美元美股多头。到 {data.latest.date}，标普比高点低约 {pct(Math.abs(data.latest.fromPeak))}，还不能确认已经见顶。
        </p>
      </div>

      <h3 className="cs-subhead">时间线</h3>
      <TableWrap label="德鲁肯米勒减仓与标普走势时间线" className="lab-wrap">
        <table className="cs-table lab-table" data-testid="lab-druckenmiller-timeline">
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">日期</th>
              <th scope="col">事件</th>
              <th scope="col">来源</th>
            </tr>
          </thead>
          <tbody>
            {data.timeline.map(t => (
              <tr key={t.date}>
                <th scope="row" className="lab-sticky lab-nowrap">{t.date}</th>
                <td>{t.event}</td>
                <td>{t.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">
        13F 只含美股多头和部分期权，是季度末快照、滞后约 45 天，看不到期货、外汇、债券和空头，所以无法判断他的净敞口，也无法复刻业绩。
      </p>

      <h3 className="cs-subhead">能不能回测</h3>
      <div className="lab-cols" data-testid="lab-druckenmiller-testable">
        <section aria-labelledby="lab-druck-yes">
          <h4 id="lab-druck-yes" className="lab-cols__title">能写成规则的</h4>
          <ul className="ss-list">
            {data.testable.map(x => <li key={x}>{x}</li>)}
          </ul>
        </section>
        <section aria-labelledby="lab-druck-no">
          <h4 id="lab-druck-no" className="lab-cols__title">不能回测的</h4>
          <ul className="ss-list">
            {data.untestable.map(x => <li key={x}>{x}</li>)}
          </ul>
        </section>
      </div>
      <p className="ss-p">
        能写成规则的那些，现行宏观攻守多数已经包含（联储利率路径、长短利差、企业债利差、十个月均线）。「利率收紧加价格破位」这一类写法并进了 <Link to={{ search: '?tab=trend', hash: '#lab-trend' }}>趋势防下跌研究</Link>，按预注册检验：在 1872–1934 年的数据里，利率收紧没有给价格破位提供额外信息。
      </p>

      <p className="ss-note" role="note">
        以 SEC 13F 申报和可信媒体转述的原话为主，11 月 17 日的发言只找到媒体转述，原始视频未找到。数字出处：{data.source}。不构成买卖建议。
      </p>
    </article>
  )
}
