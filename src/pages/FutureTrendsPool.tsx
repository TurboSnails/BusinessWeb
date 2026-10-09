import React, { useMemo, useState } from 'react'
import FutureCompanyLink from '../components/FutureCompanyLink'
import { POOL, downloadJson } from '../data/futureTrendsPool'
import { RESEARCH_BY_KEY, RESEARCH_INDEX, researchPercent } from '../data/futureTrendsResearch'
const card: React.CSSProperties = { background: 'var(--bg-card)', borderRadius: 12, padding: 20, marginBottom: 16, lineHeight: 1.8 }
const cell: React.CSSProperties = { padding: 12, borderBottom: '1px solid var(--system-gray5)', verticalAlign: 'top', textAlign: 'left' }
export default function FutureTrendsPool(): JSX.Element {
  const [query, setQuery] = useState('')
  const [market, setMarket] = useState('全部')
  const [depth, setDepth] = useState('全部')
  const rows = useMemo(() => POOL.filter(x => market === '全部' || x.market === market)
    .map(x => ({ x, r: RESEARCH_BY_KEY.get(x.key)! }))
    .filter(({ r }) => depth === '全部' || (depth === '公司证据摘录' ? r.core : !r.core))
    .filter(({ x, r }) => `${r.name} ${r.code} ${x.trends.join(' ')} ${r.riskGroup}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.r.core) - Number(a.r.core) || a.r.name.localeCompare(b.r.name, 'zh-CN')), [query, market, depth])
  return <>
    <section style={card}>
      <h2>候选池：逐家公司研究、核实盈利，再判断价格</h2>
      <p>2026-10-09 更新。目录共 {RESEARCH_INDEX.length} 家；上市候选池 {POOL.length} 家（中国 {POOL.filter(x => x.market === '中国').length}、海外 {POOL.filter(x => x.market === '海外').length}），非上市或状态待核 26 家仅保留产业观察二级页。每家公司有研究模块，深度与缺项明确标注。</p>
      <p>426 家取得腾讯延迟行情，时间逐条列示；其余不以旧价冒充最新价。20 家增加公司披露摘录与三情景草稿，其余为逐家初筛及既有材料复核。<strong>491 个页面不等于 491 份已认证深度报告。</strong></p>
      <p>旧模型把收入增速映射到 EPS、使用统一倍数与固定 45% / 50% 胜率，不能支持精确买入结论。本次撤回这些可投资解释：已认证估值 0 家，实际胜率均待校准。保本所需胜率只是给定悲观/基准情景的代数门槛。</p>
      <p>R=(Base−P)/(P−Bear)，仅 Bear&lt;P&lt;Base 有效；2:1 门槛 P*=(Base+2Bear)/3。情景假设未经独立方法验证前，达到门槛也不自动升级为买入。</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <label>搜索公司、代码或驱动 <input value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label>市场 <select value={market} onChange={e => setMarket(e.target.value)}>{['全部', '中国', '海外'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>研究深度 <select value={depth} onChange={e => setDepth(e.target.value)}>{['全部', '公司证据摘录', '初筛待核'].map(x => <option key={x}>{x}</option>)}</select></label>
        <button type="button" onClick={() => downloadJson('未来趋势候选研究-2026-10-09.json', rows.map(({ r }) => r))}>下载当前结果（{rows.length} 家）</button>
      </div>
    </section>
    <section style={card}><div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1350 }}>
      <thead><tr>{['公司 / 趋势', '价格 / 时间', '综合分析 / 证据深度', '盈亏比 / 胜率', '护城河', '隐忧 / 共同风险'].map(t => <th style={cell} key={t}>{t}</th>)}</tr></thead>
      <tbody>{rows.map(({ x, r }) => <tr key={r.key}>
        <td style={cell}><strong><FutureCompanyLink name={r.name} code={r.code} /></strong><div>{r.code} · {x.market}</div><div>{x.trends.join('、')}</div>{r.core && <strong>核心研究</strong>}</td>
        <td style={cell}>{r.priceText}<small style={{ display: 'block' }}>{r.priceDate}</small></td>
        <td style={{ ...cell, minWidth: 280 }}><strong>{r.rating}</strong><div>{r.headline}</div><small>{r.depth}；{r.valuationStatus}</small></td>
        <td style={cell}>{r.ratio === null ? '待建模／不适用' : `${r.ratio.toFixed(4)} : 1（假设）`}<div>基准 {researchPercent(r.up)}</div><div>悲观下行 {researchPercent(r.down)}</div><div>保本所需 {researchPercent(r.breakEven)}</div><div>实际胜率：[MISSING]</div></td>
        <td style={{ ...cell, minWidth: 220 }}>{r.moat}</td><td style={{ ...cell, minWidth: 250 }}>{r.concern}<div><strong>共同驱动：</strong>{r.riskGroup}</div></td>
      </tr>)}</tbody>
    </table>{rows.length === 0 && <p role="status">没有匹配公司，请调整筛选。</p>}</div></section>
  </>
}
