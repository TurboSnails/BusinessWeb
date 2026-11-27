import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import '../../styles/trio-nav.css'

// 组药丸已有综合策略 / 宏观攻守 / 市场雷达；这里只留药丸里没有的两项（M10 / L9）
const LINKS = [
  { path: '/invest/verified', role: '已通过', name: '通过检验' },
  { path: '/invest/strategy-lab', role: '待验证', name: '研究中' },
] as const

function isCurrent(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`)
}

/** 通过检验、研究中互链；当前页 aria-current + 选中态 */
export default function TrioNav(): JSX.Element {
  const { pathname } = useLocation()

  return (
    <nav className="trio-nav" aria-label="策略相关页面">
      <ul className="trio-nav__list">
        {LINKS.map(item => {
          const current = isCurrent(pathname, item.path)
          return (
            <li key={item.path}>
              <Link
                to={item.path}
                className={current ? 'trio-nav__link is-current' : 'trio-nav__link'}
                aria-current={current ? 'page' : undefined}
                aria-label={`${item.role} · ${item.name}`}
              >
                <span className="trio-nav__role">{item.role}</span>
                <span className="trio-nav__name">{item.name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
