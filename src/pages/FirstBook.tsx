import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Circle, PenLine } from 'lucide-react'

/** 章节清单：与 public/first-book/ 下的 md 文件一一对应 */
const PARTS = [
  {
    id: 'part1',
    title: '第一部分 地图：投资的全部种类',
    subtitle: '看懂江湖再进门',
    chapters: [
      { no: '第1章', title: '按时间分：短线、中线、长线', file: '', status: 'pending' },
      { no: '第2章', title: '按资产分：你能买的所有东西', file: '', status: 'pending' },
      { no: '第3章', title: '按策略分：市场上活着的九种打法', file: '', status: 'pending' },
      { no: '第4章', title: '按玩家分：你的对手盘都是谁', file: '', status: 'pending' },
      { no: '第5章', title: '残酷的算术：散户亏钱原因排行榜', file: '', status: 'pending' },
    ],
  },
  {
    id: 'part2',
    title: '第二部分 选择：为什么中线适合普通人',
    subtitle: '像数学证明一样不可逆',
    chapters: [
      { no: '第6章', title: '时间账本：每周能给投资几小时', file: '', status: 'pending' },
      { no: '第7章', title: '胜率拆解：中线赚钱的三个来源', file: '', status: 'pending' },
      { no: '第8章', title: '对手盘分析：散户的相对优势', file: '', status: 'pending' },
      {
        no: '第9章',
        title: '放弃宏观：从大奖章到林奇的共同选择',
        file: '第9章-放弃宏观.md',
        status: 'draft',
      },
      { no: '第10章', title: '复利的数学：慢即是快', file: '', status: 'pending' },
      { no: '第11章', title: '中线宣言：普通人的投资宪法', file: '', status: 'pending' },
    ],
  },
  {
    id: 'part3',
    title: '第三部分 选股：只教四种林奇战法',
    subtitle: '散户能赢的四种',
    chapters: [
      { no: '第12章', title: '价值回归：最简单的一招', file: '', status: 'pending' },
      { no: '第13章', title: '快速增长型：十倍股长什么样', file: '', status: 'pending' },
      { no: '第14章', title: '困境反转型：别人恐惧时你的机会', file: '', status: 'pending' },
      {
        no: '第15章',
        title: '周期型：最容易让聪明人翻车的类型',
        file: '第15章-周期型.md',
        status: 'draft',
      },
      { no: '第16章', title: '组合搭配：四种战法怎么配', file: '', status: 'pending' },
    ],
  },
  {
    id: 'part4',
    title: '第四部分 执行：卖出与仓位',
    subtitle: '纪律层',
    chapters: [
      { no: '第17章', title: '怎么拿住：波动是你的朋友', file: '', status: 'pending' },
      { no: '第18章', title: '什么时候卖：比买入难十倍', file: '', status: 'pending' },
      { no: '第19章', title: '仓位与纪律：持而盈之，不如其已', file: '', status: 'pending' },
    ],
  },
  {
    id: 'part5',
    title: '第五部分 修心：不再每天看盘的自由',
    subtitle: '本书的灵魂 · 道德经 × 投资大师',
    chapters: [
      { no: '第20章', title: '看盘的代价：为什么越看越亏', file: '', status: 'pending' },
      { no: '第21章', title: '信息戒断：为道日损的实操', file: '', status: 'pending' },
      { no: '第22章', title: '看盘仪式：用日历和清单代替盯盘', file: '', status: 'pending' },
      { no: '第23章', title: '情绪红绿灯：护身符', file: '', status: 'pending' },
      { no: '第24章', title: '最后的对手：你自己', file: '第24章-最后的对手.md', status: 'draft' },
    ],
  },
]

const EXTRA_FILES = [
  { no: '全书', title: '全书大纲（22章 + 附录）', file: '全书大纲.md', status: 'done' },
]

const STATUS_LABEL: Record<string, string> = {
  done: '已定稿',
  draft: '初稿完成',
  pending: '待撰写',
}

/* ---------- 轻量 Markdown 渲染（覆盖本书用到的语法子集） ---------- */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i}`}
          style={{
            background: 'rgba(0,0,0,0.06)',
            padding: '1px 5px',
            borderRadius: '4px',
            fontSize: '0.9em',
          }}
        >
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

function renderMarkdown(md: string): React.ReactNode[] {
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
          <div key={nextKey()} style={{ overflowX: 'auto', margin: '12px 0' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.92rem',
                lineHeight: 1.6,
              }}
            >
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th
                      key={j}
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        borderBottom: '2px solid var(--system-blue, #007aff)',
                        background: 'rgba(0,0,0,0.03)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {renderInline(c, nextKey())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '7px 12px',
                          borderBottom: '1px solid rgba(0,0,0,0.08)',
                          verticalAlign: 'top',
                        }}
                      >
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
      const size = level === 1 ? '1.6rem' : level === 2 ? '1.25rem' : '1.05rem'
      out.push(
        <div
          key={nextKey()}
          style={{
            fontSize: size,
            fontWeight: 700,
            margin: level <= 2 ? '24px 0 10px' : '18px 0 8px',
            lineHeight: 1.4,
          }}
        >
          {renderInline(heading[2], nextKey())}
        </div>
      )
      i += 1
      continue
    }

    // 分隔线
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      out.push(<hr key={nextKey()} style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '20px 0' }} />)
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
        <blockquote
          key={nextKey()}
          style={{
            margin: '12px 0',
            padding: '10px 16px',
            borderLeft: '3px solid var(--system-blue, #007aff)',
            background: 'rgba(0,122,255,0.06)',
            borderRadius: '0 8px 8px 0',
            lineHeight: 1.7,
          }}
        >
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
        <ListTag
          key={nextKey()}
          style={{ margin: '8px 0', paddingLeft: '22px', lineHeight: 1.8 }}
        >
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, nextKey())}</li>
          ))}
        </ListTag>
      )
      continue
    }

    // 普通段落
    out.push(
      <p key={nextKey()} style={{ margin: '10px 0', lineHeight: 1.8 }}>
        {renderInline(line, nextKey())}
      </p>
    )
    i += 1
  }

  return out
}

/* ---------- 页面 ---------- */

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  backdropFilter: 'blur(30px)',
  padding: '32px',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-md)',
  marginBottom: '24px',
  border: '1px solid rgba(255, 255, 255, 0.7)',
}

const STATUS_COLOR: Record<string, string> = {
  done: '#34c759',
  draft: '#007aff',
  pending: '#8e8e93',
}

function StatusIcon({ status }: { status: string }): JSX.Element {
  if (status === 'pending') {
    return <Circle size={16} color={STATUS_COLOR.pending} style={{ flexShrink: 0 }} />
  }
  if (status === 'done') {
    return <CheckCircle2 size={16} color={STATUS_COLOR.done} style={{ flexShrink: 0 }} />
  }
  return <PenLine size={16} color={STATUS_COLOR.draft} style={{ flexShrink: 0 }} />
}

/** 书籍仪表盘：全书概览 + 章节进度 */
function BookDashboard(): JSX.Element {
  const allChapters = useMemo(() => [...EXTRA_FILES, ...PARTS.flatMap(p => p.chapters)], [])
  const drafted = allChapters.filter(c => c.status !== 'pending').length
  const progress = Math.round((drafted / allChapters.length) * 100)

  return (
    <main className="container" style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px' }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <BookOpen size={26} color="var(--system-blue, #007aff)" />
          <h1 style={{ margin: 0, fontSize: '1.7rem' }}>慢即是快</h1>
        </div>
        <p style={{ color: '#6e6e73', margin: '4px 0 16px', fontSize: '1.02rem' }}>
          彼得·林奇的道德经投资笔记 —— 一本写给普通散户的中线投资实操书
        </p>
        <p style={{ lineHeight: 1.8, margin: '0 0 12px' }}>
          <strong>主线</strong>：道德经为"道"（心法与节奏），彼得·林奇为"术"（选股与买卖），A股案例为"器"（落地证据）。
          核心主张只有一句人话：<strong>聚焦</strong>——放弃短线与宏观，只做散户能赢的四种战法。
        </p>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '16px' }}>
          <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--system-blue, #007aff)' }}>{drafted}</div>
            <div style={{ fontSize: '0.85rem', color: '#8e8e93' }}>已完成章节</div>
          </div>
          <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--system-blue, #007aff)' }}>{allChapters.length}</div>
            <div style={{ fontSize: '0.85rem', color: '#8e8e93' }}>总章节（含大纲）</div>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--system-blue, #007aff)' }}>{progress}%</div>
            <div
              style={{
                height: '6px',
                background: 'rgba(0,0,0,0.08)',
                borderRadius: '3px',
                marginTop: '8px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'var(--system-blue, #007aff)',
                  borderRadius: '3px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {EXTRA_FILES.map(f => (
        <div key={f.file} style={cardStyle}>
          <Link
            to={`/first-book/${encodeURIComponent(f.file)}`}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'inherit' }}
          >
            <StatusIcon status={f.status} />
            <span style={{ fontWeight: 600 }}>{f.title}</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: STATUS_COLOR[f.status] }}>
              {STATUS_LABEL[f.status]}
            </span>
            <ArrowRight size={16} color="#8e8e93" />
          </Link>
        </div>
      ))}

      {PARTS.map(part => (
        <div key={part.id} style={cardStyle}>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem' }}>{part.title}</h2>
          <p style={{ margin: '0 0 14px', color: '#8e8e93', fontSize: '0.9rem' }}>{part.subtitle}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {part.chapters.map(ch => {
              const inner = (
                <>
                  <StatusIcon status={ch.status} />
                  <span style={{ color: '#8e8e93', fontSize: '0.85rem', width: '52px', flexShrink: 0 }}>{ch.no}</span>
                  <span style={{ flex: 1 }}>{ch.title}</span>
                  <span style={{ fontSize: '0.82rem', color: STATUS_COLOR[ch.status] }}>{STATUS_LABEL[ch.status]}</span>
                  {ch.file && <ArrowRight size={14} color="#c7c7cc" />}
                </>
              )
              const rowStyle: React.CSSProperties = {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 10px',
                borderRadius: '8px',
                textDecoration: 'none',
                color: 'inherit',
                fontSize: '0.95rem',
              }
              return ch.file ? (
                <Link
                  key={ch.no}
                  to={`/first-book/${encodeURIComponent(ch.file)}`}
                  style={rowStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {inner}
                </Link>
              ) : (
                <div key={ch.no} style={{ ...rowStyle, opacity: 0.55, cursor: 'default' }}>
                  {inner}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p style={{ textAlign: 'center', color: '#aeaeb2', fontSize: '0.82rem', margin: '8px 0 24px' }}>
        本书内容仅为投资方法论讨论，不构成任何投资建议。
      </p>
    </main>
  )
}

/** 章节阅读器 */
function ChapterReader({ file }: { file: string }): JSX.Element {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const allChapters = useMemo(() => [...EXTRA_FILES, ...PARTS.flatMap(p => p.chapters)].filter(c => c.file), [])
  const decoded = decodeURIComponent(file)
  const idx = allChapters.findIndex(c => c.file === decoded)
  const chapter = idx >= 0 ? allChapters[idx] : null
  const prev = idx > 0 ? allChapters[idx - 1] : null
  const next = idx >= 0 && idx < allChapters.length - 1 ? allChapters[idx + 1] : null

  useEffect(() => {
    setContent(null)
    setError(false)
    fetch(`${import.meta.env.BASE_URL}first-book/${file}`)
      .then(r => {
        if (!r.ok) throw new Error('not found')
        return r.text()
      })
      .then(setContent)
      .catch(() => setError(true))
  }, [file])

  return (
    <main className="container" style={{ maxWidth: '860px', margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <Link to="/first-book" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--system-blue, #007aff)', textDecoration: 'none', fontSize: '0.92rem' }}>
          <ArrowLeft size={15} /> 返回《慢即是快》
        </Link>
      </div>

      <div style={{ ...cardStyle, lineHeight: 1.8, fontSize: '0.97rem' }}>
        {!content && !error && <p style={{ color: '#8e8e93' }}>加载中……</p>}
        {error && <p style={{ color: '#ff3b30' }}>章节文件未找到：{decoded}</p>}
        {content && renderMarkdown(content)}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
        {prev ? (
          <Link
            to={`/first-book/${encodeURIComponent(prev.file)}`}
            style={{ ...cardStyle, flex: 1, display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'inherit', marginBottom: 0, padding: '16px 20px' }}
          >
            <ArrowLeft size={16} color="var(--system-blue, #007aff)" />
            <span style={{ fontSize: '0.9rem' }}>上一篇：{prev.title}</span>
          </Link>
        ) : (
          <div style={{ flex: 1 }} />
        )}
        {next && (
          <Link
            to={`/first-book/${encodeURIComponent(next.file)}`}
            style={{ ...cardStyle, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', textDecoration: 'none', color: 'inherit', marginBottom: 0, padding: '16px 20px', textAlign: 'right' }}
          >
            <span style={{ fontSize: '0.9rem' }}>下一篇：{next.title}</span>
            <ArrowRight size={16} color="var(--system-blue, #007aff)" />
          </Link>
        )}
      </div>
    </main>
  )
}

export default function FirstBook(): JSX.Element {
  const params = useParams<{ file?: string }>()
  if (params.file) {
    return <ChapterReader file={params.file} />
  }
  return <BookDashboard />
}
