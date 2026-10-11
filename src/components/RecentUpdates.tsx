import React from 'react'
import { Link } from 'react-router-dom'
import { SITE_UPDATES } from '../data/siteUpdates'

export default function RecentUpdates(): JSX.Element | null {
  const items = SITE_UPDATES.slice(0, 5)

  if (items.length === 0) return null

  return (
    <section id="recent-updates" className="updates-section" aria-labelledby="recent-updates-title">
      <h2 id="recent-updates-title">最近更新</h2>
      <ul className="updates">
        {items.map(update => (
          <li key={update.id}>
            <time className="updates__date" dateTime={update.date}>{update.date}</time>
            <div className="updates__text">
              <Link to={update.href}>{update.title}</Link>
              <p className="updates__description">{update.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
