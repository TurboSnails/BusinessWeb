import React, { useMemo, useState } from 'react'
import { Calculator, Copy, RotateCcw } from 'lucide-react'
import { Page } from '../components/ui'
import { PageTitle } from '../components/ui/PageTabs'
import { calcFreedom, calcProgress, fourPercentRule, TEMPLATES, wan, type FreedomInput } from '../features/money-freedom/model'
import '../styles/money-freedom.css'

type Raw = Record<'monthly' | 'years' | 'childCost' | 'children' | 'health' | 'major' | 'age' | 'savings' | 'income' | 'rate', string>

const BLANK: Raw = { monthly: '', years: '40', childCost: '', children: '', health: '', major: '', age: '', savings: '', income: '', rate: '0' }
const num = (v: string): number => (v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0)
const fromTemplate = (t: FreedomInput): Partial<Raw> => ({
  monthly: String(t.monthly), years: String(t.years), childCost: String(t.childCost),
  children: String(t.children), health: String(t.health), major: String(t.major),
})

const FIELDS: Array<{ key: keyof Raw; label: string; unit: string; hint: string; step?: string }> = [
  { key: 'monthly', label: 'X 月开销', unit: '元/月', hint: '吃穿用行与娱乐，不含房租/房贷', step: '100' },
  { key: 'years', label: '年', unit: '年', hint: '还要花钱的年数；480 = 40 年 × 12 个月（30 岁到 70 岁）' },
  { key: 'childCost', label: 'K 每个孩子的成本', unit: '万元', hint: '从出生到大学毕业' },
  { key: 'children', label: 'n 小孩数', unit: '个', hint: '没有就填 0' },
  { key: 'health', label: 'M 健康开销', unit: '万元', hint: '医疗、保险、养老中保险覆盖不到的部分' },
  { key: 'major', label: 'H 重大投入', unit: '万元', hint: '房、车、赡养父母等；房已还清可不填' },
]

export default function MoneyFreedom(): JSX.Element {
  const [raw, setRaw] = useState<Raw>(BLANK)
  const [notice, setNotice] = useState('')
  const set = (key: keyof Raw, value: string) => { setRaw(cur => ({ ...cur, [key]: value })); setNotice('') }

  const input: FreedomInput = {
    monthly: num(raw.monthly), years: num(raw.years), childCost: num(raw.childCost),
    children: num(raw.children), health: num(raw.health), major: num(raw.major),
  }
  const result = useMemo(() => calcFreedom(input), [raw.monthly, raw.years, raw.childCost, raw.children, raw.health, raw.major]) // eslint-disable-line react-hooks/exhaustive-deps
  const rule = fourPercentRule(input.monthly)
  const hasProgress = raw.age.trim() !== '' && raw.income.trim() !== ''
  const progress = useMemo(
    () => calcProgress(result.total, input.monthly, { age: num(raw.age), savings: num(raw.savings), income: num(raw.income), rate: num(raw.rate) }),
    [result.total, raw.monthly, raw.age, raw.savings, raw.income, raw.rate], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const summary = () => {
    const lines = [`我的自由数字：约 ${wan(result.total)}元`,
      `日常生活 ${wan(result.daily)} · 养孩子 ${wan(result.children)} · 健康 ${wan(result.health)} · 重大投入 ${wan(result.major)}`]
    if (hasProgress && progress.freedomAge !== null) lines.push(`按当前储蓄节奏，约 ${progress.freedomAge.toFixed(1)} 岁自由`)
    return lines.join('\n')
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(summary()); setNotice('已复制到剪贴板。') } catch { setNotice('浏览器不允许写入剪贴板，请手动复制。') }
  }

  const parts: Array<[string, number]> = [['日常生活', result.daily], ['养孩子', result.children], ['健康', result.health], ['重大投入', result.major]]

  return <Page className="mf-page">
    <PageTitle>财富自由计算器</PageTitle>
    <div className="page-toolbar">
      <span className="page-toolbar__note">多少钱可以财富自由？公式：480X + K×n + M + H。纯本地计算，不会上传任何输入。</span>
    </div>

    <section className="mf-card">
      <div className="mf-heading"><div className="mf-badge"><Calculator size={18} /></div>
        <div><h2>你的自由数字</h2><p>X 为 元/月，K、M、H 为 万元；选一个模板起步，再按自己的情况改。模板只是粗略示例，不是城市平均值。</p></div></div>
      <div className="mf-templates" role="group" aria-label="模板">
        {TEMPLATES.map(t => <button key={t.id} type="button" className="tool-btn" onClick={() => { setRaw(cur => ({ ...cur, ...fromTemplate(t.value) })); setNotice('') }}>{t.label}</button>)}
      </div>
      <div className="mf-form">
        {FIELDS.map(f => <label key={f.key}>{f.label}（{f.unit}）
          <input type="number" min="0" step={f.step ?? '1'} inputMode="decimal" value={raw[f.key]} onChange={e => set(f.key, e.target.value)} placeholder="—" />
          <small>{f.hint}</small></label>)}
      </div>
      <div className="mf-total" aria-live="polite">
        <small>这辈子大约要准备</small>
        <strong>{result.total > 0 ? `${wan(result.total)}元` : '—'}</strong>
        <ul>{parts.map(([name, v]) => <li key={name}><span>{name}</span><b>{wan(v)}</b></li>)}</ul>
      </div>
    </section>

    <section className="mf-card">
      <div className="mf-heading"><div><h2>离自由还有多远</h2><p>每月能存下 = 月收入 − 月开销；收益率按复利逐月计算，不含通胀。</p></div></div>
      <div className="mf-form">
        <label>龄 当前年龄（岁）<input type="number" min="0" value={raw.age} onChange={e => set('age', e.target.value)} placeholder="—" /></label>
        <label>存 现有储蓄与投资（万元）<input type="number" min="0" value={raw.savings} onChange={e => set('savings', e.target.value)} placeholder="—" /></label>
        <label>薪 税后月收入（元/月）<input type="number" min="0" step="100" value={raw.income} onChange={e => set('income', e.target.value)} placeholder="—" /></label>
        <label>% 预期年化收益（%）<input type="number" min="0" step="0.5" value={raw.rate} onChange={e => set('rate', e.target.value)} />
          <small>存款类 1–2%，保守投资约 3%，0 表示只存不投</small></label>
      </div>
      <div className="mf-progress">
        <progress max={1} value={progress.ratio} aria-label="目标完成度" />
        <span>已有 {(progress.ratio * 100).toFixed(1)}%</span>
      </div>
      <div className="mf-result">
        <div><small>每月能存下</small><strong className={progress.monthlySaving >= 0 ? 'mf-pos' : 'mf-neg'}>{hasProgress ? `¥${progress.monthlySaving.toLocaleString('zh-CN')}` : '—'}</strong></div>
        <div><small>还需要</small><strong>{hasProgress && progress.yearsNeeded !== null ? `${progress.yearsNeeded.toFixed(1)} 年` : '—'}</strong></div>
        <div><small>梦想在几岁自由</small><strong>{hasProgress && progress.freedomAge !== null && result.total > 0 ? `${progress.freedomAge.toFixed(1)} 岁` : '—'}</strong></div>
      </div>
      {hasProgress && result.total > 0 && progress.yearsNeeded === null && <p className="mf-warn" role="alert">按当前收入与开销存不下钱（或收益不足以覆盖差额），无法达成目标。</p>}
    </section>

    <section className="mf-card">
      <h2>另一种算法：4% 法则</h2>
      <p className="mf-note">年开销 × 25 = 300X。假设每年取出本金的 4% 可以永续，前提是投资长期跑赢 4% 加通胀。</p>
      <p className="mf-rule">按你的月开销：<strong>{input.monthly > 0 ? `${wan(rule)}元` : '—'}</strong>{input.monthly > 0 && result.total > 0 && `（比 480X 口径少 ${wan(Math.max(0, result.total - rule))}）`}</p>
    </section>

    <div className="mf-actions">
      <button type="button" className="tool-btn" onClick={() => void copy()} disabled={result.total <= 0}><Copy size={15} aria-hidden="true" /> 复制我的结果</button>
      <button type="button" className="tool-btn" onClick={() => { setRaw(BLANK); setNotice('') }}><RotateCcw size={15} aria-hidden="true" /> 恢复默认</button>
      {notice && <span className="mf-notice" role="status">{notice}</span>}
    </div>
    <p className="mf-note">两种算法都没有计入通胀。公式来自网上流传的算法，结果仅供参考，不构成投资建议。</p>
  </Page>
}
