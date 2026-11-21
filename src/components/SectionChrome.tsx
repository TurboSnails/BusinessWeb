import React, { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { findInvestEntry } from '../data/siteMap'
import { scrollChildIntoViewX, useOverflowFade } from '../hooks/useOverflowFade'
import SmartLink from './SmartLink'

export default function SectionChrome(): JSX.Element | null {
  const { pathname } = useLocation()
  const entry = findInvestEntry(pathname)
  const currentRef = useRef<HTMLAnchorElement | null>(null)
  const { ref: overflowRef, sync: syncOverflow } = useOverflowFade<HTMLElement>()

  // 只滚横向容器，避免 scrollIntoView 带动整页纵向跳动
  useEffect(() => {
    const child = currentRef.current
    const container = child?.parentElement
    if (child && container) scrollChildIntoViewX(container, child)
    syncOverflow()
    const id = requestAnimationFrame(syncOverflow)
    return () => cancelAnimationFrame(id)
  }, [pathname, syncOverflow])

  if (!entry) return null
  const { group, link } = entry

  return (
    <div className="section-chrome">
      <nav className="breadcrumb" aria-label="面包屑">
        <Link to="/">Live</Link>
        <span aria-hidden="true">›</span>
        <Link to="/invest">投资</Link>
        <span aria-hidden="true">›</span>
        <span className="breadcrumb__current">{link.label}</span>
      </nav>
      {link.archived && <p className="section-archived" role="note">{link.archived}</p>}
      {group.links.length > 1 && (
        <nav className="section-tabs" aria-label="同组页面" ref={overflowRef}>
          {group.links.map(l => {
            const active = l.path === link.path || link.path.startsWith(l.path + '/')
            return (
              <SmartLink
                key={l.path}
                to={l.path}
                ref={active ? currentRef : undefined}
                className={active ? 'section-tabs__link is-active' : 'section-tabs__link'}
                aria-current={active ? 'page' : undefined}
              >
                {l.label}
              </SmartLink>
            )
          })}
        </nav>
      )}
    </div>
  )
}
