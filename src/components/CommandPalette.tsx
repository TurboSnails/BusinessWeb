import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search, X } from 'lucide-react'
import {
  COMPANY_MARKET_LABEL,
  companyPath,
  findSearchablePage,
  searchCompanies,
  searchPages,
  type CompanyIndexEntry,
  type SearchablePage,
} from '../data/siteMap'
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

const NO_COMPANIES: CompanyIndexEntry[] = []

const isTypingTarget = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

interface PaletteItem extends SearchablePage {
  code?: string // 公司代码，单独显示成标签
}

interface Section {
  title: string
  items: PaletteItem[]
}

/** 公司索引：首次打开面板时才去取，provider 内缓存；失败后下次打开重试 */
type CompanyIndexState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; entries: CompanyIndexEntry[] }

const COMPANY_LIMIT = 8

async function fetchCompanyIndex(): Promise<CompanyIndexEntry[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/company-index.json`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { items?: unknown }
  if (!Array.isArray(data.items)) throw new Error('索引格式不对')
  return data.items as CompanyIndexEntry[]
}

const companyItem = (e: CompanyIndexEntry): PaletteItem => ({
  path: companyPath(e),
  label: e.n,
  code: e.c,
  // 市场写进可读文本，读屏能听到
  group: [COMPANY_MARKET_LABEL[e.m] ?? e.m.toUpperCase(), e.s].filter(Boolean).join(' · '),
})

function buildSections(query: string, companies: CompanyIndexEntry[]): Section[] {
  if (query.trim()) {
    return [
      { title: '公司', items: searchCompanies(query, companies, COMPANY_LIMIT).map(companyItem) },
      { title: '页面', items: searchPages(query) },
    ]
  }
  const recent = readRecent().map(findSearchablePage).filter((p): p is SearchablePage => p !== null)
  const seen = new Set(recent.map(p => p.path))
  const rest = searchPages('').filter(p => !seen.has(p.path))
  return [...(recent.length ? [{ title: '最近访问', items: recent }] : []), { title: '全部页面', items: rest }]
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const { pathname } = useLocation()
  const [companyIndex, setCompanyIndex] = useState<CompanyIndexState>({ status: 'idle' })

  const indexStatusRef = useRef<CompanyIndexState['status']>('idle')

  // 不阻塞首屏：面板第一次打开时才取索引；载入中或已就绪不重取，失败的下次打开再试
  useEffect(() => {
    if (!isOpen || indexStatusRef.current === 'loading' || indexStatusRef.current === 'ready') return
    const update = (next: CompanyIndexState) => {
      indexStatusRef.current = next.status
      setCompanyIndex(next)
    }
    update({ status: 'loading' })
    fetchCompanyIndex().then(entries => update({ status: 'ready', entries }), () => update({ status: 'error' }))
  }, [isOpen])

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
      {isOpen && <Palette onClose={() => setOpen(false)} companyIndex={companyIndex} />}
    </PaletteContext.Provider>
  )
}

function Palette({ onClose, companyIndex }: { onClose: () => void; companyIndex: CompanyIndexState }): JSX.Element {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (i: number) => `${baseId}-opt-${i}`

  const companies = companyIndex.status === 'ready' ? companyIndex.entries : NO_COMPANIES
  const sections = useMemo(() => buildSections(query, companies), [query, companies])
  const hasQuery = query.trim() !== ''
  const companyStatus =
    !hasQuery ? null
    : companyIndex.status === 'loading' || companyIndex.status === 'idle' ? '正在载入公司索引…'
    : companyIndex.status === 'error' ? '公司索引载入失败，暂时只能搜页面'
    : null
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
  }, [query, companies])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [active, flat])

  const go = (page: PaletteItem | undefined) => {
    if (!page) return
    // 路由变化会触发 provider 关闭面板；同一路径时手动关
    navigate(page.path)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    // 拼音输入法选词时的回车 / 方向键 / Esc 属于输入法，不当作面板操作（Safari 用 keyCode 229 表示）
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
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
            placeholder="输入页面或公司，如 估值、腾讯、txkg、700、AAPL"
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

        {companyStatus && (
          <p className="cmdk__empty cmdk__status" role="status">
            {companyStatus}
          </p>
        )}

        <div ref={listRef} id={listId} className="cmdk__list" role="listbox" aria-label="页面和公司">
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
                        {page.code && <span className="cmdk__tag">{page.code}</span>}
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
