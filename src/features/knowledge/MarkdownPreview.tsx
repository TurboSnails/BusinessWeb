import React from 'react'
import type { Relations } from './api'

export default function MarkdownPreview({ content, relations, onOpen }: { content: string; relations: Relations | null; onOpen(path: string): void }): JSX.Element {
  function inline(text: string): React.ReactNode[] {
    return text.split(/(\[\[[^\]\n]+\]\]|!?\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const [reference, alias] = part.slice(2, -2).split('|')
        const [target] = reference.split('#')
        const link = relations?.outgoing.find(l => l.target === target.trim())
        return link?.path ? <button type="button" className="kb-wikilink" key={i} onClick={() => onOpen(link.path!)}>{alias || reference}</button> : <span key={i} className="kb-wikilink is-unresolved">{alias || reference}</span>
      }
      const markdown = part.match(/^(!?)\[([^\]]+)\]\(([^\s)]+)\)$/)
      if (markdown) {
        const [, image, label, url] = markdown
        let target: string
        try { target = decodeURIComponent(url.split('#')[0]) } catch { return part }
        const link = relations?.outgoing.find(l => l.target === target && l.label === label)
        if (!image && link?.path) return <button type="button" className="kb-wikilink" key={i} onClick={() => onOpen(link.path!)}>{label}</button>
        if (/^https?:\/\//i.test(url)) return <a key={i} href={url} target="_blank" rel="noopener noreferrer">{label}</a>
        return <span key={i} className="kb-wikilink is-unresolved">{label} · {image || link?.status === 'attachment' ? '附件，在 Obsidian 查看' : '未解析链接'}</span>
      }
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
      return part
    })
  }
  const nodes: React.ReactNode[] = []
  const lines = content.split('\n')
  let fenced = false, marker = '', code: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^\s*(```+|~~~+)/)
    if (fence) {
      if (!fenced) { fenced = true; marker = fence[1][0]; code = [] }
      else if (fence[1][0] === marker) { nodes.push(<pre key={i}><code>{code.join('\n')}</code></pre>); fenced = false }
      else code.push(line)
      continue
    }
    if (fenced) { code.push(line); continue }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) nodes.push(React.createElement(`h${Math.min(heading[1].length + 1, 6)}`, { key: i }, inline(heading[2])))
    else if (/^>\s?/.test(line)) nodes.push(<blockquote key={i}>{inline(line.replace(/^>\s?/, ''))}</blockquote>)
    else if (/^[-*]\s+/.test(line)) nodes.push(<p className="kb-list-line" key={i}>• {inline(line.slice(2))}</p>)
    else if (/^---+$/.test(line)) nodes.push(<hr key={i} />)
    else if (line.trim()) nodes.push(<p key={i}>{inline(line)}</p>)
  }
  if (fenced) nodes.push(<pre key="unclosed"><code>{code.join('\n')}</code></pre>)
  return <article className="kb-markdown">{nodes.length ? nodes : <p className="kb-muted">从一个想法开始。</p>}</article>
}
