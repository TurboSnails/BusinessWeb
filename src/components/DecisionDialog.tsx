import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { Dialog, Field } from './ui'
import '../styles/candidates.css'
import { DECISION_ACTIONS, DECISION_TYPES, MAX_DECISION_TEXT, MAX_DECISIONS, validDecisionRecord } from '../features/candidates/validation'
import type { DecisionAction, DecisionRecord, DecisionSnapshot, DecisionType } from '../features/candidates/validation'

const BOOK_LINK = '/first-book/read/第37章-犯错与复盘.md'
const OPTIONAL_FIELDS = [
  ['funds', '资金', '用款期限、参考总额、主动额度；是否出现新的家庭用款'],
  ['evidence', '经营依据', '三条证据、原始来源、公开日期；新事实支持还是否定原假设'],
  ['valuation', '估值', '静态或 TTM 口径、情景与区间；哪项假设改变、是否重估'],
  ['position', '仓位', '单股、行业和共同风险上限；实际敞口与超限处理'],
  ['exit', '退出', '证伪条件、估值条件、重新评估时点；是否触发、采取了什么行动'],
  ['result', '结果', '比较基准、预计成本；实际成本、收益、回撤与耗时'],
] as const
type OptionalKey = typeof OPTIONAL_FIELDS[number][0]
type Draft = Pick<DecisionRecord, 'why' | 'wrong' | OptionalKey> & { action: DecisionAction; nextCheck: string; type: DecisionType | ''; cyclical: boolean }

/** 本地日期 YYYY-MM-DD */
export const localDay = (date = new Date()): string => date.toLocaleDateString('en-CA')
const addMonths = (months: number): string => { const d = new Date(); d.setMonth(d.getMonth() + months); return localDay(d) }
const fmt = (n: number): string => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })

export function snapshotText(s: DecisionSnapshot | undefined): string {
  if (!s) return ''
  return [
    s.rating && `研究评级 ${s.rating}`,
    s.price !== undefined && `价格 ${fmt(s.price)}${s.priceDate ? `（${s.priceDate}）` : ''}`,
    s.dcfPrice !== undefined && `DCF ${s.dcfCurrency ?? ''} ${fmt(s.dcfPrice)}${s.dcfMos !== undefined ? `，安全边际 ${(s.dcfMos * 100).toFixed(0)}%` : ''}${s.dcfDate ? `（${s.dcfDate}）` : ''}`,
  ].filter(Boolean).join('；')
}

function initialDraft(latest: DecisionRecord | undefined): Draft {
  // 更新时沿用上一版的判断作为起点，改动只落在新版本上
  const base: Draft = { action: latest ? 'adjust' : 'watch', why: latest?.why ?? '', wrong: latest?.wrong ?? '', nextCheck: '', type: latest?.type ?? '', cyclical: latest?.cyclical ?? false }
  for (const [key] of OPTIONAL_FIELDS) base[key] = latest?.[key] ?? ''
  return base
}

function toRecord(draft: Draft, snapshot: DecisionSnapshot | undefined, at: string): DecisionRecord {
  const record: DecisionRecord = { at, action: draft.action, why: draft.why.trim(), wrong: draft.wrong.trim(), nextCheck: draft.nextCheck }
  for (const [key] of OPTIONAL_FIELDS) { const text = draft[key]?.trim(); if (text) record[key] = text }
  if (draft.type) record.type = draft.type
  if (draft.cyclical) record.cyclical = true
  if (snapshot && Object.keys(snapshot).length) record.snapshot = snapshot
  return record
}

function History({ records }: { records: DecisionRecord[] }): JSX.Element {
  return (
    <section className="decision-history" aria-label="历史版本">
      <h3>历史版本 · {records.length}</h3>
      <ol>
        {[...records].reverse().map((r, n) => (
          <li key={`${r.at}-${n}`}>
            <details open={n === 0}>
              <summary>
                <strong>{r.at.slice(0, 10)} · {DECISION_ACTIONS[r.action]}</strong>
                <span>下次检查 {r.nextCheck}</span>
              </summary>
              <dl>
                <dt>为什么</dt><dd>{r.why}</dd>
                <dt>证伪条件</dt><dd>{r.wrong}</dd>
                {r.type && <><dt>分类</dt><dd>{DECISION_TYPES[r.type]}{r.cyclical ? '（周期）' : ''}</dd></>}
                {OPTIONAL_FIELDS.map(([key, label]) => r[key] ? <React.Fragment key={key}><dt>{label}</dt><dd>{r[key]}</dd></React.Fragment> : null)}
                {r.snapshot && <><dt>当时依据</dt><dd>{snapshotText(r.snapshot)}</dd></>}
              </dl>
            </details>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function DecisionDialog({ open, onClose, name, records, snapshot, onSave }: {
  open: boolean
  onClose: () => void
  name: string
  records: DecisionRecord[]
  /** 记录时自动带上的研究评级、价格与 DCF */
  snapshot?: DecisionSnapshot
  onSave: (record: DecisionRecord) => void
}): JSX.Element | null {
  const latest = records[records.length - 1]
  const [draft, setDraft] = useState<Draft>(() => initialDraft(latest))
  const [tried, setTried] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft(d => ({ ...d, [key]: value }))
  const full = records.length >= MAX_DECISIONS
  const missing = [!draft.why.trim() && '为什么买', !draft.wrong.trim() && '什么情况说明我错了', !draft.nextCheck && '下次检查日'].filter(Boolean)

  const save = (): void => {
    setTried(true)
    const record = toRecord(draft, snapshot, new Date().toISOString())
    if (full || !validDecisionRecord(record)) return
    onSave(record)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" icon={<ClipboardList size={20} />} title={`决策记录 · ${name}`} className="decision-dialog"
      actions={<>
        <button type="button" className="tool-btn" onClick={onClose}>取消</button>
        <button type="button" className="tool-btn tool-btn--primary" disabled={full} onClick={save}>{latest ? '保存为新版本' : '保存'}</button>
      </>}>
      <p className="decision-lead">
        按<Link to={BOOK_LINK} className="rn-link">第37章 37.4</Link>记录：三行必填，其余可选。每次保存都是新版本，旧版本和日期保留，不覆盖原来的依据。
      </p>
      <div className="ui-form-grid">
        <Field label="① 我为什么买（经营上的理由，不能是「在涨」）" wide>
          <textarea rows={2} maxLength={MAX_DECISION_TEXT} value={draft.why} onChange={e => set('why', e.target.value)} required />
        </Field>
        <Field label="② 什么情况说明我错了（一个可核查的条件）" wide>
          <textarea rows={2} maxLength={MAX_DECISION_TEXT} value={draft.wrong} onChange={e => set('wrong', e.target.value)} required />
        </Field>
        <Field label="这次的决定">
          <select value={draft.action} onChange={e => set('action', e.target.value as DecisionAction)}>
            {Object.entries(DECISION_ACTIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Field>
        <Field label="③ 下次检查日" hint={<span className="decision-quick">{[[1, '1 个月'], [3, '3 个月'], [6, '半年']].map(([m, label]) => <button key={m} type="button" className="tool-btn" onClick={() => set('nextCheck', addMonths(m as number))}>{label}</button>)}</span>}>
          <input type="date" value={draft.nextCheck} min={localDay()} onChange={e => set('nextCheck', e.target.value)} required />
        </Field>
      </div>
      {snapshot && Object.keys(snapshot).length > 0 && <p className="decision-snapshot">自动带上当时依据：{snapshotText(snapshot)}</p>}
      <details className="decision-full">
        <summary>完整版（可选）</summary>
        <div className="ui-form-grid">
          <Field label="分类">
            <select value={draft.type} onChange={e => set('type', e.target.value as DecisionType | '')}>
              <option value="">未分类</option>
              {Object.entries(DECISION_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <label className="decision-check"><input type="checkbox" checked={draft.cyclical} onChange={e => set('cyclical', e.target.checked)} /> 周期股（选修另标）</label>
          {OPTIONAL_FIELDS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint} wide>
              <textarea rows={2} maxLength={MAX_DECISION_TEXT} value={draft[key] ?? ''} onChange={e => set(key, e.target.value)} />
            </Field>
          ))}
        </div>
      </details>
      {tried && missing.length > 0 && <p role="alert" className="decision-error">还缺：{missing.join('、')}。写不出的那一行，就是还不该行动的原因。</p>}
      {full && <p role="alert" className="decision-error">已达 {MAX_DECISIONS} 个版本上限，请先导出存档。</p>}
      {records.length > 0 && <History records={records} />}
    </Dialog>
  )
}
