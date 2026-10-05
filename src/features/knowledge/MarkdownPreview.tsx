import React, { useMemo } from 'react'
import { Marked } from 'marked'
import type { Token, Tokens } from 'marked'
import type { Relations } from './api'
import CodeBlock from './CodeBlock'

// 用 marked 只做解析（GFM + Obsidian 换行），再把 token 渲染成 React 元素：
// 不使用 dangerouslySetInnerHTML，笔记里的原始 HTML 一律按文本显示。
type WikiToken = { type: 'wikilink'; raw: string; ref: string }
type HighlightToken = { type: 'highlight'; raw: string; text: string; tokens: Token[] }

const parser = new Marked({ gfm: true, breaks: true })
parser.use({
  extensions: [
    {
      name: 'wikilink', level: 'inline',
      start: src => src.indexOf('[['),
      tokenizer(src) {
        const match = /^!?\[\[([^\]\n]+)\]\]/.exec(src)
        if (match) return { type: 'wikilink', raw: match[0], ref: match[1] }
      },
    },
    {
      name: 'highlight', level: 'inline',
      start: src => src.indexOf('=='),
      tokenizer(src) {
        const match = /^==(?=\S)([^\n]*?\S)==/.exec(src)
        if (match) return { type: 'highlight', raw: match[0], text: match[1], tokens: this.lexer.inlineTokens(match[1]) }
      },
    },
  ],
})

const CALLOUT_LABEL: Record<string, string> = {
  note: '笔记', info: '信息', tip: '提示', hint: '提示', important: '重要', success: '完成', check: '完成', done: '完成',
  question: '问题', help: '问题', faq: '问题', warning: '注意', caution: '注意', attention: '注意', danger: '风险', error: '错误',
  bug: '缺陷', failure: '失败', fail: '失败', missing: '缺失', example: '示例', quote: '引用', cite: '引用', abstract: '摘要', summary: '摘要', tldr: '摘要', todo: '待办',
}

// YAML frontmatter：只做简单的「键: 值」展示，不执行任何解析逻辑
export function splitFrontmatter(content: string): { props: Array<[string, string]>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(content)
  if (!match) return { props: [], body: content }
  const props: Array<[string, string]> = []
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([^\s:#][^:]*):\s*(.*)$/.exec(line)
    const item = /^\s+-\s+(.*)$/.exec(line)
    if (kv) props.push([kv[1].trim(), kv[2].trim().replace(/^\[(.*)\]$/, '$1').replace(/^["']|["']$/g, '')])
    else if (item && props.length) { const last = props[props.length - 1]; last[1] = last[1] ? `${last[1]}, ${item[1].trim()}` : item[1].trim() }
  }
  return { props, body: content.slice(match[0].length) }
}

// 笔记里常见的内嵌 HTML（Notion/Obsidian 导出的表格、折叠块、加粗、换行）按白名单渲染：
// DOMParser 生成的是惰性文档（不执行脚本、不加载资源），再转成 React 元素，只保留安全属性。
const HTML_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col', 'p', 'div', 'span', 'br', 'hr',
  'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup', 'code', 'pre', 'kbd', 'blockquote', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'details', 'summary', 'a', 'img', 'font', 'center'])
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'link', 'meta', 'base', 'template', 'noscript', 'video', 'audio', 'canvas'])
const TABLE_PARTS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup'])
const VOID_TAGS = new Set(['br', 'hr', 'col', 'img'])

function htmlBalanced(html: string): boolean {
  const open = /^\s*<([a-zA-Z][\w-]*)/.exec(html)
  if (!open) return true
  const name = open[1].toLowerCase()
  if (VOID_TAGS.has(name)) return true
  const opens = (html.match(new RegExp(`<${name}(?=[\\s>/])`, 'gi')) ?? []).length
  const closes = (html.match(new RegExp(`</${name}\\s*>`, 'gi')) ?? []).length
  return closes >= opens
}

// 飞书/Notion 等导出时常把代码块压成一行行内代码，用 <br> 代替换行，上一行单独写语言名（如 Plaintext）。
// 识别这种段落，还原成真正的代码块。
const BR = /<br\s*\/?>/gi
const LANG_WORD = /^[A-Za-z][\w+#.-]{0,19}$/
function flattenedCode(token: Token): { lang?: string; code: string } | null {
  if (token.type !== 'paragraph') return null
  const parts = (token as Tokens.Paragraph).tokens.filter(t => !(t.type === 'text' && !t.raw.trim()))
  let lang: string | undefined
  if (parts.length >= 3 && parts[0].type === 'text' && LANG_WORD.test(parts[0].raw.trim()) && parts[1].type === 'br') { lang = parts[0].raw.trim(); parts.splice(0, 2) }
  if (!parts.length || !parts.every(t => t.type === 'codespan' || t.type === 'br')) return null
  const joined = parts.map(t => (t.type === 'br' ? '\n' : (t as Tokens.Codespan).text)).join('')
  if (!BR.test(joined)) return null
  BR.lastIndex = 0
  return { lang, code: decode(joined.replace(BR, '\n')) }
}

// 导出产物修复：普通行里用 <br> 代替换行、引用符被转义成 \>（飞书/Notion 常见）。
// 表格行（| 开头）、HTML 行（< 开头）和代码块内不动。
// 按 <br> 切分，但不切行内代码里的 <br>（那部分交给代码块还原逻辑）
function splitBr(line: string): string[] {
  const parts: string[] = []
  let last = 0
  for (const m of line.matchAll(/(`+)[^`]*?\1|<br\s*\/?>/gi)) {
    if (m[1]) continue
    parts.push(line.slice(last, m.index))
    last = m.index! + m[0].length
  }
  parts.push(line.slice(last))
  return parts
}

export function normalizeExport(body: string): string {
  const out: string[] = []
  let fence = ''
  for (const line of body.split('\n')) {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1]
    if (marker && (!fence || marker[0] === fence[0])) { fence = fence ? '' : marker; out.push(line); continue }
    if (fence || /^\s*[|<]/.test(line)) { out.push(line); continue }
    for (const part of splitBr(line)) {
      if (/^\s*\\>/.test(part)) out.push(...part.split(/\s*\\>\s?/).slice(1).map(item => `> ${item.trim()}`))
      else out.push(part)
    }
  }
  // 引用块后紧跟普通文字时补一个空行，避免被并入引用（惰性续行）
  return out.map((line, i) => (/^\s*>/.test(line) && out[i + 1]?.trim() && !/^\s*>/.test(out[i + 1]) ? `${line}\n` : line)).join('\n')
}

export default function MarkdownPreview({ content, relations, onOpen }: { content: string; relations: Relations | null; onOpen(path: string): void }): JSX.Element {
  const { props, tokens } = useMemo(() => {
    const { props, body } = splitFrontmatter(content)
    return { props, tokens: parser.lexer(normalizeExport(body)) }
  }, [content])

  function wikilink(ref: string, key: React.Key): React.ReactNode {
    const [reference, alias] = ref.split('|')
    const [target] = reference.split('#')
    const link = relations?.outgoing.find(l => l.target === target.trim())
    return link?.path
      ? <button type="button" className="kb-wikilink" key={key} onClick={() => onOpen(link.path!)}>{alias || reference}</button>
      : <span key={key} className="kb-wikilink is-unresolved">{alias || reference}</span>
  }

  function link(token: Tokens.Link | Tokens.Image, key: React.Key, image: boolean): React.ReactNode {
    const label = token.text
    const children = !image && 'tokens' in token && token.tokens ? inline(token.tokens) : label
    let target: string
    try { target = decodeURIComponent(token.href.split('#')[0]) } catch { return <span key={key}>{label}</span> }
    const resolved = relations?.outgoing.find(l => l.target === target && l.label === label)
    if (!image && resolved?.path) return <button type="button" className="kb-wikilink" key={key} onClick={() => onOpen(resolved.path!)}>{children}</button>
    if (/^https?:\/\//i.test(token.href)) return <a key={key} href={token.href} target="_blank" rel="noopener noreferrer">{image ? `🖼 ${label || '图片'}` : children}</a>
    return <span key={key} className="kb-wikilink is-unresolved">{label} · {image || resolved?.status === 'attachment' ? '附件，在 Obsidian 查看' : '未解析链接'}</span>
  }

  function inline(list: Token[] | undefined): React.ReactNode[] {
    if (list?.some(t => t.type === 'html')) return htmlToReact(list.map(t => (t.type === 'br' ? '<br>' : t.raw)).join(''))
    return (list ?? []).map((t, i) => {
      const token = t as Token | WikiToken | HighlightToken
      switch (token.type) {
        case 'wikilink': return wikilink((token as WikiToken).ref, i)
        case 'highlight': return <mark key={i}>{inline((token as HighlightToken).tokens)}</mark>
        case 'strong': return <strong key={i}>{inline(token.tokens)}</strong>
        case 'em': return <em key={i}>{inline(token.tokens)}</em>
        case 'del': return <del key={i}>{inline(token.tokens)}</del>
        case 'codespan': {
          const lines: string[] = (token as Tokens.Codespan).text.split(BR)
          return <code key={i}>{lines.map((line, j) => <React.Fragment key={j}>{j > 0 && <br />}{lines.length > 1 ? decode(line) : line}</React.Fragment>)}</code>
        }
        case 'br': return <br key={i} />
        case 'link': return link(token as Tokens.Link, i, false)
        case 'image': return link(token as Tokens.Image, i, true)
        case 'checkbox': return <input key={i} type="checkbox" className="kb-task" checked={(token as Tokens.Checkbox).checked} readOnly disabled />
        case 'text': return 'tokens' in token && token.tokens ? <React.Fragment key={i}>{inline(token.tokens)}</React.Fragment> : <React.Fragment key={i}>{decode(token.text)}</React.Fragment>
        case 'escape': return <React.Fragment key={i}>{token.text}</React.Fragment>
        default: return <React.Fragment key={i}>{'raw' in token ? token.raw : ''}</React.Fragment> // 原始 HTML 等：按文本显示
      }
    })
  }

  function inlineText(text: string): React.ReactNode[] {
    const first = parser.lexer(text)[0]
    return first?.type === 'paragraph' ? inline(first.tokens) : [text]
  }

  function htmlToReact(html: string): React.ReactNode[] {
    if (typeof DOMParser === 'undefined') return [html]
    const doc = new DOMParser().parseFromString(html, 'text/html')
    let n = 0
    const convert = (node: Node, parentTag: string, headerRow: boolean): React.ReactNode => {
      const key = n++
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        if (!text.trim()) return TABLE_PARTS.has(parentTag) ? null : text.includes('\n') ? ' ' : text
        return <React.Fragment key={key}>{/[*_`=~[\\]/.test(text) ? inlineText(text.trim()) : text}</React.Fragment>
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null
      const el = node as Element
      let tag = el.tagName.toLowerCase()
      if (DROP_TAGS.has(tag)) return null
      const children = (rowHeader: boolean) => Array.from(el.childNodes).map(child => convert(child, tag, rowHeader))
      if (!HTML_TAGS.has(tag)) return <React.Fragment key={key}>{children(headerRow)}</React.Fragment> // 未知标签只保留内容
      if (tag === 'img') {
        const src = el.getAttribute('src') ?? '', alt = el.getAttribute('alt') || '图片'
        return /^https?:\/\//i.test(src) ? <a key={key} href={src} target="_blank" rel="noopener noreferrer">🖼 {alt}</a> : <span key={key} className="kb-wikilink is-unresolved">{alt} · 附件，在 Obsidian 查看</span>
      }
      if (tag === 'a') {
        const href = el.getAttribute('href') ?? ''
        return /^(https?:|mailto:)/i.test(href) ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{children(headerRow)}</a> : <span key={key}>{children(headerRow)}</span>
      }
      if (tag === 'font' || tag === 'center') tag = tag === 'font' ? 'span' : 'div'
      const props: Record<string, unknown> = { key }
      const align = el.getAttribute('align')
      if (align && /^(left|center|right)$/i.test(align)) props.style = { textAlign: align.toLowerCase() }
      if (tag === 'td' || tag === 'th') {
        const colSpan = Number(el.getAttribute('colspan')), rowSpan = Number(el.getAttribute('rowspan'))
        if (colSpan > 1) props.colSpan = colSpan
        if (rowSpan > 1) props.rowSpan = rowSpan
        if (tag === 'td' && headerRow) tag = 'th'
      }
      if (tag === 'ol' && Number(el.getAttribute('start')) > 1) props.start = Number(el.getAttribute('start'))
      if (tag === 'table') {
        // Notion 导出：header-row="true" 表示第一行是表头
        const firstRow = el.getAttribute('header-row') === 'true' ? el.querySelector('tr') : null
        const walk = (child: Node): React.ReactNode => {
          if (child.nodeType === Node.ELEMENT_NODE && /^(tbody|thead|tfoot)$/i.test((child as Element).tagName)) {
            const section = child as Element
            return React.createElement(section.tagName.toLowerCase(), { key: n++ }, Array.from(section.childNodes).map(row => convert(row, section.tagName.toLowerCase(), row === firstRow)))
          }
          return convert(child, 'table', child === firstRow)
        }
        return <div className="kb-table-wrap" key={key}><table>{Array.from(el.childNodes).map(walk)}</table></div>
      }
      if (tag === 'tr') return <tr key={key}>{Array.from(el.childNodes).map(child => convert(child, 'tr', headerRow))}</tr>
      return VOID_TAGS.has(tag) ? React.createElement(tag, props) : React.createElement(tag, props, children(headerRow))
    }
    return Array.from(doc.body.childNodes).map(node => convert(node, 'body', false))
  }

  function blockquote(token: Tokens.Blockquote, key: React.Key): React.ReactNode {
    const first = token.tokens[0]
    const head = first?.type === 'paragraph' ? /^\[!(\w+)\]([+-]?)[ \t]*([^\n]*)\n?/.exec(first.text) : null
    if (!head) return <blockquote key={key}>{blocks(token.tokens)}</blockquote>
    const kind = head[1].toLowerCase()
    const rest = parser.lexer(token.text.replace(/^\[!\w+\][+-]?[ \t]*[^\n]*\n?/, ''))
    return (
      <aside key={key} className={`kb-callout kb-callout-${kind}`}>
        <div className="kb-callout-title">{head[3] ? inlineText(head[3]) : CALLOUT_LABEL[kind] ?? head[1]}</div>
        {rest.length > 0 && <div className="kb-callout-body">{blocks(rest)}</div>}
      </aside>
    )
  }

  function blocks(source: Token[]): React.ReactNode[] {
    // 被空行拆散的 HTML 块（如逐行写的 <table>）先拼回完整片段再渲染
    const list: Token[] = []
    for (let i = 0; i < source.length; i++) {
      const token = source[i]
      const restored = flattenedCode(token)
      if (restored) {
        // 上一个块只有一个语言名（如「Plaintext」）时，作为代码块的语言
        const prev = list.length - 1 - (list[list.length - 1]?.type === 'space' ? 1 : 0)
        const label = list[prev]?.type === 'paragraph' && LANG_WORD.test(list[prev].raw.trim()) && !restored.lang ? list[prev].raw.trim() : undefined
        if (label) list.splice(prev)
        list.push({ type: 'code', raw: token.raw, lang: restored.lang ?? label, text: restored.code } as Tokens.Code)
        continue
      }
      if (token.type !== 'html' || htmlBalanced(token.raw)) { list.push(token); continue }
      let raw = token.raw
      while (i + 1 < source.length && !htmlBalanced(raw)) raw += source[++i].raw
      list.push({ type: 'html', block: true, pre: false, raw, text: raw } as Tokens.HTML)
    }
    return list.map((token, i) => {
      switch (token.type) {
        case 'heading': return React.createElement(`h${Math.min(token.depth + 1, 6)}`, { key: i }, inline(token.tokens))
        case 'paragraph': return <p key={i}>{inline(token.tokens)}</p>
        case 'code': return <CodeBlock key={i} code={token.text} lang={token.lang} />
        case 'blockquote': return blockquote(token as Tokens.Blockquote, i)
        case 'hr': return <hr key={i} />
        case 'list': {
          const l = token as Tokens.List
          const items = l.items.map((item, j) => (
            <li key={j} className={item.task ? 'kb-task-item' : undefined}>{item.loose ? blocks(item.tokens) : inlineOrBlocks(item.tokens)}</li>
          ))
          return l.ordered ? <ol key={i} start={typeof l.start === 'number' && l.start !== 1 ? l.start : undefined}>{items}</ol> : <ul key={i} className={l.items.some(it => it.task) ? 'kb-task-list' : undefined}>{items}</ul>
        }
        case 'table': {
          const t = token as Tokens.Table
          const align = (a: string | null) => (a ? { textAlign: a as 'left' | 'center' | 'right' } : undefined)
          return (
            <div className="kb-table-wrap" key={i}>
              <table>
                <thead><tr>{t.header.map((cell, j) => <th key={j} style={align(cell.align)}>{inline(cell.tokens)}</th>)}</tr></thead>
                <tbody>{t.rows.map((row, r) => <tr key={r}>{row.map((cell, j) => <td key={j} style={align(cell.align)}>{inline(cell.tokens)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
        case 'html': return <React.Fragment key={i}>{htmlToReact(token.text)}</React.Fragment>
        case 'text': return <p key={i}>{'tokens' in token && token.tokens ? inline(token.tokens) : token.text}</p>
        case 'space': case 'def': return null
        default: return 'raw' in token ? <p key={i}>{token.raw}</p> : null
      }
    })
  }

  // 紧凑列表项：文本直接放在 li 里，嵌套列表等块级内容照常渲染
  function inlineOrBlocks(list: Token[]): React.ReactNode[] {
    return list.map((token, i) => {
      if (token.type === 'text') return <React.Fragment key={i}>{'tokens' in token && token.tokens ? inline(token.tokens) : token.text}</React.Fragment>
      if (token.type === 'checkbox') return <React.Fragment key={i}>{inline([token])}</React.Fragment>
      return <React.Fragment key={i}>{blocks([token])}</React.Fragment>
    })
  }

  const body = blocks(tokens).filter(Boolean)
  return (
    <article className="kb-markdown">
      {props.length > 0 && (
        <dl className="kb-props" aria-label="笔记属性">
          {props.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v ? v.split(/,\s*/).map((part, j) => /^(tags?|aliases|标签)$/i.test(k) ? <span className="kb-tag" key={j}>{part.replace(/^#/, '')}</span> : <React.Fragment key={j}>{j > 0 && ', '}{part}</React.Fragment>) : '—'}</dd></React.Fragment>)}
        </dl>
      )}
      {body.length ? body : props.length ? null : <p className="kb-muted">从一个想法开始。</p>}
    </article>
  )
}

// marked 的 text token 在少数情况下会带 HTML 实体（如 &amp;），显示前还原
function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" } as Record<string, string>)[e])
}
