import React, { useEffect, useState } from 'react'

export const STRATEGY_NAV = [
  { id: 'cs-now', label: '现在怎么做' },
  { id: 'cs-rules', label: '仓位规则' },
  { id: 'cs-matrix', label: '状态矩阵' },
  { id: 'cs-fusion', label: '融合检验' },
  { id: 'cs-timeline', label: '档位对照' },
  { id: 'mp-market', label: '市场综合' },
] as const

export default function AnchorNav(): JSX.Element {
  const [active, setActive] = useState<string>(STRATEGY_NAV[0].id)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const sections = STRATEGY_NAV
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
    <nav className="cs-toc" aria-label="页内导航">
      <div className="cs-toc__scroll">
        {STRATEGY_NAV.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`cs-toc__link${active === id ? ' is-active' : ''}`}
            aria-current={active === id ? 'location' : undefined}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}
