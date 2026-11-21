import React, { useEffect, useState } from 'react'

export type TocItem = { id: string; label: string }

function preferReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function scrollToId(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: preferReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}

export function CompanyDetailToc({ items, root }: { items: TocItem[]; root?: HTMLElement | null }): JSX.Element | null {
  const [active, setActive] = useState<string>(items[0]?.id ?? '')

  useEffect(() => {
    if (!items.length) return
    const nodes = items.map(i => document.getElementById(i.id)).filter((n): n is HTMLElement => !!n)
    if (!nodes.length) return
    if (typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target?.id) setActive(visible[0].target.id)
      },
      { root: null, rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    )
    nodes.forEach(n => obs.observe(n))
    return () => obs.disconnect()
  }, [items, root])

  if (!items.length) return null

  const list = (
    <ul className="cd-toc__list">
      {items.map(item => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className={active === item.id ? 'cd-toc__link is-active' : 'cd-toc__link'}
            onClick={e => {
              e.preventDefault()
              scrollToId(item.id)
              setActive(item.id)
            }}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      <nav className="cd-toc cd-toc--desktop" aria-label="本页目录">
        <p className="cd-toc__heading">本页目录</p>
        {list}
      </nav>
      <details className="cd-toc cd-toc--mobile">
        <summary className="cd-toc__summary">本页目录</summary>
        <nav aria-label="本页目录">{list}</nav>
      </details>
    </>
  )
}

/** 从内容根节点收集带 id 的卡片标题，供目录使用。 */
export function collectTocItems(root: HTMLElement | null): TocItem[] {
  if (!root) return []
  const cards = [...root.querySelectorAll<HTMLElement>('.ui-card[id], section[id], article[id], [data-cd-title][id]')]
  const out: TocItem[] = []
  const seen = new Set<string>()
  for (const card of cards) {
    const id = card.id
    if (!id || seen.has(id)) continue
    const title = card.getAttribute('data-cd-title')?.trim()
      || card.querySelector(':scope > .ui-card__head h2, :scope > h2, h2')?.textContent?.trim()
      || card.getAttribute('aria-label')?.trim()
    if (!title) continue
    seen.add(id)
    out.push({ id, label: title })
  }
  return out
}
