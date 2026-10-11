import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search, X } from 'lucide-react'
import { findSearchablePage, searchPages, type SearchablePage } from '../data/siteMap'
import { readRecent } from '../features/recent-pages/store'
import '../styles/command-palette.css'

interface PaletteApi {
  open: () => void
}

// provider 外调用拿到 no-op，单测里可以单独渲染 Header / Home
const PaletteContext = createContext<PaletteApi>({ open: () => {} })

export function useCommandPalette(): PaletteApi {
  return useContext(PaletteContext)
}

const isTypingTarget = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

interface Section {
  title: string
  items: SearchablePage[]
}

function buildSections(query: string): Section[] {
  if (query.trim()) return [{ title: '搜索结果', items: searchPages(query) }]
  const recent = readRecent().map(findSearchablePage).filter((p): p is SearchablePage => p !== null)
  const seen = new Set(recent.map(p => p.path))
  const rest = searchPages('').filter(p => !seen.has(p.path))
  return [...(recent.length ? [{ title: '最近访问', items: recent }] : []), { title: '全部页面', items: rest }]
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(v => !v)
        return
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo(() => ({ open }), [open])
  return (
    <PaletteContext.Provider value={value}>
      {children}
      {isOpen && <Palette onClose={() => setOpen(false)} />}
    </PaletteContext.Provider>
  )
}

function Palette({ onClose }: { onClose: () => void }): JSX.Element {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (i: number) => `${baseId}-opt-${i}`

  const sections = useMemo(() => buildSections(query), [query])
  const flat = useMemo(() => sections.flatMap(s => s.items), [sections])

  // 打开时记住原焦点并锁滚动，关闭时恢复
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previous?.focus?.()
    }
  }, [])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [active, flat])

  const go = (page: SearchablePage | undefined) => {
    if (!page) return
    // 路由变化会触发 provider 关闭面板；同一路径时手动关
    navigate(page.path)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        onClose()
        break
      case 'ArrowDown':
        e.preventDefault()
        if (flat.length) setActive(i => (i + 1) % flat.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (flat.length) setActive(i => (i - 1 + flat.length) % flat.length)
        break
      case 'Enter':
        if (e.target === inputRef.current) {
          e.preventDefault()
          go(flat[active])
        }
        break
      case 'Tab': {
        // 面板里只有输入框和关闭按钮可聚焦，Tab 在两者之间循环
        e.preventDefault()
        const next = document.activeElement === inputRef.current ? closeRef.current : inputRef.current
        next?.focus()
        break
      }
    }
  }

  let index = -1
  return (
    <div className="cmdk-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="跳转到页面" onKeyDown={onKeyDown}>
        <div className="cmdk__search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            className="cmdk__input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? optionId(active) : undefined}
            placeholder="输入页面名，如 估值、网格、国家队"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          <button ref={closeRef} type="button" className="cmdk__close" aria-label="关闭" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div ref={listRef} id={listId} className="cmdk__list" role="listbox" aria-label="页面">
          {flat.length === 0 && <p className="cmdk__empty">没有匹配的页面</p>}
          {sections.map(section =>
            section.items.length === 0 ? null : (
              <div key={section.title} role="group" aria-label={section.title} className="cmdk__group">
                <div className="cmdk__group-title" aria-hidden="true">{section.title}</div>
                {section.items.map(page => {
                  index += 1
                  const i = index
                  const selected = i === active
                  return (
                    <div
                      key={`${section.title}-${page.path}`}
                      id={optionId(i)}
                      role="option"
                      aria-selected={selected}
                      data-path={page.path}
                      className={selected ? 'cmdk__item is-active' : 'cmdk__item'}
                      onMouseMove={() => { if (!selected) setActive(i) }}
                      onClick={() => go(page)}
                    >
                      <span className="cmdk__item-main">
                        <span className="cmdk__item-label">{page.label}</span>
                        {page.archived && <span className="cmdk__tag">已舍弃</span>}
                      </span>
                      <span className="cmdk__item-group">{page.group}</span>
                      {selected && <CornerDownLeft size={16} className="cmdk__enter" aria-hidden="true" />}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>

        <div className="cmdk__footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  )
}
