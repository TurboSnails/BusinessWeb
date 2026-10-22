import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isReport, loadReports, type ValuationReport } from '../valuation'
import { loadLast } from '../valuation/session'
import { applyMultiple, calculateMultiples, MULTIPLE_LABELS, MULTIPLE_METHODS, researchFromReport, type MultipleMethod, type MultipleRow, type MultipleResearch } from './multiples'
import type { ValuationInputs } from './model'

const names = ['悲观', '基准', '乐观']
const fields: [keyof MultipleRow, string][] = [['eps', '预测 EPS'], ['growth', 'EPS 增长率 %'], ['bvps', '预测每股净资产'], ['pe', '目标 PE'], ['peg', '目标 PEG'], ['pb', '目标 PB']]
const display = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
export default function MultiplesAnalysis({ research, setResearch, inputs, currency, onImport, onApply }: {
  research: MultipleResearch
  setResearch(value: MultipleResearch): void
  inputs: ValuationInputs
  currency: string
  onImport(value: ReturnType<typeof researchFromReport>): void
  onApply(value: ValuationInputs, method: MultipleMethod): void
}) {
  const [reports, setReports] = useState<ValuationReport[]>(() => {
    const last = loadLast()
    return [...(isReport(last) ? [last] : []), ...loadReports()].filter((r, i, all) => all.findIndex(x => x.createdAt === r.createdAt && x.snapshot.security.code === r.snapshot.security.code && x.snapshot.security.market === r.snapshot.security.market) === i)
  })
  const [selected, setSelected] = useState('0')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [reviewedBasis, setReviewedBasis] = useState('')
  const currentBasis = `${inputs.years}|${currency}`
  const basisChanged = research.source !== null && (research.source.years !== inputs.years || research.source.currency !== currency)
  const results = calculateMultiples(research, inputs.years)
  const update = (i: number, key: keyof MultipleRow, value: string) => setResearch({ ...research, adopted: null, rows: research.rows.map((row, index) => index === i ? { ...row, [key]: value } : row) })
  const importText = (text: string) => {
    try { onImport(researchFromReport(text)); setReviewedBasis(''); setError(''); setNotice('已导入财务假设与来源。尚未采用任何方法；核对期限、倍数依据后再带入情景。') }
    catch (e) { setError(e instanceof Error ? e.message : '报告导入失败。'); setNotice('') }
  }
  const adopt = (method: MultipleMethod) => {
    try {
      if (basisChanged && reviewedBasis !== currentBasis) throw new Error('期限或币种已改变，请先重新核对并确认每股假设。')
      onApply(applyMultiple(research, method, inputs), method)
      setError(''); setNotice(`已采用 ${MULTIPLE_LABELS[method]} 三情景价格；分红归零、概率留空，请重新核实。后续修改假设须再次采用。`)
    } catch (e) { setError(e instanceof Error ? e.message : '未能带入情景。'); setNotice('') }
  }
  return <section id="multiples" className="cv-section" aria-labelledby="cv-multiples-title">
    <h2 id="cv-multiples-title">PE、PEG、PB 估值分析</h2>
    <p>先解释盈利、增长与净资产，再选择合理倍数。三种方法分别判断，不自动平均；PE 与 PEG 共享 EPS 和增长假设，不算独立证据。</p>
    <div className="cv-import">
      <label>工作台报告<select value={reports.length ? selected : ''} onChange={e => setSelected(e.target.value)}><option value="" disabled>选择本机报告</option>{reports.map((r, i) => <option key={i} value={String(i)}>{r.snapshot.security.name} · {r.snapshot.security.code} · {r.snapshot.asOf}</option>)}</select></label>
      <button type="button" className="cv-button" disabled={!reports[Number(selected)]} onClick={() => importText(JSON.stringify(reports[Number(selected)]))}>导入所选工作台报告</button>
      <button type="button" className="cv-button" onClick={() => { const last = loadLast(); setReports([...(isReport(last) ? [last] : []), ...loadReports()].filter((r, i, all) => all.findIndex(x => x.createdAt === r.createdAt && x.snapshot.security.code === r.snapshot.security.code && x.snapshot.security.market === r.snapshot.security.market) === i)); setSelected('0') }}>刷新报告列表</button>
      <label className="cv-file">导入报告 JSON<input type="file" accept=".json,application/json" onChange={async e => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        if (file.size > 2 * 1024 * 1024) { setError('报告超过 2MB，请使用工作台导出的 JSON。'); return }
        try { importText(await file.text()) } catch { setError('文件读取失败，请重试。') }
      }} /></label>
    </div>
    <p className="cv-note">导入会替换本区假设、公司、币种、现价和期限，并清空旧收益情景、四维笔记与自查；保留旧研究请先下载。没有报告时可直接手填，也可前往 <Link to="/valuation">估值工作台</Link> 生成并保存报告。数据只在本机读取。</p>
    {research.source && <details className="cv-source" open><summary>已导入：{research.source.label} · {research.source.asOf} · {research.source.currency}</summary>
      <p>报告按预测年度与估值年份之差计期限（原值 {research.source.years} 年），并非精确卖出日期。导入后的编辑属于新的研究假设。</p>
      {research.source.rationales.map((r, i) => <p key={i}>{names[i]}：{r}</p>)}
      <ul>{research.source.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>
      {research.source.missing.length > 0 && <p className="cv-warning">数据缺口：{research.source.missing.join('；')}</p>}
    </details>}
    <div className="cv-inputs cv-multiple-context">
      <label>要求年化回报率 %（选填）<input type="number" step="any" value={research.requiredReturn} onChange={e => setResearch({ ...research, requiredReturn: e.target.value })} placeholder="留空不计算现价约束" /></label>
      <p>计价币种：{currency}；期限沿用下方情景表的 {inputs.years || '—'} 年。EPS 与净资产须为同一证券、同一币种的每股值。</p>
    </div>
    {basisChanged && <label className="cv-method-toggle cv-warning"><input type="checkbox" checked={reviewedBasis === currentBasis} onChange={e => setReviewedBasis(e.target.checked ? currentBasis : '')} />已按当前币种和兑现期限重新核对 / 重建每股假设（系统不自动换汇或外推盈利）</label>}
    <label className="cv-evidence">财务口径与日期<textarea rows={3} value={research.financialBasis} onChange={e => setResearch({ ...research, financialBasis: e.target.value })} placeholder="财报期、预测期、正常化调整、摊薄股数、来源与日期；未来EPS及净资产如何推导" /></label>
    <div className="cv-table-wrap" role="region" aria-label="三情景财务与倍数假设，可横向滚动" tabIndex={0}>
      <table className="cv-multiples-input"><thead><tr><th scope="col">情景</th>{fields.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead><tbody>{research.rows.map((row, i) => <tr key={i}><th scope="row">{names[i]}</th>{fields.map(([key, label]) => <td key={key}><input type="number" step="any" aria-label={`${names[i]}${label}`} value={row[key]} onChange={e => update(i, key, e.target.value)} /></td>)}</tr>)}</tbody></table>
    </div>
    <p className="cv-note">增长率填百分数，例如 20 表示 20%。PE 价格 = EPS × PE；PEG 价格 = EPS × PEG × 增速百分数；PB 价格 = 每股净资产 × PB。亏损、非正净资产或非正增长会按方法显示不适用。</p>
    <div className="cv-multiple-methods">{MULTIPLE_METHODS.map(method => <article key={method}>
      <h3>{MULTIPLE_LABELS[method]}</h3>
      <p>{method === 'pe' ? '适合正常化盈利可解释的公司；周期峰值低 PE 不代表便宜。' : method === 'peg' ? '只作增长比较辅锚；核实增长期限、基数与可持续性，不把 PEG < 1 当买入规则。' : '结合 ROE、资本成本与资产质量；银行及资产型企业可参考，轻资产公司低 PB 未必有意义。'}</p>
      <label className="cv-method-toggle"><input type="checkbox" checked={research.applicable[method]} onChange={e => setResearch({ ...research, adopted: null, applicable: { ...research.applicable, [method]: e.target.checked } })} />{MULTIPLE_LABELS[method]} 适用于本次研究</label>
      <dl>{results.map((row, i) => <div key={i}><dt>{names[i]}</dt><dd>{row[method].status === 'calculated' && row[method].price !== null ? <><strong>{display(row[method].price!)} {currency}</strong><small>{Number(inputs.years) > 0 ? `${inputs.years} 年后价格` : '估值基准日价格'}；要求回报下现价约束 {row[method].presentPrice == null ? '未计算' : display(row[method].presentPrice!)}</small></> : <span>{row[method].reason}</span>}</dd></div>)}</dl>
      <label className="cv-evidence">{MULTIPLE_LABELS[method]} 倍数依据<textarea rows={4} value={research.evidence[method]} onChange={e => setResearch({ ...research, evidence: { ...research.evidence, [method]: e.target.value } })} placeholder={method === 'pb' ? '历史/同行PB、ROE、资产减值、资本约束与溢折价理由；来源和日期' : '历史区间、可比公司、增长与风险差异、选取倍数的理由；来源和日期'} /></label>
      <button type="button" className="cv-button" onClick={() => adopt(method)}>采用 {MULTIPLE_LABELS[method]} 情景价</button>
    </article>)}</div>
    <label className="cv-evidence">共同假设、方法分歧与主辅锚理由<textarea rows={4} value={research.differences} onChange={e => setResearch({ ...research, differences: e.target.value })} placeholder="为何选此主锚；其他方法为何更高/更低或不适用；哪些输入相同；最大反证是什么" /></label>
    <p>{research.adopted ? `当前已采用 ${MULTIPLE_LABELS[research.adopted]} 情景价。` : '当前乘数假设尚未带入收益表；下方可能保留教学示例或先前手填价格。请核对后点击采用。'}</p>
    <p className="cv-note">现价约束 = 未来价格 ÷ (1 + 要求回报率)^年数，未含分红、税费；不代表确定内在价值。采用按钮只复制该方法的未来价格，绝不把折现后的现价约束当未来卖价。基准日估值需先建立未来假设，才能带入收益表。</p>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="cv-error">{error}</p>}
  </section>
}
