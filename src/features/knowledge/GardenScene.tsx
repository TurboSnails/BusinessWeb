import React, { useId, useMemo, useState } from 'react'
import type { KnowledgeGraph } from './api'

export type GardenNode = { path: string; title: string }
export type GardenHub = { name: string; x: number; y: number; color: string }
const COLORS = ['#d3b573', '#9cb48e', '#8fb8be', '#cfa6bb', '#b8abd1', '#d1ac8d', '#9ac4b5', '#b9bd94']
const GOLDEN_ANGLE = 2.39996323
const point = (angle: number, radius: number) => ({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
const shorten = (text: string, length = 16) => text.length > length ? text.slice(0, length) + '…' : text

export function gardenCategory(path: string): string {
  const parts = path.split('/')
  return parts[0] === 'Notion' ? (parts.length > 3 ? parts[2] : 'Notion 导航') : parts[0]
}

export function gardenLayout(nodes: GardenNode[], groups: string[], focus: string) {
  const shown = [...new Set(nodes.map(n => gardenCategory(n.path)))]
  const hubs: GardenHub[] = shown.map((name, i) => {
    const angle = i * Math.PI * 2 / shown.length - Math.PI / 2
    return { name, x: 450 + Math.cos(angle) * 208, y: 310 + Math.sin(angle) * 208, color: COLORS[groups.indexOf(name) % COLORS.length] }
  })
  // Neighbor crowns stay apart as the number of categories grows.
  const crownRadius = Math.min(86, Math.max(30, 208 * Math.sin(Math.PI / Math.max(2, shown.length)) * .72))
  const focusNeighbors = nodes.filter(n => n.path !== focus)
  const positions = nodes.map(n => {
    const hub = hubs.find(h => h.name === gardenCategory(n.path))!
    if (focus) {
      const i = focusNeighbors.indexOf(n)
      const angle = i * GOLDEN_ANGLE - Math.PI / 2
      const radius = focusNeighbors.length <= 12 ? 185 : 120 + Math.sqrt((i + 1) / focusNeighbors.length) * 145
      const offset = point(angle, radius)
      return { ...n, color: hub.color, x: n.path === focus ? 450 : 450 + offset.x, y: n.path === focus ? 310 : 310 + offset.y }
    }
    const siblings = nodes.filter(other => gardenCategory(other.path) === hub.name)
    const i = siblings.indexOf(n)
    const offset = point(i * GOLDEN_ANGLE, 18 + Math.sqrt((i + .5) / siblings.length) * crownRadius)
    return { ...n, color: hub.color, x: hub.x + offset.x, y: hub.y + offset.y }
  })
  return { hubs, positions }
}

function Pappus({ id }: { id: string }): JSX.Element {
  return <g id={id} fill="none" stroke="currentColor" strokeWidth=".7" strokeLinecap="round">
    <path d="M0 12 Q1 6 0 0" />
    {Array.from({ length: 9 }, (_, i) => {
      const angle = Math.PI + i * Math.PI / 8
      const p = point(angle, 6), tip = point(angle, 10)
      return <path key={i} d={`M0 0 L${p.x} ${p.y} M${tip.x - 1.4} ${tip.y - 1} L${p.x} ${p.y} L${tip.x + 1.4} ${tip.y - 1}`} />
    })}
    <circle cx="0" cy="0" r="1" fill="currentColor" stroke="none" />
  </g>
}

export default function GardenScene({ nodes, groups, edges, focus, zoom, decorative, onFocus }: {
  nodes: GardenNode[]; groups: string[]; edges: KnowledgeGraph['edges']; focus: string;
  zoom: number; decorative: boolean; onFocus(path: string): void;
}): JSX.Element {
  const id = useId().replace(/:/g, '')
  const [hovered, setHovered] = useState('')
  const { hubs, positions } = useMemo(() => gardenLayout(nodes, groups, focus), [nodes, groups, focus])
  const byPath = new Map(positions.map(n => [n.path, n]))
  const visibleEdges = edges.filter(e => byPath.has(e.source) && byPath.has(e.target))
  const bright = focus || hovered
  const related = new Set([bright, ...visibleEdges.flatMap(e => e.source === bright ? [e.target] : e.target === bright ? [e.source] : [])])
  const rootRays = Array.from({ length: decorative ? 72 : 44 }, (_, i) => {
    const angle = i * GOLDEN_ANGLE, radius = decorative ? 40 + Math.sqrt(i / 72) * 125 : 28 + Math.sqrt(i / 44) * 25
    const end = point(angle, radius)
    return { ...end, angle: angle * 180 / Math.PI + 90 }
  })
  const selected = nodes.find(n => n.path === focus)
  return <div className="kb-garden-scene" onPointerMove={e => {
    if (e.pointerType === 'touch') return
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--garden-look-x', `${((e.clientX - rect.left) / rect.width - .5) * 5}px`)
    e.currentTarget.style.setProperty('--garden-look-y', `${((e.clientY - rect.top) / rect.height - .5) * 4}px`)
  }} onPointerLeave={e => { e.currentTarget.style.setProperty('--garden-look-x', '0px'); e.currentTarget.style.setProperty('--garden-look-y', '0px'); setHovered('') }}>
    <div className="kb-garden-scene-caption" aria-hidden="true"><span>{focus ? '一颗种子，一片关联' : decorative ? '知识，等待下一阵风' : '让独立的想法相遇'}</span><i /></div>
    <svg viewBox="0 0 900 650" role="img" aria-label={decorative ? '蒲公英装饰动画，不代表真实笔记' : '蒲公英网络：虚线表示分类，实线表示笔记引用'}>
      <defs>
        <radialGradient id={`${id}Glow`}><stop stopColor="#cfb678" stopOpacity=".16" /><stop offset="1" stopColor="#cfb678" stopOpacity="0" /></radialGradient>
        <Pappus id={`${id}Seed`} />
      </defs>
      <g className="kb-garden-atmosphere" aria-hidden="true">
        <circle cx="450" cy="310" r="290" fill={`url(#${id}Glow)`} />
        <circle cx="450" cy="310" r="280" className="kb-garden-orbit" />
        <circle cx="450" cy="310" r="195" className="kb-garden-orbit is-inner" />
        {Array.from({ length: 12 }, (_, i) => <g key={i} transform={`translate(${85 + (i * 137) % 740} ${90 + (i * 83) % 440})`}><g className="kb-garden-flying-seed" style={{ animationDelay: `${-i * 2.1}s`, animationDuration: `${18 + i % 5 * 3}s` }}><use href={`#${id}Seed`} transform={`rotate(${i * 37 - 50}) scale(${.55 + i % 3 * .2})`} /></g></g>)}
      </g>
      <g className="kb-garden-zoom" style={{ transform: `translate(450px, 310px) scale(${zoom}) translate(-450px, -310px)` }}>
        <g className="kb-garden-wind">
          {!focus && <g className="kb-garden-branches">
            {hubs.map((h, i) => <g key={h.name} style={{ '--garden-delay': `${i * 40}ms` } as React.CSSProperties} className="kb-garden-branch">
              <path className="kb-garden-stem" pathLength="1" d={`M450 310 Q${(450 + h.x) / 2 + 15} ${(310 + h.y) / 2 - 12} ${h.x} ${h.y}`} stroke={h.color} />
              {positions.filter(n => gardenCategory(n.path) === h.name).map(n => <path key={n.path} className="kb-garden-filament" d={`M${h.x} ${h.y} Q${h.x} ${n.y} ${n.x} ${n.y}`} stroke={h.color} />)}
            </g>)}
          </g>}
          <g className="kb-garden-links">
            {visibleEdges.map(e => {
              const a = byPath.get(e.source)!, b = byPath.get(e.target)!
              const active = !!bright && (e.source === bright || e.target === bright)
              return <path key={`${e.source}:${e.target}`} pathLength="1" className={`kb-garden-link ${active ? 'is-lit' : bright ? 'is-dimmed' : ''}`} d={`M${a.x} ${a.y} Q${(a.x + b.x) / 2 + 14} ${(a.y + b.y) / 2 - 18} ${b.x} ${b.y}`} />
            })}
          </g>
          <g className={`kb-garden-heart ${decorative ? 'is-decorative' : ''}`} transform="translate(450 310)" aria-hidden="true">
            {!focus && <><path className="kb-garden-trunk" d={decorative ? 'M0 14 Q-40 185 -12 298' : 'M0 18 Q-22 94 -8 152'} />
              {rootRays.map((ray, i) => <g key={i} className="kb-garden-ray" style={{ animationDelay: `${i * 12}ms` }}><path d={`M0 0 Q${ray.x * .6} ${ray.y * .4} ${ray.x} ${ray.y}`} /><use href={`#${id}Seed`} transform={`translate(${ray.x} ${ray.y}) rotate(${ray.angle}) scale(${decorative ? .9 : .55})`} /></g>)}
            </>}
            <circle r={focus ? 25 : decorative ? 8 : 20} className="kb-garden-heart-halo" />
            {!decorative && !focus && <><circle r="18" className="kb-garden-heart-core" /><text y="4" textAnchor="middle" className="kb-garden-heart-text">知识</text></>}
          </g>
          {!focus && hubs.map(h => <g key={h.name} transform={`translate(${h.x} ${h.y})`} className="kb-garden-category"><circle r="4" fill={h.color} /><text y="-15" textAnchor="middle" fill={h.color}>{h.name}</text></g>)}
          {positions.map((n, i) => <g key={n.path} className={`kb-garden-node ${n.path === focus ? 'is-selected' : ''} ${bright && !related.has(n.path) ? 'is-dimmed' : ''}`} style={{ transform: `translate(${n.x}px, ${n.y}px)`, color: n.color }} role="button" tabIndex={0} aria-label={`聚焦 ${n.title}`}
            onPointerEnter={() => setHovered(n.path)} onFocus={() => setHovered(n.path)} onBlur={() => setHovered('')}
            onClick={() => onFocus(n.path)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus(n.path) } }}>
            <title>{n.title}\n{n.path}</title>
            <g className="kb-garden-seed-arrival" style={{ animationDelay: `${Math.min(i * 12, 650)}ms` }}>
              <circle r="13" className="kb-garden-seed-halo" /><use className="kb-garden-pappus" href={`#${id}Seed`} transform={n.path === focus ? 'scale(2.5)' : 'scale(1)'} />
              <circle r="17" fill="transparent" stroke="none" />
              <text y={n.path === focus ? 45 : 25} textAnchor="middle" className={`kb-garden-node-label ${nodes.length <= 12 || n.path === focus ? 'is-visible' : ''}`}>{shorten(n.title)}</text>
            </g>
          </g>)}
          {selected && <text x="450" y="382" textAnchor="middle" className="kb-garden-focus-hint">点击右侧阅读原始笔记</text>}
        </g>
      </g>
    </svg>
  </div>
}
