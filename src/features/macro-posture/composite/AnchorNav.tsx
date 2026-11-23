import React, { useEffect, useState } from 'react'

export const COMPOSITE_NAV = [
  { id: 'mp-conclusion', label: '结论' },
  { id: 'mp-pillars', label: '支柱' },
  { id: 'mp-market', label: '市场' },
  { id: 'mp-outer', label: '外圈' },
  { id: 'mp-masters', label: '大师' },
  { id: 'mp-backtest', label: '回测' },
  { id: 'mp-candidates', label: '候选' },
  { id: 'mp-method', label: '方法' },
] as const

export default function AnchorNav(): JSX.Element {
  const [active, setActive] = useState<string>(COMPOSITE_NAV[0].id)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const sections = COMPOSITE_NAV
      .map(({ id }) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el))
    if (!sections.length) return undefined

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target?.id) setActive(visible[0].target.id)
      },
      { rootMargin: '-110px 0px -55% 0px', threshold: [0, 0.15, 0.4, 0.7] },
    )
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <nav className="mp-toc" aria-label="页内导航">
      <div className="mp-toc__scroll">
        {COMPOSITE_NAV.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`mp-toc__link${active === id ? ' is-active' : ''}`}
            aria-current={active === id ? 'location' : undefined}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}
