import React, { useEffect, useState } from 'react'

interface Commit {
  hash: string
  subject: string
  date: string
}

interface Changelog {
  versions?: Array<{ commits?: Commit[] }>
}

export default function RecentUpdates(): JSX.Element | null {
  const [items, setItems] = useState<Commit[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(import.meta.env.BASE_URL + 'changelog.json')
      .then(r => {
        if (!r.ok) throw new Error(`status ${r.status}`)
        return r.json() as Promise<Changelog>
      })
      .then(j => {
        const commits = (j.versions ?? []).flatMap(v => v.commits ?? []).slice(0, 5)
        if (!cancelled) setItems(commits)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (items.length === 0) return null

  return (
    <section className="home-section">
      <h2>最近更新</h2>
      <ul className="updates">
        {items.map(c => (
          <li key={c.hash}>
            <span className="updates__date">{c.date}</span>
            <span className="updates__text">{c.subject}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
