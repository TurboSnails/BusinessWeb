import React, { useEffect, useState } from 'react'
import { FIELDS, SUGGESTED, ThemeCard, capTotal, cardWarnings, emptyCard, filledCount } from '../features/themeCard/themeCard'
import { Callout, Field } from '../components/ui'

const STORE_KEY = 'theme-cards-v1'

function load(): ThemeCard[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const data = raw ? JSON.parse(raw) : null
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

export default function ThemeCards(): JSX.Element {
  const [cards, setCards] = useState<ThemeCard[]>(load)
  const [name, setName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const today = new Date()

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cards)) } catch { /* 无痕模式等：只在本次页面有效 */ }
  }, [cards])

  const patch = (id: string, f: (c: ThemeCard) => ThemeCard) => setCards(cs => cs.map(c => (c.id === id ? f(c) : c)))
  const add = (n: string) => {
    const t = n.trim()
    if (!t || cards.some(c => c.name === t)) return
    const id = `${Date.now()}-${cards.length}`
    setCards(cs => [...cs, emptyCard(id, t)])
    setOpenId(id)
    setName('')
  }
  const total = capTotal(cards)

  return (
    <div className="theme-cards">
      <Callout tone="muted" className="theme-gap">
        对应书第31章 31.12 的「一页纸未来产业研究卡」。这里不预设任何产业判断，每一项由你自己填，并写明依据和日期；内容只保存在这台设备的浏览器里。主题只放主动额度（第9章），每年复核一次（31.13）。不构成投资建议。
      </Callout>

      <div className="ui-card theme-gap">
        <form onSubmit={e => { e.preventDefault(); add(name) }} className="theme-new">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="新建一张主题卡，例如：固态电池" aria-label="主题名称" className="ui-input" />
          <button type="submit" className="tool-btn tool-btn--primary">新建</button>
        </form>
        <div className="ui-cluster theme-suggest">
          <span className="theme-muted">书里的观察方向：</span>
          {SUGGESTED.filter(s => !cards.some(c => c.name === s)).map(s => (
            <button key={s} type="button" className="seg__btn" onClick={() => add(s)}>{s}</button>
          ))}
        </div>
        {cards.length > 0 && (
          <p className="theme-summary">共 {cards.length} 张，已设仓位上限合计 {total}%。上限是占总资产的百分比，合计不应超过你的主动额度。</p>
        )}
      </div>

      {cards.length === 0 && <p className="theme-muted">还没有主题卡。从上面选一个方向，或自己输入。</p>}

      {cards.map(card => {
        const warns = cardWarnings(card, today)
        const open = openId === card.id
        return (
          <section key={card.id} className="ui-card theme-gap" aria-label={card.name}>
            <button type="button" className="theme-head" aria-expanded={open} onClick={() => setOpenId(open ? null : card.id)}>
              <strong className="theme-head__name">{open ? '▾' : '▸'} {card.name}</strong>
              <span className={warns.length ? 'theme-head__meta is-warn' : 'theme-head__meta'}>
                已填 {filledCount(card)}/{FIELDS.length}{warns.length ? ` · ${warns.length} 条提醒` : ''}
              </span>
            </button>
            {warns.length > 0 && (
              <ul className="theme-warns">{warns.map(w => <li key={w}>{w}</li>)}</ul>
            )}
            {open && (
              <div className="theme-body">
                <div className="ui-form-grid">
                  <Field label="仓位上限（% 总资产）">
                    <input inputMode="decimal" value={card.cap} onChange={e => patch(card.id, c => ({ ...c, cap: e.target.value }))} />
                  </Field>
                  <Field label="上次复核日期">
                    <input type="date" value={card.reviewed} onChange={e => patch(card.id, c => ({ ...c, reviewed: e.target.value }))} />
                  </Field>
                </div>
                {FIELDS.map(f => (
                  <Field key={f.key} label={<><strong className="theme-field-title">{f.label}</strong>{f.hint}</>}>
                    <textarea rows={2} value={card.values[f.key] || ''} onChange={e => patch(card.id, c => ({ ...c, values: { ...c.values, [f.key]: e.target.value } }))} />
                  </Field>
                ))}
                <div>
                  <button type="button" className="tool-btn tool-btn--danger" onClick={() => { if (window.confirm(`删除「${card.name}」？删除后无法恢复。`)) setCards(cs => cs.filter(c => c.id !== card.id)) }}>删除这张卡</button>
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
