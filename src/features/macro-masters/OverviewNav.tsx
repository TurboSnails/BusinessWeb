import React, { useEffect, useState } from 'react'
import { useOverflowFade } from '../../hooks/useOverflowFade'

const LINKS = [
  { id: 'mm-now', label: '现在的位置' },
  { id: 'mm-dim', label: '分维度的证据' },
  { id: 'mm-masters', label: '九位大师' },
  { id: 'mm-compare', label: '指标对照' },
] as const

export default function OverviewNav(): JSX.Element {
  const [active, setActive] = useState<string>(LINKS[0].id)
  const { ref, sync } = useOverflowFade<HTMLElement>()

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const sections = LINKS
      .map(({ id }) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el))
    if (!sections.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target?.id) setActive(visible[0].target.id)
      },
      {
        // 顶栏 ~56 + 本导航 ~44
        rootMargin: '-100px 0px -55% 0px',
        threshold: [0, 0.15, 0.4, 0.7],
      },
    )
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [])

  useEffect(() => { sync() }, [sync, active])

  return (
    <nav className="mm-overview__toc" aria-label="页内导航">
      <div
        className="mm-overview__toc-scroll"
        ref={ref}
        onScroll={sync}
      >
        {LINKS.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`mm-overview__toc-link${active === id ? ' is-active' : ''}`}
            aria-current={active === id ? 'location' : undefined}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}
