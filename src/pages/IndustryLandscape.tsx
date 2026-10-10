import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  BatteryCharging,
  Banknote,
  Bot,
  BrainCircuit,
  Car,
  Atom,
  Shield,
  Smartphone,
  Wine,
  ChevronDown,
  ChevronRight,
  Cpu,
  Pill,
  Plane,
  Rocket,
  Search,
  SunMedium,
  X,
} from 'lucide-react'
import { PageTabs, PageTitle } from '../components/ui/PageTabs'
import ThemeCards from './ThemeCards'
import '../styles/industry-landscape.css'

interface TreeNode {
  t: string
  n?: string
  img?: string
  c?: TreeNode[]
}
const BASE = import.meta.env.BASE_URL
const SOURCES = {
  solid: {
    label: '固态电池',
    file: 'industry/solid-state.json',
    description: '从电解质路线到材料、制造与应用，沿着关键环节读懂产业。',
    icon: BatteryCharging,
  },
  semi: {
    label: '半导体产业链',
    file: 'industry/semiconductor.json',
    description: '从材料与工具到设计、制造和终端应用，串起芯片的完整链路。',
    icon: Cpu,
  },
  ai: {
    label: 'AI算力',
    file: 'industry/ai-compute.json',
    description: '从算力芯片、服务器与网络，到数据中心、云和模型应用，看清算力需求如何层层传导。',
    icon: BrainCircuit,
  },
  robot: {
    label: '机器人',
    file: 'industry/robots.json',
    description: '从减速器、伺服、传感器到工业、服务、特种和人形机器人，再到系统集成与应用。',
    icon: Bot,
  },
  ev: {
    label: '新能源车与智驾',
    file: 'industry/ev-adas.json',
    description: '电池材料、电驱电控、智能驾驶与整车出海，串起新能源汽车的完整链条。',
    icon: Car,
  },
  pv: {
    label: '光伏与储能',
    file: 'industry/pv-storage.json',
    description: '从硅料到组件，从电芯到电网消纳，理解新能源发电与储能的供需与技术路线。',
    icon: SunMedium,
  },
  drug: {
    label: '创新药',
    file: 'industry/innovative-drug.json',
    description: '研发流程、治疗领域、CXO与对外授权，看懂创新药的价值链与风险结构。',
    icon: Pill,
  },
  lowalt: {
    label: '低空经济',
    file: 'industry/low-altitude.json',
    description: 'eVTOL、无人机、核心部件与低空基础设施，以及适航和空域这两道关口。',
    icon: Plane,
  },
  space: {
    label: '商业航天',
    file: 'industry/commercial-space.json',
    description: '运载火箭、卫星制造、地面终端与应用服务，沿着星座组网需求读懂产业。',
    icon: Rocket,
  },
  military: {
    label: '军工',
    file: 'industry/military.json',
    description: '从材料与元器件到分系统和总装集成，加上无人装备等新兴领域，读懂军工产业链的分层。',
    icon: Shield,
  },
  nuclear: {
    label: '核电与电网',
    file: 'industry/nuclear-grid.json',
    description: '核电运营、核岛设备、新一代核能，以及智能电网的一次与二次设备。',
    icon: Atom,
  },
  consumer: {
    label: '消费电子',
    file: 'industry/consumer-electronics.json',
    description: '整机品牌、核心芯片、模组零部件和 AI 眼镜等新品类，沿着换机周期看产业。',
    icon: Smartphone,
  },
  baijiu: {
    label: '白酒',
    file: 'industry/baijiu.json',
    description: '香型、价格带、渠道与库存周期，理解白酒的需求和定价逻辑。',
    icon: Wine,
  },
  bank: {
    label: '银行',
    file: 'industry/banks.json',
    description: '净息差、资产质量与资本分红三个核心变量，以及不同类型银行的差异。',
    icon: Banknote,
  },
} as const
type SourceId = keyof typeof SOURCES
type TabId = SourceId | 'cards'
const title = (node: TreeNode) => node.t.split('\n')[0]
function countNodes(node: TreeNode): number {
  return 1 + (node.c || []).reduce((sum, child) => sum + countNodes(child), 0)
}
function ownMatch(node: TreeNode, q: string): boolean {
  return `${node.t}\n${node.n || ''}`.toLowerCase().includes(q)
}
function matches(node: TreeNode, q: string): boolean {
  return ownMatch(node, q) || !!node.c?.some((child) => matches(child, q))
}
function countMatches(node: TreeNode, q: string): number {
  return Number(ownMatch(node, q)) + (node.c || []).reduce((sum, child) => sum + countMatches(child, q), 0)
}

function Highlight({ text, q }: { text: string; q: string }): JSX.Element {
  if (!q) return <>{text}</>
  const parts: React.ReactNode[] = []
  let start = 0
  let at = text.toLowerCase().indexOf(q)
  while (at !== -1) {
    parts.push(text.slice(start, at), <mark key={at}>{text.slice(at, at + q.length)}</mark>)
    start = at + q.length
    at = text.toLowerCase().indexOf(q, start)
  }
  parts.push(text.slice(start))
  return <>{parts}</>
}
function NodeText({ text, q }: { text: string; q: string }): JSX.Element {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2 || !lines.every((line) => line.startsWith('|'))) return <Highlight text={text} q={q} />
  const rows = lines
    .filter((line) => !/^\|[\s:|-]+\|?$/.test(line))
    .map((line) =>
      line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
  return (
    <div className="industry-table-scroll" role="region" aria-label="资料对照表" tabIndex={0}>
      <table>
        <thead>
          <tr>
            {rows[0].map((cell, i) => (
              <th scope="col" key={i}>
                <Highlight text={cell} q={q} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>
                  <Highlight text={cell} q={q} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function Node({
  node,
  depth,
  q,
  mode,
  revealAll = false,
}: {
  node: TreeNode
  depth: number
  q: string
  mode: 'default' | 'open' | 'closed'
  revealAll?: boolean
}): JSX.Element | null {
  const [open, setOpen] = useState(mode === 'open' || (mode === 'default' && depth < 2))
  const id = useId()
  if (q && !revealAll && !matches(node, q)) return null
  const hasKids = !!node.c?.length
  const expanded = !!q || open
  // A matching parent keeps its context, including its descendants.
  const revealChildren = revealAll || (!!q && ownMatch(node, q))
  return (
    <div className={`industry-node ${depth === 0 ? 'industry-node--root' : ''}`}>
      <div className="industry-node-row">
        {hasKids ? (
          <button
            type="button"
            className="industry-node-toggle"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setOpen(!open)}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>
              <Highlight text={node.t} q={q} />
            </span>
            <small>{node.c!.length} 项</small>
          </button>
        ) : (
          <div className="industry-node-leaf">
            <NodeText text={node.t} q={q} />
          </div>
        )}
        {node.n && (
          <p className="industry-node-note">
            <Highlight text={node.n} q={q} />
          </p>
        )}
        {node.img && (
          <img src={`${BASE}industry/solid-state/${node.img}`} alt={`${title(node)}配图`} loading="lazy" />
        )}
      </div>
      {hasKids && expanded && (
        <div id={id} className="industry-node-children">
          {node.c!.map((child, i) => (
            <Node key={i} node={child} depth={depth + 1} q={q} mode={mode} revealAll={revealChildren} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function IndustryLandscape(): JSX.Element {
  const [tab, setTab] = useState<TabId>('solid')
  const readerRef = useRef<HTMLElement>(null)
  const [trees, setTrees] = useState<Partial<Record<SourceId, TreeNode | null>>>({})
  const [q, setQ] = useState('')
  const [sections, setSections] = useState<Record<SourceId, number>>(
    () => Object.fromEntries(Object.keys(SOURCES).map((id) => [id, 0])) as Record<SourceId, number>,
  )
  const [expansion, setExpansion] = useState<{ mode: 'default' | 'open' | 'closed'; revision: number }>({
    mode: 'default',
    revision: 0,
  })
  const tree = tab === 'cards' ? undefined : trees[tab]
  const query = q.trim().toLowerCase()
  useEffect(() => {
    if (tab === 'cards' || tab in trees) return
    let alive = true
    fetch(`${BASE}${SOURCES[tab].file}`)
      .then((response) => {
        if (response.ok === false) throw new Error('Load failed')
        return response.json()
      })
      .then((data: TreeNode) => {
        if (alive) setTrees((current) => ({ ...current, [tab]: data }))
      })
      .catch(() => {
        if (alive) setTrees((current) => ({ ...current, [tab]: null }))
      })
    return () => {
      alive = false
    }
  }, [tab, trees])
  const total = useMemo(() => (tree ? countNodes(tree) : 0), [tree])
  const hits = useMemo(() => (tree && query ? countMatches(tree, query) : 0), [tree, query])
  const resetExpansion = () =>
    setExpansion((current) => ({ mode: 'default', revision: current.revision + 1 }))
  const source = tab === 'cards' ? undefined : SOURCES[tab]
  const Icon = source?.icon || BatteryCharging
  const chapters = tree?.c || []
  const selected = tab === 'cards' ? 0 : sections[tab]
  const activeChapter = chapters[selected]
  return (
    <main>
      <PageTitle>产业格局</PageTitle>
      <PageTabs
        label="产业格局栏目"
        value={tab}
        onChange={(id) => {
          setTab(id)
          setQ('')
          resetExpansion()
        }}
        items={[
          ...(Object.keys(SOURCES) as SourceId[]).map((id) => ({
            id: id as TabId,
            label: SOURCES[id].label,
          })),
          { id: 'cards' as TabId, label: '主题研究卡' },
        ]}
      />
      {tab === 'cards' ? (
        <ThemeCards />
      ) : (
        <div className={`industry-workspace industry-workspace--${tab}`}>
          <header className="industry-intro">
            <div className="industry-intro-icon">
              <Icon size={30} strokeWidth={1.5} />
            </div>
            <div>
              <h2>{source!.label}</h2>
              <p>{source!.description}</p>
            </div>
            {tree && (
              <div className="industry-overview">
                <span>
                  <strong>{chapters.length}</strong> 个章节
                </span>
                <span>
                  <strong>{total}</strong> 个资料节点
                </span>
              </div>
            )}
          </header>
          <details className="industry-source-note">
            <summary>资料使用说明 · 历史整理，预测待核对</summary>
            <p role="note">
              这里是产业结构和技术路线的资料整理，用来看懂产业，不是买入清单。节点里出现的公司只是产业参与者；数据和预测多为早期整理，未逐条注明来源与日期，用前请自行核对。产业增长不等于公司盈利，更不等于股价回报，研究方法见书第31章；主题投资只放主动额度（第9章）。不构成投资建议。
            </p>
          </details>
          <div className="industry-search">
            <Search size={19} aria-hidden="true" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={`搜索公司、材料或技术路线${total ? `，共 ${total} 个节点` : ''}`}
              aria-label="搜索节点"
            />
            {q && (
              <button type="button" aria-label="清空搜索" onClick={() => setQ('')}>
                <X size={17} />
              </button>
            )}
          </div>
          {tree ? (
            <div className="industry-layout">
              <nav className="industry-directory" aria-label={`${source!.label}章节目录`}>
                <div className="industry-directory-title">章节目录</div>
                {chapters.map((chapter, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-current={!query && index === selected ? 'true' : undefined}
                    className={!query && index === selected ? 'is-active' : ''}
                    onClick={() => {
                      setSections((current) => ({ ...current, [tab]: index }))
                      setQ('')
                      resetExpansion()
                      requestAnimationFrame(() => readerRef.current?.scrollIntoView?.({ block: 'start' }))
                    }}
                  >
                    <span>{title(chapter)}</span>
                    <small>{countNodes(chapter) - 1}</small>
                  </button>
                ))}
              </nav>
              <section ref={readerRef} className="industry-reader" aria-label="产业资料阅读区">
                <div className="industry-reader-toolbar">
                  <div>
                    <span className="industry-reader-context">{query ? '全局搜索' : source!.label}</span>
                    <h3>
                      {query ? `“${q.trim()}”的搜索结果` : activeChapter ? title(activeChapter) : title(tree)}
                    </h3>
                    <p role="status">
                      {query ? `找到 ${hits} 个匹配节点，保留所属章节与层级` : '点击条目展开，逐层查看资料'}
                    </p>
                  </div>
                  <div className="industry-expand-actions">
                    <button
                      type="button"
                      disabled={!!query}
                      onClick={() =>
                        setExpansion((current) => ({ mode: 'open', revision: current.revision + 1 }))
                      }
                    >
                      全部展开
                    </button>
                    <button
                      type="button"
                      disabled={!!query}
                      onClick={() =>
                        setExpansion((current) => ({ mode: 'closed', revision: current.revision + 1 }))
                      }
                    >
                      全部收起
                    </button>
                  </div>
                </div>
                <div
                  className="industry-reader-content"
                  key={`${tab}-${selected}-${expansion.revision}-${query}`}
                >
                  {query ? (
                    hits ? (
                      (ownMatch(tree, query)
                        ? [tree]
                        : chapters.filter((chapter) => matches(chapter, query))
                      ).map((chapter, i) => (
                        <Node key={i} node={chapter} depth={0} q={query} mode={expansion.mode} />
                      ))
                    ) : (
                      <div className="industry-empty">
                        <Search size={28} />
                        <h4>没有找到相关资料</h4>
                        <p>试试公司简称、材料名称或更短的关键词。</p>
                        <button type="button" onClick={() => setQ('')}>
                          返回章节阅读
                        </button>
                      </div>
                    )
                  ) : (
                    <Node node={activeChapter || tree} depth={0} q="" mode={expansion.mode} />
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="industry-loading" role="status">
              {tree === null ? (
                <>
                  <p>资料加载失败</p>
                  <button
                    type="button"
                    onClick={() =>
                      setTrees((current) => {
                        const next = { ...current }
                        delete next[tab]
                        return next
                      })
                    }
                  >
                    重新加载
                  </button>
                </>
              ) : (
                '正在加载产业资料…'
              )}
            </div>
          )}
        </div>
      )}
    </main>
  )
}
