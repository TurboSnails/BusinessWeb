import React, { useEffect, useState } from 'react'

export const RADAR_NAV = [
  { id: 'mr-conclusion', label: '结论' },
  { id: 'mr-overview', label: '总览' },
  { id: 'mr-indicators', label: '指标' },
  { id: 'mr-style', label: '风格' },
  { id: 'mr-backtest', label: '历史检验' },
] as const

/**
 * 以吸顶导航下沿为基准：哪个区块顶边最后越过这条线，就高亮哪个。
 */
export function activeSectionFromTops(
  sectionTops: number[],
  ids: readonly string[],
  navBottom: number,
): string {
  if (!ids.length) return ''
  let active = ids[0]
  for (let i = 0; i < sectionTops.length; i++) {
    if (sectionTops[i] <= navBottom + 1) active = ids[i]
  }
  return active
}

export default function AnchorNav(): JSX.Element {
  const [active, setActive] = useState<string>(RADAR_NAV[0].id)

  useEffect(() => {
    const ids = RADAR_NAV.map(item => item.id)

    const sync = (): void => {
      const nav = document.querySelector<HTMLElement>('.mr-toc')
      const navBottom = nav ? nav.getBoundingClientRect().bottom : 0
      const tops = ids.map(id => {
        const el = document.getElementById(id)
        return el ? el.getBoundingClientRect().top : Number.POSITIVE_INFINITY
      })
      setActive(activeSectionFromTops(tops, ids, navBottom))
    }

    sync()
    window.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
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
