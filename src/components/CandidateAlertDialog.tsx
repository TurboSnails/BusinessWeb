import React, { useState } from 'react'
import { BellRing } from 'lucide-react'
import { Dialog, Field } from './ui'
import '../styles/candidates.css'
import { ALERT_ANCHOR_LABEL } from '../features/candidates/validation'
import type { AlertCurrency, AlertDirection, CandidateAlertRule } from '../features/candidates/validation'
import { alertProblem, buildAlertRule, manualAnchor, STALE_TRADING_DAYS, type AnchorOption, type PriceObservation } from '../features/candidates/priceAlert'

export interface AlertSaveResult { synced: boolean; message?: string }

const fmt = (n: number): string => n.toLocaleString('zh-CN', { maximumFractionDigits: 4 })
const sameAnchor = (a: AnchorOption, rule: CandidateAlertRule): boolean =>
  a.type === rule.anchor.type && a.value === rule.anchor.value && a.asOf === rule.anchor.asOf && a.currency === rule.currency

/** 当前规则的锚点不在可选列表里（研究已更新）时，保留它作为一个选项，避免打开再保存就悄悄换掉来源 */
function optionsWith(anchors: AnchorOption[], rule: CandidateAlertRule | undefined): AnchorOption[] {
  if (!rule || rule.anchor.type === 'manual' || anchors.some(a => sameAnchor(a, rule))) return anchors
  return [{ ...rule.anchor, currency: rule.currency, label: `${ALERT_ANCHOR_LABEL[rule.anchor.type]}（设置时）` }, ...anchors]
}

/**
 * 候选公司的价位提醒：条件价从研究数据预填（每个来源写明日期），可改。
 * 触发时只在「今日待处理」提示复核，不是买卖信号。
 */
export default function CandidateAlertDialog({ open, onClose, name, rule, anchors, price, currency, cloud, today, onSave }: {
  open: boolean
  onClose: () => void
  name: string
  rule?: CandidateAlertRule
  /** 研究数据给出的条件价候选（悲观价、基准价、自动 DCF 买入参考价） */
  anchors: AnchorOption[]
  /** 最新收盘价（显示用，也作为手动条件价的参照） */
  price?: PriceObservation
  /** 交易地币种，手动填写时使用 */
  currency: AlertCurrency
  /** 是否已连接云端同步 */
  cloud: boolean
  /** 本地日期 YYYY-MM-DD */
  today: string
  /** 传 undefined 表示删除提醒 */
  onSave: (rule: CandidateAlertRule | undefined) => Promise<AlertSaveResult | void> | AlertSaveResult | void
}): JSX.Element | null {
  const options = optionsWith(anchors, rule)
  const initial = rule ? (rule.anchor.type === 'manual' ? -1 : options.findIndex(a => sameAnchor(a, rule))) : options.length ? 0 : -1
  const [source, setSource] = useState<number>(initial)
  const [threshold, setThreshold] = useState<string>(() => String(rule?.threshold ?? options[0]?.value ?? ''))
  const [kind, setKind] = useState<AlertDirection>(rule?.kind ?? 'price-below')
  const [enabled, setEnabled] = useState<boolean>(rule?.enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const picked = source >= 0 ? options[source] : undefined
  const ruleCurrency: AlertCurrency = picked?.currency ?? rule?.currency ?? (price && ['CNY', 'HKD', 'USD'].includes(price.currency) ? price.currency as AlertCurrency : currency)
  const choose = (index: number): void => {
    setSource(index); setError('')
    if (index >= 0) setThreshold(String(options[index].value))
  }

  const run = async (next: CandidateAlertRule | undefined): Promise<void> => {
    setSaving(true); setError('')
    try {
      const result = await onSave(next)
      if (result && !result.synced) { setError(result.message ?? '云端同步失败，已保存在本机'); return }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const save = (): void => {
    const value = Number(threshold)
    const anchor = picked ?? (rule?.anchor.type === 'manual' && rule.currency === ruleCurrency ? rule.anchor : manualAnchor(price?.currency === ruleCurrency ? price : undefined, value, today))
    const next = buildAlertRule({ kind, threshold: value, currency: ruleCurrency, anchor, enabled, createdAt: new Date().toISOString() })
    const problem = threshold.trim() === '' ? '条件价要填一个大于 0 的数' : alertProblem(next)
    if (problem) { setError(problem); return }
    void run(next)
  }

  const priceMismatch = price && price.currency !== ruleCurrency
  return (
    <Dialog open={open} onClose={onClose} icon={<BellRing size={20} />} title={`价位提醒 · ${name}`} className="alert-dialog"
      actions={<>
        {rule && <button type="button" className="tool-btn tool-btn--danger" disabled={saving} onClick={() => void run(undefined)}>删除提醒</button>}
        <button type="button" className="tool-btn" onClick={onClose}>取消</button>
        <button type="button" className="tool-btn tool-btn--primary" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>
      </>}>
      <p className="alert-lead">到了你设的价位，「今日待处理」会提示你复核一眼。这是复核提醒，不是买卖信号。只按每日收盘价判断；行情超过 {STALE_TRADING_DAYS} 个交易日没更新时暂停判断。</p>
      {!cloud && <p className="alert-note">未连接云端：提醒仅保存在本机浏览器。</p>}
      <p className="alert-price">
        {price ? <>最新收盘价 {price.currency} {fmt(price.price)}<small>（{price.date}，{price.source}）</small></> : '暂无带日期的收盘价，保存后等行情更新再判断。'}
      </p>
      <fieldset className="alert-sources">
        <legend>条件价来源</legend>
        {options.map((a, n) => (
          <label key={`${a.type}-${n}`} className="alert-source">
            <input type="radio" name="alert-source" checked={source === n} onChange={() => choose(n)} />
            <span>{a.label}：{a.currency} {fmt(a.value)}<small>（{a.asOf}{a.note ? `，${a.note}` : ''}）</small></span>
          </label>
        ))}
        <label className="alert-source">
          <input type="radio" name="alert-source" checked={source < 0} onChange={() => choose(-1)} />
          <span>{ALERT_ANCHOR_LABEL.manual}<small>（以当前收盘价作参照）</small></span>
        </label>
        {!options.length && <p className="alert-note">这家公司还没有研究估值区间或自动 DCF 买入参考价，只能手动填写。</p>}
      </fieldset>
      <div className="ui-form-grid">
        <Field label="触发条件">
          <select value={kind} onChange={e => setKind(e.target.value as AlertDirection)}>
            <option value="price-below">收盘价 ≤ 条件价</option>
            <option value="price-above">收盘价 ≥ 条件价</option>
          </select>
        </Field>
        <Field label={`条件价（${ruleCurrency}）`} hint={picked ? `来自${picked.label}，可改` : '手动填写'}>
          <input type="number" inputMode="decimal" min="0" step="any" value={threshold} onChange={e => { setThreshold(e.target.value); setError('') }} required />
        </Field>
      </div>
      <label className="decision-check"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> 启用提醒</label>
      {priceMismatch && <p className="alert-note">条件价币种 {ruleCurrency} 和行情币种 {price.currency} 不同，不会比较。</p>}
      {error && <p role="alert" className="decision-error">{error}</p>}
    </Dialog>
  )
}
