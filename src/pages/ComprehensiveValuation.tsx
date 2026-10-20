import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Download, RotateCcw } from 'lucide-react'
import { Page } from '../components/ui'
import { calculateScenarios, exampleInputs, SCENARIO_NAMES, type ValuationInputs } from '../features/comprehensive-valuation/model'
import '../styles/comprehensive-valuation.css'

const percent = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
const decimal = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const QUESTIONS = [
  { id: 'quality', name: '买什么', title: '资产质量', detail: '赚钱机制、资本回报与现金转换' },
  { id: 'pricing', name: '什么价格', title: '交叉估值', detail: '现价要求什么，价值依赖什么' },
  { id: 'expectations', name: '什么时候', title: '预期差与周期', detail: '不同判断的证据与验证日期' },
  { id: 'risk', name: '买多少', title: '风险与仓位', detail: '压力损失、相关暴露与退出能力' },
]
const METHODS = [
  ['研发资本化', '先核实已资本化部分，再按经济寿命建立研究资产。调整 EBIT = 披露 EBIT + 本期重分类研发 − 研究资产摊销。', '同步调整投入资本、现金税与再投资；重分类不增加现金流。获客资本化须有留存和回收证据。'],
  ['逆向 DCF', '固定利润率、再投资、折现率与终值，反解现价要求的增长或经营结果，再与产业证据比较。', '一个价格对应多组假设；与正向 DCF 是同一模型两个方向，不算独立验证。'],
  ['ROIC − WACC', '比较资本回报与资本成本的利差、持续期，以及新增投入的回报；增长需要相应再投资。', '不统一设 15% 门槛；研发、商誉、租赁口径须一致。银行保险改用行业资本回报框架。'],
  ['SOTP 分部估值', '各业务用适配方法估值，统一企业价值或股权价值口径，再桥接到每股价值。', '扣总部成本、资金投入、净债务与少数权益，避免重复；集团折溢价须有依据。'],
  ['正常化 PE / PEG', '盈利稳定时用正常化 EPS 与合理 PE；PEG 辅助比较同口径、可持续未来 EPS 增速。', '周期峰值、一次性损益、回购与低基数会失真。PEG 低不直接构成买入理由。'],
  ['现金流 / 行业锚', 'DCF 配对 FCFF/WACC 或 FCFE/股权成本；REIT、金融、管线研发按行业选择方法。', '列终值占比和敏感性；SBC、维护投入与稀释不能遗漏。PS 须连接成熟利润率和资本需求。'],
]
const CHECKS = [
  '价格日期、财报期、财年、币种与摊薄股数已统一',
  '研发、SBC、租赁、税、净债务与每股价值桥已核对',
  '主辅估值锚适用，共同假设与分歧已说明',
  '今日内在价值与未来情景价格已分开',
  '预期差有公开证据、阈值与验证日期；缺项已记录',
  '情景概率有依据或留空，未把主观概率称为胜率',
  '已单独检验尾部损失、融资与组合共振',
  '已写论点证伪、风险超限及验证到期的重评条件',
]

function ScenarioCalculator({ inputs, setInputs, currency, setCurrency }: {
  inputs: ValuationInputs
  setInputs(value: ValuationInputs): void
  currency: string
  setCurrency(value: string): void
}): JSX.Element {
  const result = calculateScenarios(inputs)
  const changeScenario = (index: number, field: 'price' | 'dividend' | 'probability', value: string) => {
    setInputs({ ...inputs, scenarios: inputs.scenarios.map((row, i) => i === index ? { ...row, [field]: value } : row) })
  }
  return (
    <section id="scenario" className="cv-calculator" aria-labelledby="cv-scenario-title">
      <div className="cv-section-heading">
        <div><h2 id="cv-scenario-title">把假设放进三种情景</h2><p>手工输入研究假设，即时比较收益与价差比。初始值为教学示例，非真实公司行情。</p></div>
        <button type="button" className="cv-button" onClick={() => { setInputs(exampleInputs()); setCurrency('CNY') }}><RotateCcw size={15} aria-hidden="true" />恢复示例</button>
      </div>
      <div className="cv-inputs">
        <label>当前每股价格<input type="number" min="0" step="any" value={inputs.current} onChange={e => setInputs({ ...inputs, current: e.target.value })} /></label>
        <label>兑现期限（年）<input type="number" min="0" step="any" value={inputs.years} onChange={e => setInputs({ ...inputs, years: e.target.value })} /></label>
        <label>统一计价币种<select value={currency} onChange={e => setCurrency(e.target.value)}><option value="CNY">人民币 CNY</option><option value="HKD">港元 HKD</option><option value="USD">美元 USD</option></select></label>
      </div>
      <p className="cv-note" id="cv-calculation-basis">下表填同一兑现时点的未来价格；分红为期间累计每股现金，不再投资。币种仅标注，不做换汇；未扣税费。概率可全部留空。</p>
      <div className="cv-table-wrap" role="region" aria-label="三情景输入与收益，可横向滚动" tabIndex={0}>
        <table className="cv-scenario-table" aria-describedby="cv-calculation-basis">
          <thead><tr><th scope="col">情景</th><th scope="col">未来每股价格</th><th scope="col">累计每股分红</th><th scope="col">概率 %（选填）</th><th scope="col">持有期 / 年化收益</th></tr></thead>
          <tbody>{inputs.scenarios.map((row, i) => (
            <tr key={SCENARIO_NAMES[i]}>
              <th scope="row">{SCENARIO_NAMES[i]}</th>
              {(['price', 'dividend', 'probability'] as const).map(field => <td key={field}><input type="number" min="0" max={field === 'probability' ? 100 : undefined} step="any" aria-label={`${SCENARIO_NAMES[i]}${field === 'price' ? '未来每股价格' : field === 'dividend' ? '累计每股分红' : '概率（%）'}`} value={row[field]} onChange={e => changeScenario(i, field, e.target.value)} placeholder={field === 'probability' ? '留空' : undefined} /></td>)}
              <td>{result.error ? '—' : <><strong>{percent(result.scenarios[i].returnRate)}</strong><small>年化 {percent(result.scenarios[i].annualized)}</small></>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {result.error ? <p role="alert" className="cv-error">{result.error}</p> : (
        <div className="cv-results" aria-live="polite" aria-atomic="true">
          <dl>
            <div><dt>基准上行 ÷ 悲观下行</dt><dd>{result.ratio === null ? '不适用' : `${decimal(result.ratio)} : 1`}</dd></div>
            <div><dt>2 : 1 对应研究价 · {currency}</dt><dd>{result.ratio === null ? '不适用' : decimal(result.threshold)}</dd></div>
            <div><dt>概率加权持有期收益</dt><dd>{result.expected === null ? '未计算' : percent(result.expected)}</dd></div>
          </dl>
          <p>{result.ratio === null ? '仅当悲观期末价值 < 现价 < 基准期末价值时，按本口径计算价差比与门槛研究价。' : `按未四舍五入数值，价差比${result.ratio >= 2 ? '达到' : '未达到'}约 2 : 1 的初筛偏好；这不证明有正期望或安全边际。`}</p>
          {result.probabilityError && <p className="cv-error" role="alert">{result.probabilityError}</p>}
          {result.expectedAnnualEquivalent !== null && <p>期望终值的年化等价：{percent(result.expectedAnnualEquivalent)}，不等于期望 CAGR。概率来自你的假设，不是实证胜率；三情景之外仍可能发生更大损失。</p>}
          <details><summary>计算口径与公式</summary><p>持有期收益 =（未来每股价格 + 累计每股分红）÷ 现价 − 1。年化 =（1 + 持有期收益）^(1 ÷ 年数) − 1。期望收益 = 各情景概率 × 对应收益之和。</p><p>令 Bear / Base 为含期间分红的期末价值，则 R =（Base − P）÷（P − Bear）；2 : 1 研究价 =（Base + 2 × Bear）÷ 3。它是按这些未来情景作的价差检验，未折现为今日内在价值，亦未扣机会成本。</p></details>
        </div>
      )}
      <p className="cv-warning">悲观情景不是保底，也不是最大回撤。请另测融资断裂、技术替代、流动性冻结及股权归零；本页不自动给出买卖评级或个人仓位。</p>
    </section>
  )
}

export default function ComprehensiveValuation(): JSX.Element {
  const [inputs, setInputs] = useState<ValuationInputs>(exampleInputs)
  const [currency, setCurrency] = useState('CNY')
  const [company, setCompany] = useState('')
  const [notes, setNotes] = useState(['', '', '', ''])
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false))
  const [exportError, setExportError] = useState('')
  const download = () => {
    const result = calculateScenarios(inputs)
    const lines = [
      '# 综合估值研究卡', `公司 / 代码：${company.trim() || '[MISSING]'}`, `导出日期：${new Date().toISOString().slice(0, 10)}（UTC）`,
      `币种：${currency}；现价：${inputs.current}；期限：${inputs.years} 年`,
      '手工研究假设，不是实时行情；所有情景须按同一证券、时点与币种核实。',
      ...inputs.scenarios.map((row, i) => `${SCENARIO_NAMES[i]}：未来每股价 ${row.price}；累计每股分红 ${row.dividend}；概率 ${row.probability.trim() ? `${row.probability}%` : '[未赋值]'}`),
      result.error ? `计算未完成：${result.error}` : [
        ...result.scenarios.map((row, i) => `${SCENARIO_NAMES[i]}：持有期 ${percent(row.returnRate)}；年化 ${percent(row.annualized)}`),
        `基准/悲观价差比：${result.ratio === null ? '不适用' : decimal(result.ratio) + ':1'}`,
        `2:1 对应研究价：${result.ratio === null ? '不适用' : decimal(result.threshold)} ${currency}`,
        `期望持有期收益：${result.expected === null ? '未计算' : percent(result.expected)}`,
        result.probabilityError ?? '',
      ].filter(Boolean).join('\n'),
      ...QUESTIONS.map((q, i) => `\n## ${q.name} · ${q.title}\n${notes[i].trim() || '[MISSING] 请补证据、来源日期与反证。'}`),
      '\n## 复核清单', ...CHECKS.map((label, i) => `- [${checked[i] ? 'x' : ' '}] ${label}`),
      '\n未扣税费、分红不再投资；情景价非今日内在价值；主观概率非胜率，悲观价非保底。勾选仅为自查，不代表独立审核。',
      '本报告仅供研究参考，不构成个人投资建议。',
    ]
    try {
      const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = '综合估值研究卡.md'; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportError('')
    } catch { setExportError('下载未能完成，请使用浏览器打印或复制页面内容保存。') }
  }
  return (
    <Page className="cv-page">
      <header className="cv-header">
        <h1>综合估值</h1>
        <p className="cv-lead">先看生意，再看价格。把预期差和能承受的损失，一起放进决策。</p>
        <p>四个问题，贯穿一次公司研究。用多种适用方法约束判断，再用情景测算核对赔率。</p>
        <div className="cv-links"><a href="#scenario">开始情景测算 ↓</a><Link to="/valuation">估值工作台 <ArrowUpRight size={15} aria-hidden="true" /></Link><Link to="/dcf">DCF 计算器 <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
      </header>
      <nav className="cv-overview" aria-label="综合估值四维导航">{QUESTIONS.map((q, i) => <a key={q.id} href={`#${q.id}`}><span>{i + 1} / {q.name}</span><strong>{q.title}</strong><small>{q.detail}</small></a>)}</nav>
      <section id="quality" className="cv-section" aria-labelledby="cv-quality-title">
        <h2 id="cv-quality-title">买什么：现金与资本回报支撑的好生意</h2>
        <div className="cv-two-column"><p>先拆“谁付钱 → 收费方式 → 量价与结构 → 利润 → 再投资与现金”。选出真正控制结果的 2–3 个变量，检验护城河能否变成可持续的每股现金。</p><ul><li>看 ROIC 与 WACC 的利差、持续期和增量回报，不统一套 15% 门槛。</li><li>增长需要再投资；历史高回报不保证新项目也赚钱。</li><li>核对现金转换、债务到期、股权激励与摊薄、回购价格和资本配置。</li></ul></div>
      </section>
      <section id="pricing" className="cv-section" aria-labelledby="cv-pricing-title">
        <h2 id="cv-pricing-title">什么价格：先还原财务，再交叉验证</h2>
        <p>选择适用的主锚与辅锚，解释共同假设和分歧。今日内在价值是折现到今天的现金流价值；未来情景价是某个兑现时点的假设交易价格，两者分列。</p>
        <div className="cv-table-wrap" role="region" aria-label="估值方法与使用边界，可横向滚动" tabIndex={0}><table className="cv-method-table"><thead><tr><th scope="col">工具</th><th scope="col">怎样用</th><th scope="col">必须核对</th></tr></thead><tbody>{METHODS.map(([name, use, limit]) => <tr key={name}><th scope="row">{name}</th><td>{use}</td><td>{limit}</td></tr>)}</tbody></table></div>
        <p className="cv-note">现金流折现与财报自动采集可进入 <Link to="/dcf">DCF 计算器</Link> / <Link to="/valuation">估值工作台</Link>。下方测算用于比较你已建立的未来情景，不自动生成财报或目标价。</p>
      </section>
      <ScenarioCalculator inputs={inputs} setInputs={setInputs} currency={currency} setCurrency={setCurrency} />
      <section id="expectations" className="cv-section" aria-labelledby="cv-expectations-title">
        <h2 id="cv-expectations-title">什么时候：让预期差有证据、有期限</h2>
        <div className="cv-two-column"><div><p>记录有日期的一致预期、你的不同假设、财务传导和验证窗口。缺少共识资料就标缺失，不能把自己的模型当市场预期。</p><p>宏观、利率与行业库存周期作为条件情景。降息可能伴随盈利下修、信用利差上升，不保证估值扩张。</p></div><div className="cv-equation"><strong>价格回报 = EPS 倍数 × PE 倍数 − 1</strong><p>假设 EPS 增长 30%：PE 15 → 25，价格回报 +116.67%；PE 60 → 25，价格回报 −45.83%。</p><small>仅适用于起末正 EPS、同口径情形；这是价格分解，不是预测。总回报还需分红、汇率与费用。</small></div></div>
      </section>
      <section id="risk" className="cv-section" aria-labelledby="cv-risk-title">
        <h2 id="cv-risk-title">买多少：先定义损失预算与退出条件</h2>
        <p>悲观价不保证损失有限。先独立检验融资断裂、经营与估值同时恶化等尾部，再看组合里有多少公司会因同一风险一起下跌。</p>
        <p className="cv-formula">仓位约束 ≤ min（单标的上限，损失预算 ÷ 压力损失率，流动性上限，行业 / 因子剩余额度）</p>
        <div className="cv-two-column"><ul><li>预算与损失按同一总资产基数；跳空和无法成交可能导致超预算。</li><li>多家同主题公司可能共享风险；危机时不能沿用平时的相关性。</li><li>退出分别记录：论点证伪、赔率不足、组合风险超限、验证期限届满。</li></ul><div><p>凯利只作辅助敏感性工具。二元赌局公式不能直接套用股票三情景；分数凯利也不保证安全，不覆盖已采用策略的仓位上限。</p><p className="cv-note">普通研究不自动给个人比例。项目个人策略仅在明确采用后适用；可结合 <Link to="/investment-plan-2026">投资计划</Link> 核对资金与纪律。</p></div></div>
      </section>
      <section id="research-card" className="cv-section" aria-labelledby="cv-card-title">
        <div className="cv-section-heading"><div><h2 id="cv-card-title">留下一张可复核的研究卡</h2><p>写事实与来源，再写假设、最大反证和下次验证日期。填写内容仅保留在当前页面，刷新前请下载。</p></div><button type="button" className="cv-button" onClick={download}><Download size={16} aria-hidden="true" />下载研究卡</button></div>
        <label className="cv-company">公司名称 / 代码<input value={company} onChange={e => setCompany(e.target.value)} placeholder="填写你正在研究的公司" /></label>
        <div className="cv-notes">{QUESTIONS.map((q, i) => <label key={q.id}>{q.name} · {q.title}<textarea rows={4} value={notes[i]} onChange={e => setNotes(notes.map((note, j) => i === j ? e.target.value : note))} placeholder="证据与来源日期 / 核心假设 / 最大反证 / 验证阈值与日期" /></label>)}</div>
        <fieldset className="cv-checklist"><legend>导出前自查 · {checked.filter(Boolean).length} / {CHECKS.length}</legend>{CHECKS.map((label, i) => <label key={label}><input type="checkbox" checked={checked[i]} onChange={e => setChecked(checked.map((value, j) => i === j ? e.target.checked : value))} /><span>{label}</span></label>)}</fieldset>
        {exportError && <p role="alert" className="cv-error">{exportError}</p>}
      </section>
      <footer className="cv-sources"><h2>方法来源与适用边界</h2><p>用户提出的四维框架经 Codex 与 Claude 讨论整合，嵌入项目五步研究流程；不代表各位投资大师共同采用这一套公式。框架尚未经过策略回测，勾选清单不代表独立审核。</p><p><a href="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/R%26D.htm">Damodaran：研发与估值</a> · <a href="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/growth.htm">增长与再投资</a> · <a href="https://www.oaktreecapital.com/insights/memo/thinking-about-macro">Marks：宏观预测</a> · <a href="https://web.stanford.edu/~boyd/papers/kelly.html">凯利与风险约束</a></p><p><Link to="/research-notes?tab=method">查看完整研究标准 →</Link></p><p>本页仅供研究参考，不构成个人投资建议。</p></footer>
    </Page>
  )
}
