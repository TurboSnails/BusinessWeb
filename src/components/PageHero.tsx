import React from 'react'

interface PageHeroProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
}

/** 内页顶部横幅：纸张底、衬线标题，替代各页自写的鲜艳渐变 */
export default function PageHero({ icon, title, subtitle }: PageHeroProps): JSX.Element {
  return (
    <div className="page-hero">
      <div className="page-hero__inner">
        <div className="page-hero__icon" aria-hidden="true">{icon}</div>
        <div className="page-hero__text">
          <h1 className="page-hero__title">{title}</h1>
          {subtitle && <p className="page-hero__subtitle">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
