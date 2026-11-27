import React, { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, Search, X } from 'lucide-react'
import { NAV_ITEMS, isNavActive } from '../data/siteMap'
import { useCommandPalette } from './CommandPalette'
import { paletteShortcut } from '../utils/shortcut'

const SHORTCUT = paletteShortcut()
const NARROW_MQ = '(max-width: 767px)'

function Leaf(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19c3-4 6-7 10-9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function setInert(el: Element | null, on: boolean): void {
  if (!el) return
  if (on) el.setAttribute('inert', '')
  else el.removeAttribute('inert')
}

export default function Header(): JSX.Element {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(NARROW_MQ).matches
      : false,
  )
  const palette = useCommandPalette()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const wasOpen = useRef(false)

  // 路由变化时关闭抽屉
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // 窄屏：搜索按钮 aria-label 不带快捷键
  useEffect(() => {
    const mql = typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_MQ) : null
    if (!mql) return
    const sync = () => setNarrow(mql.matches)
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [])

  // 抽屉打开时锁定背景滚动、inert 被遮住的页面、Esc 关闭并回焦；Tab 在菜单按钮与抽屉链接间循环
  useEffect(() => {
    const main = document.getElementById('main-content')
    const footer = document.querySelector('footer.site-footer, footer')
    const chrome = document.querySelector('.section-chrome')

    if (!open) {
      document.body.style.overflow = ''
      setInert(main, false)
      setInert(footer, false)
      setInert(chrome, false)
      if (wasOpen.current) {
        wasOpen.current = false
        // 关闭后焦点回到菜单按钮（原焦点可能已在被 inert 的页面上）
        toggleRef.current?.focus()
      }
      return
    }

    wasOpen.current = true
    document.body.style.overflow = 'hidden'
    setInert(main, true)
    setInert(footer, true)
    setInert(chrome, true)

    const focusables = (): HTMLElement[] => {
      const items: HTMLElement[] = []
      if (toggleRef.current) items.push(toggleRef.current)
      drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])').forEach(el => items.push(el))
      return items
    }

    // 打开后把焦点放进抽屉第一个链接，避免停在被遮住的页面上
    const firstLink = drawerRef.current?.querySelector<HTMLElement>('a[href]')
    firstLink?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const i = list.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      if (e.shiftKey) {
        list[(i <= 0 ? list.length : i) - 1]?.focus()
      } else {
        list[(i + 1) % list.length]?.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    // 旋转屏幕或拉宽窗口越过桌面断点时，抽屉已被 CSS 隐藏，要同步关闭并解除滚动锁
    const mql = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 768px)') : null
    const onWide = (e: { matches: boolean }) => {
      if (e.matches) setOpen(false)
    }
    mql?.addEventListener('change', onWide)
    return () => {
      document.removeEventListener('keydown', onKey)
      mql?.removeEventListener('change', onWide)
      document.body.style.overflow = ''
      setInert(main, false)
      setInert(footer, false)
      setInert(chrome, false)
    }
  }, [open])

  const searchLabel = narrow ? '跳转到页面' : `跳转到页面（${SHORTCUT.spoken}）`

  return (
    <header className="site-header">
      <div className="site-header__bar">
        <Link to="/" className="site-brand" onClick={() => setOpen(false)}>
          <Leaf />
          <span className="site-brand__name">Live</span>
        </Link>

        <nav className="site-nav" aria-label="主导航">
          {NAV_ITEMS.map(item => {
            const active = isNavActive(item.path, pathname)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={active ? 'site-nav__link is-active' : 'site-nav__link'}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <button
          type="button"
          className="site-search-btn"
          aria-label={searchLabel}
          onClick={() => {
            setOpen(false)
            palette.open()
          }}
        >
          <Search size={18} aria-hidden="true" />
          <span className="site-search-btn__text">跳转</span>
          <kbd className="site-search-btn__kbd">{SHORTCUT.keys}</kbd>
        </button>

        <button
          ref={toggleRef}
          type="button"
          className="site-menu-btn"
          aria-label={open ? '关闭菜单' : '打开菜单'}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <nav ref={drawerRef} className="site-drawer" aria-label="移动导航">
          {NAV_ITEMS.map(item => {
            const active = isNavActive(item.path, pathname)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={active ? 'site-drawer__link is-active' : 'site-drawer__link'}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      )}
    </header>
  )
}
