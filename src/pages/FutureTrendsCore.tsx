import React from 'react'
import FutureCompanyLink from '../components/FutureCompanyLink'
import { CORE } from '../data/futureTrendsCore'
import { downloadJson } from '../data/futureTrendsPool'
import { RESEARCH_ASOF, researchMoney, researchPercent } from '../data/futureTrendsResearch'
const card: React.CSSProperties = { background: 'var(--bg-card)', borderRadius: 12, padding: 20, marginBottom: 16, lineHeight: 1.8 }
const td: React.CSSProperties = { padding: 12, verticalAlign: 'top', borderBottom: '1px solid var(--system-gray5)', textAlign: 'left' }
export default function FutureTrendsCore(): JSX.Element {
  const groups = Object.entries(CORE.reduce<Record<string, string[]>>((m, x) => { (m[x.research.primaryTrend] ??= []).push(x.research.name); return m }, {}))
  const common = Object.entries(CORE.reduce<Record<string, string[]>>((m, x) => { (m[x.research.riskGroup] ??= []).push(x.research.name); return m }, {}))
  return <>
    <section style={card}>
      <h2>核心 {CORE.length}：分散盈利驱动的长期研究名单</h2>
      <p>复核 {RESEARCH_ASOF}；研究期限至 2027 年底及以后。按经营壁垒、现金来源与风险互补选择；核心身份与现价买入资格分开。目前所有价格情景均未完成第二种独立方法认证，<strong>已认证现价买入 0 家</strong>，不能按旧筛选赔率直接建仓。</p>
      <p>每家公司名称均可进入完整二级研究页，查看经营事实、三情景假设、盈亏比计算、护城河、隐忧和证伪条件。东京电子须先核拆股后报价；万华正常化盈利仍待产品价差模型验证。</p>
      <h3>主要业务分布</h3><p>占比是等额研究名额占比，不是实际持仓、风险贡献或配置建议。单一方向最多 {Math.max(...groups.map(([, list]) => list.length))} / {CORE.length} 家。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>{groups.map(([name, list]) => <div key={name} style={{ border: '1px solid var(--system-gray5)', padding: 12, borderRadius: 8 }}><strong>{name} · {list.length} 家 · {(list.length / CORE.length * 100).toFixed(0)}%</strong><div>{list.join('、')}</div></div>)}</div>
      <h3>合并共同风险检查</h3><ul>{common.map(([name, list]) => <li key={name}><strong>{name}：</strong>{list.join('、')}</li>)}</ul>
      <p>跨标签仍有相关性：微软、Alphabet、东京电子共享 AI 资本开支周期；汇川、柏楚共享制造业设备投资；空客与 RTX 共享发动机供应链；药明、阿斯利康和美敦力均暴露医疗政策。腾讯与舜宇仍受中国消费影响；公用事业与工业气体也可能受利率冲击。没有协方差和持仓权重数据，不能宣称已完成组合风险优化。</p>
      <details><summary>本次名单调整与理由</summary><p>新增微软、汇川技术、国电南瑞、RTX、林德、Novonesis，分别补充企业软件、工业控制、电网、发动机售后、工业气体与工业酶；移出亚马逊、海康威视、纽威数控、安进、西门子、上海机场。移出代表本轮研究优先级变化，不是认定公司恶化。</p><p>柏楚按实际激光控制业务归入工业自动化／机器人；Novonesis 按工业酶理解前沿生物技术；美敦力不当作纯脑机接口标的。不为凑赛道纳入缺可靠财务的非上市公司。</p></details>
    </section>
    <section style={card}>
      <button type="button" onClick={() => downloadJson(`未来趋势核心研究-${RESEARCH_ASOF}.json`, CORE.map(x => x.research))}>下载核心研究摘要</button>
      <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1250 }}>
        <thead><tr>{['公司 / 主要业务', '价格与状态', '长期壁垒与保留理由', '条件盈亏比', '价格门槛与胜率', '隐忧'].map(x => <th style={td} key={x}>{x}</th>)}</tr></thead>
        <tbody>{CORE.map(({ research: r }) => <tr key={r.key}>
          <td style={td}><strong><FutureCompanyLink name={r.name} code={r.code} /></strong><div>{r.code}</div><div>{r.primaryTrend}</div></td>
          <td style={td}>{r.priceText}<small style={{ display: 'block' }}>{r.priceDate}</small><div>{r.rating}</div></td>
          <td style={{ ...td, minWidth: 260 }}>{r.moat}</td>
          <td style={td}><strong>{r.ratio === null ? '不适用／缺失' : `${r.ratio.toFixed(4)} : 1`}</strong><div>基准上行 {researchPercent(r.up)}</div><div>悲观下行 {researchPercent(r.down)}</div><small>情景假设，未认证</small></td>
          <td style={td}>2:1 门槛 {researchMoney(r.threshold, r.currency)}<div>保本所需胜率 {researchPercent(r.breakEven)}</div><div>实际胜率：未校准</div><small>门槛不是建议买入价；悲观价不是最大损失。</small></td>
          <td style={{ ...td, minWidth: 250 }}>{r.concern}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </>
}
