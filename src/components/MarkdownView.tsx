import React from 'react'
import SmartLink from './SmartLink'

/* ---------- 轻量 Markdown 渲染（覆盖本书与行业笔记用到的语法子集：标题、表格、引用、列表、粗体、斜体、行内代码、<br>） ---------- */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\)|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|<br\s*\/?>)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)$/)!
      const href = link[2]
      if (/^https?:\/\//.test(href)) {
        nodes.push(<a key={`${keyPrefix}-a${i}`} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a>)
      } else if (/^\/(?:data|research)\//.test(href)) {
        // 静态数据快照与独立报告不属于前端路由，必须整页加载
        nodes.push(<a key={`${keyPrefix}-a${i}`} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a>)
      } else {
        nodes.push(<SmartLink key={`${keyPrefix}-a${i}`} to={href}>{link[1]}</SmartLink>)
      }
    } else if (token.startsWith('<br')) {
      nodes.push(<br key={`${keyPrefix}-br${i}`} />)
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{token.slice(1, -1)}</em>)
    } else {
      nodes.push(
        <code key={`${keyPrefix}-c${i}`} className="md-code">
          {token.slice(1, -1)}
        </code>
      )
    }
    last = m.index + token.length
    i += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0
  const nextKey = () => `md-${key++}`

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i += 1
      continue
    }

    // 表格
    if (line.trim().startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map(c => c.trim())
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i += 1
      }
      if (rows.length > 0) {
        const [head, ...body] = rows
        out.push(
          <div key={nextKey()} className="md-table-wrap" role="region" aria-label="数据表格，可横向滚动" tabIndex={0}>
            <table className="md-table">
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j}>
                      {renderInline(c, nextKey())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci}>
                        {renderInline(c, nextKey())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // 标题
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      // 页面标题已是 h1，正文 # 降一级，保证标题层级可导航
      const Tag = `h${Math.min(level + 1, 5)}` as 'h2' | 'h3' | 'h4' | 'h5'
      out.push(
        <Tag key={nextKey()} className={`md-heading md-heading--${Math.min(level, 3)}`}>
          {renderInline(heading[2], nextKey())}
        </Tag>
      )
      i += 1
      continue
    }

    // 分隔线
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      out.push(<hr key={nextKey()} className="md-hr" />)
      i += 1
      continue
    }

    // 引用块
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i += 1
      }
      out.push(
        <blockquote key={nextKey()} className="md-quote">
          {quoteLines.map((q, qi) => (
            <div key={qi}>{renderInline(q, nextKey())}</div>
          ))}
        </blockquote>
      )
      continue
    }

    // 有序/无序列表
    if (/^\s*(-|\*|\d+\.)\s+/.test(line)) {
      const items: string[] = []
      const ordered = /^\s*\d+\.\s+/.test(line)
      while (i < lines.length && /^\s*(-|\*|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(-|\*|\d+\.)\s+/, ''))
        i += 1
      }
      const ListTag = ordered ? 'ol' : 'ul'
      out.push(
        <ListTag key={nextKey()} className="md-list">
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, nextKey())}</li>
          ))}
        </ListTag>
      )
      continue
    }

    // 普通段落
    out.push(
      <p key={nextKey()} className="md-p">
        {renderInline(line, nextKey())}
      </p>
    )
    i += 1
  }

  return out
}
