import React, { useEffect, useMemo, useState } from 'react'

interface TreeNode {
  t: string
  n?: string
  img?: string
  c?: TreeNode[]
}

const BASE = import.meta.env.BASE_URL

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-md)',
  padding: '24px',
}

function renderTable(text: string): JSX.Element | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2 || !lines.every(l => l.startsWith('|'))) return null
  const rows = lines
    .filter(l => !/^\|[\s:|-]+\|?$/.test(l))
    .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
  return (
    <div style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => {
                const Cell = i === 0 ? 'th' : 'td'
                return <Cell key={j} style={{ border: '1px solid var(--system-gray5)', padding: '6px 10px', textAlign: 'left', background: i === 0 ? 'var(--bg-primary)' : undefined }}>{c}</Cell>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function countNodes(n: TreeNode): number {
  return 1 + (n.c || []).reduce((s, c) => s + countNodes(c), 0)
}

function matches(n: TreeNode, q: string): boolean {
  return n.t.toLowerCase().includes(q) || (n.n || '').toLowerCase().includes(q) || (n.c || []).some(c => matches(c, q))
}

function Node({ node, depth, q }: { node: TreeNode; depth: number; q: string }): JSX.Element | null {
  const [open, setOpen] = useState(depth < 1)
  if (q && !matches(node, q)) return null
  const hasKids = !!node.c?.length
  const expanded = q ? true : open
  const table = renderTable(node.t)
  return (
    <div style={{ marginLeft: depth ? 18 : 0, borderLeft: depth ? '1px solid var(--system-gray5)' : 'none', paddingLeft: depth ? 10 : 0 }}>
      <div
        onClick={() => hasKids && setOpen(!open)}
        style={{ display: 'flex', gap: 6, padding: '4px 0', cursor: hasKids ? 'pointer' : 'default', alignItems: 'flex-start' }}
      >
        <span style={{ width: 14, color: 'var(--system-gray)', flexShrink: 0 }}>{hasKids ? (expanded ? '▾' : '▸') : '·'}</span>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.7, fontWeight: depth < 2 ? 600 : 400, fontSize: depth === 0 ? '1.1rem' : '0.92rem', whiteSpace: 'pre-wrap' }}>
          {table || node.t}
          {node.n && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 400 }}>{node.n}</div>}
          {node.img && (
            <img src={`${BASE}industry/solid-state/${node.img}`} alt="" loading="lazy" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 6, display: 'block' }} />
          )}
        </div>
      </div>
      {hasKids && expanded && node.c!.map((c, i) => <Node key={i} node={c} depth={depth + 1} q={q} />)}
    </div>
  )
}

export default function IndustryLandscape(): JSX.Element {
  const [tab, setTab] = useState<'solid' | 'semi'>('solid')
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch(`${BASE}industry/solid-state.json`).then(r => r.json()).then(setTree).catch(() => setTree(null))
  }, [])

  const total = useMemo(() => (tree ? countNodes(tree) : 0), [tree])
  const tabBtn = (id: 'solid' | 'semi', label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{ padding: '8px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, background: tab === id ? 'var(--system-blue, var(--system-blue))' : 'var(--bg-secondary)', color: tab === id ? '#fff' : 'var(--text-primary)' }}
    >
      {label}
    </button>
  )

  return (
    <main className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
      <h1 style={{ margin: '0 0 16px', fontSize: '1.7rem' }}>产业格局</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabBtn('solid', '固态电池')}
        {tabBtn('semi', '半导体产业链')}
      </div>
      {tab === 'solid' && (
        <div style={cardStyle}>
          <input
            value={q}
            onChange={e => setQ(e.target.value.trim().toLowerCase())}
            placeholder={`搜索 ${total} 个节点`}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', marginBottom: 12, borderRadius: 10, border: '1px solid var(--system-gray4)', fontSize: '0.9rem' }}
          />
          {tree ? <Node node={tree} depth={0} q={q} /> : <p style={{ color: 'var(--system-gray)' }}>加载中…</p>}
        </div>
      )}
      {tab === 'semi' && (
        <div style={cardStyle}>
          <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            原图为 MindNode 脑图预览，点击图片在新窗口打开后可放大查看。
          </p>
          <a href={`${BASE}industry/semiconductor.png`} target="_blank" rel="noreferrer">
            <img src={`${BASE}industry/semiconductor.png`} alt="半导体产业链脑图" style={{ width: '100%', borderRadius: 8 }} />
          </a>
        </div>
      )}
    </main>
  )
}
