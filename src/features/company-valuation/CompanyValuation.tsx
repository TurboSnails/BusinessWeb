import { Link } from 'react-router-dom'
import type { Company } from '../../data/companies'
import { Card, TableWrap } from '../../components/ui'
import { compareValuation, STATUS_LABEL, VALUATION_FILTERS, type ValuationFilter } from './model'
import { getValuationPresentation } from './presentation'
import './company-valuation.css'
const fmt = (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const pct = (v: number | null) => v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
export function CompanyValuationCell({ company }: { company: Company }) {
  const r = company.valuation
  const to = `/research-notes/${company.market}/${encodeURIComponent(company.code)}#company-valuation`
  if (!r) return <Link to={to} className="rn-valuation" aria-label={`估值 ${company.code} 等待数据`}>等待估值数据</Link>
  const p = getValuationPresentation(r, company.marketRefresh)
  const fullLabel = p.positionLabel ? `${p.headline} · ${p.positionLabel}` : p.headline
  const fullTitle = [
    r.value ? `${r.value.primaryMethod}；基准 ${fmt(r.value.base)} ${r.currency}；区间 ${fmt(r.value.low)}–${fmt(r.value.high)} ${r.currency}` : '暂无数值估值',
    p.timingLabel,
    STATUS_LABEL[r.status],
    r.missing.length > 0 ? `待补证据：${r.missing.join('；')}` : null,
    '情景参考不认证为今日内在价值。点击查看推导。',
  ].filter(Boolean).join('；')

  return (
    <Link
      to={to}
      className={`rn-valuation is-${p.tone} is-${p.emphasis}`}
      aria-label={`估值 ${company.code} ${fullLabel}`}
      title={fullTitle}
    >
      <span className="rn-valuation__headline">
        <strong className="rn-valuation__judgment">{fullLabel}</strong>
      </span>
      {r.value ? (
        <>
          <small>基准 {fmt(r.value.base)} · 现价 {p.current === null ? '—' : fmt(p.current)} {r.currency}</small>
          <small>{r.value.primaryMethod} · 报价 {p.priceDate ?? '日期待核'}{p.evidenceNote && <> · <span className="rn-valuation__evidence">{p.evidenceNote}</span></>}</small>
        </>
      ) : (
        p.current !== null && <small>现价 {fmt(p.current)} {r.currency} · 报价 {p.priceDate ?? '日期待核'}</small>
      )}
      {!r.value && p.evidenceNote && <small className="rn-valuation__evidence">{p.evidenceNote}</small>}
    </Link>
  )
}
export function CompanyValuationFilterChips({ value, onChange }: { value: ValuationFilter; onChange(value: ValuationFilter): void }) {
  return <span className="ui-cluster" role="group" aria-label="综合估值筛选">{VALUATION_FILTERS.map(f => <button key={f.id} type="button" aria-pressed={value === f.id} className={value === f.id ? 'tool-btn tool-btn--primary' : 'tool-btn'} onClick={() => onChange(f.id)}>{f.label}</button>)}</span>
}
function sourceHref(url: string) {
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('research/') || url.startsWith('data/')) return `${import.meta.env.BASE_URL}${url}`
  if (url.startsWith('public/')) return `${import.meta.env.BASE_URL}${url.slice(7)}`
  return null
}
export function CompanyValuationDetail({ company }: { company: Company }) {
  const r = company.valuation
  const c = r ? compareValuation(r, company.marketRefresh?.tradability === 'unverified' ? undefined : company.marketRefresh) : null
  return <section id="company-valuation" className="company-valuation-detail" aria-label="综合估值分析">
    <Card title={`综合估值 · ${r ? STATUS_LABEL[r.status] : '等待数据'}`}>
      {!r ? <p>尚未加载该公司的综合估值记录；不以旧 DCF 或旧情景价格冒充本轮估值。</p> : <>
        <p className="rn-text">估值日期 {r.asOf} · {r.currency} · {r.review.mode === 'programmatic' ? '批量条件分析，未经逐项独立核验' : r.review.note}。研究评级仍沿用原研究；下列估值与价格关系不自动改变评级。</p>
        {r.value && c ? <div className="company-valuation-summary">
          <p><strong>{r.value.primaryMethod} · {c.label}：{fmt(r.value.low)}–{fmt(r.value.high)} {r.currency}</strong><br />基准 {fmt(r.value.base)}；价值时点 {r.value.date ?? '未定义，不能计算年化'}</p>
          <p>对比现价 {c.current === null ? '缺失' : fmt(c.current)} {r.currency}（{c.priceDate ?? '缺价格日期'}）<br />低 / 基准 / 高相对现价：{pct(c.lowGap)} / {pct(c.baseGap)} / {pct(c.highGap)}</p>
        </div> : <p className="rn-warn-text">关键证据不足，暂不发布数值估值。</p>}
        <p>{r.pricing}</p>
        <TableWrap label="综合估值方法与精简推导"><table className="ui-table rn-table company-valuation-table"><thead><tr><th>方法</th><th>适用性与依据</th><th>推导与输入</th><th>低 / 基准 / 高</th></tr></thead><tbody>{r.methods.map(m => <tr key={m.name}><th scope="row">{m.name}</th><td>{m.applicable ? '适用 / 条件适用：' : '不适用 / 待证据：'}{m.reason}</td><td>{m.formula || '—'}<details><summary>查看输入与来源编号</summary><pre>{JSON.stringify(m.inputs, null, 2)}</pre><small>{m.sourceIds.join('；') || '无数值来源'}</small></details></td><td>{m.values ? m.values.map(fmt).join(' / ') : '—'}</td></tr>)}</tbody></table></TableWrap>
        <dl className="company-valuation-evidence"><dt>资产质量</dt><dd>{r.quality}</dd><dt>预期差与验证</dt><dd>{r.expectations}</dd><dt>压力风险</dt><dd>{r.risk}</dd></dl>
        <h3>研究假设与方法分歧</h3><ul>{r.assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul>
        {r.missing.length > 0 && <><h3>待补证据</h3><ul>{r.missing.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
        <details><summary>数据来源与复核范围</summary><p>{r.review.by} · {r.review.note}</p><ul>{r.sources.map(s => <li key={s.id}>{sourceHref(s.url) ? <a href={sourceHref(s.url)!} target="_blank" rel="noreferrer">{s.title}</a> : <span>{s.title}（{s.url}）</span>} · {s.asOf} · {s.id}</li>)}</ul></details>
        <p className="rn-footnote">列表低估/情景偏低幅度分母为基准价（现价 / 基准价 − 1），详情相对现价空间分母为现价（估值 / 现价 − 1），两者分母不同。情景区间不代表价格托底，未定期限与未来情景不认证为今日内在价值；区间内弱色提示，区间外强色提示。历史资料日期与估值日期分别保留；具体待核事项见缺项与推导。</p>
      </>}
      <p><Link to="/invest/comprehensive-valuation">按综合估值方法继续研究 →</Link></p>
    </Card>
  </section>
}
