import React, { useEffect, useMemo, useState } from 'react'
import { useOverflowFade } from '../../../hooks/useOverflowFade'
import { masterBySlug } from '../masters'
import type { TopMaster } from '../top'

export default function TopNav({ masters }: { masters: readonly TopMaster[] }): JSX.Element {
  const links = useMemo(
    () => [
      { id: 'tm-now', label: '现在' },
      ...masters.map(m => ({
        id: `tm-${m.slug}`,
        label: masterBySlug(m.slug)?.name ?? m.slug,
      })),
    ],
    [masters],
  )
  const [active, setActive] = useState(links[0]?.id ?? 'tm-now')
  const { ref, sync } = useOverflowFade<HTMLElement>()

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const sections = links
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
      { rootMargin: '-100px 0px -55% 0px', threshold: [0, 0.15, 0.4, 0.7] },
    )
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [links])

  useEffect(() => { sync() }, [sync, active, links])

  if (!links.length) return <></>

  return (
    <nav className="tm-toc" aria-label="页内导航">
      <div className="tm-toc__scroll" ref={ref} onScroll={sync}>
        {links.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`tm-toc__link${active === id ? ' is-active' : ''}`}
            aria-current={active === id ? 'location' : undefined}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}
