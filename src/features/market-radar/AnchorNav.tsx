import React, { useEffect, useState } from 'react'

export const RADAR_NAV = [
  { id: 'mr-conclusion', label: '结论' },
  { id: 'mr-indicators', label: '指标' },
  { id: 'mr-backtest', label: '回测' },
] as const

export default function AnchorNav(): JSX.Element {
  const [active, setActive] = useState<string>(RADAR_NAV[0].id)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const sections = RADAR_NAV
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
    <nav className="mr-toc" aria-label="页内导航">
      <div className="mr-toc__scroll">
        {RADAR_NAV.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`mr-toc__link${active === id ? ' is-active' : ''}`}
            aria-current={active === id ? 'location' : undefined}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}
