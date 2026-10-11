import React, { useEffect, useMemo, useState, useRef } from 'react'
import ChapterNav from '../components/ChapterNav'
import ChapterComments from '../components/ChapterComments'
import { BookAudioProvider, useBookAudio } from '../components/BookAudio'
import { usePageSeo } from '../components/RouteSeo'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Circle, Headphones, PenLine, Search, X, Minus, Plus } from 'lucide-react'
import { Page, PageTitle } from '../components/ui'
import '../styles/book.css'

/** 章节清单：与 public/first-book/ 下的 md 文件一一对应 */
const PARTS = [
  {
    id: 'opening',
    title: '开篇 美好的愿望：工作，是为了有一天不必再工作',
    subtitle: '从4%法则出发，规划自己的生活与选择权',
    chapters: [
      { no: '开篇', title: '美好的愿望：4%法则与生活的选择权', file: '开篇-美好的愿望.md', status: 'draft' },
    ],
  },
  {
    id: 'part1',
    title: '第一部分 先看地图：赚钱的路有哪些',
    subtitle: '认识投资类型、代表人物、适合人群，以及不同市场环境下的策略取舍',
    chapters: [
      { no: '第1章', title: '全球投资地图：十二种赚钱逻辑', file: '第1章-全球投资地图.md', status: 'draft' },
      { no: '第2章', title: '企业派的三种买法：捡便宜、买好货、两头占', file: '第2章-企业派三种策略.md', status: 'draft' },
      { no: '第3章', title: '普通人的三种打法：定投、收息、网格', file: '第3章-普通人常见策略.md', status: 'draft' },
      { no: '第4章', title: '变化派的三种机会：风口、拐点、困境反转', file: '第4章-变化派三种策略.md', status: 'draft' },
      { no: '第5章', title: '交易派的三种打法：跟趋势、追龙头、转题材', file: '第5章-交易派三种策略.md', status: 'draft' },
      { no: '第6章', title: '什么行情，用什么打法', file: '第6章-环境决定策略.md', status: 'draft' },
    ],
  },
  {
    id: 'part2',
    title: '第二部分 先打底仓：省心的配置与平衡',
    subtitle: '配置为主，规则再平衡，网格作为可选卫星，小仓位学习中线',
    chapters: [
      { no: '第7章', title: '先分清钱的用途，再谈怎么投', file: '第7章-配置优先.md', status: 'draft' },
      { no: '专题', title: '家庭财务底座：保障、负债、税收优惠账户与多个目标', file: '专题-家庭财务底座.md', status: 'draft' },
      { no: '专题', title: '资产基础：每类资产赚什么，怕什么？', file: '专题-资产基础.md', status: 'draft' },
      { no: '第8章', title: '动态平衡：用规则代替猜测', file: '第8章-动态平衡.md', status: 'draft' },
      { no: '第9章', title: '一套参考方案：大头求稳，小头练手', file: '第9章-参考方案.md', status: 'draft' },
      { no: '第10章', title: '挑基金：选对产品，算清费用', file: '第10章-标普500与纳指100落地.md', status: 'draft' },
      { no: '第11章', title: '网格与半仓网格：震荡市里的笨办法', file: '第11章-网格与半仓网格.md', status: 'draft' },
    ],
  },
  {
    id: 'part3',
    title: '第三部分 想清节奏：短线、中线还是长线',
    subtitle: '短线：残酷的前线 · 中线：最肥美的曲线 · 长线：正念的淡然 · 放弃宏观',
    chapters: [
      { no: '第12章', title: '短线：残酷的前线', file: '第12章-短线.md', status: 'draft' },
      { no: '第13章', title: '中线：最肥美的曲线', file: '第13章-中线.md', status: 'draft' },
      { no: '第14章', title: '长线：正念的淡然', file: '第14章-长线.md', status: 'draft' },
      { no: '第15章', title: '看长做中：长线眼光，中线节奏', file: '第15章-中长线结合.md', status: 'draft' },
      { no: '第16章', title: '放弃预测宏观：把猜测换成预案', file: '第16章-放弃宏观.md', status: 'draft' },
      { no: '第17章', title: '复利的数学：慢即是快', file: '第17章-复利的数学.md', status: 'draft' },
      { no: '第18章', title: '我的投资选择：一张表找到你的打法', file: '第18章-我的投资选择.md', status: 'draft' },
    ],
  },
  {
    id: 'part4',
    title: '第四部分 中线选股：跟林奇学先分类',
    subtitle: '先分类，再按类型研究：价值回归 · 快速增长 · 困境反转',
    chapters: [
      { no: '第19章', title: '选股总纲：先分类，再下注', file: '第19章-总纲.md', status: 'draft' },
      { no: '第20章', title: '价值回归：便宜怎样变成机会', file: '第20章-价值回归.md', status: 'draft' },
      { no: '第21章', title: '快速增长：增长怎样变成你的回报', file: '第21章-快速增长型.md', status: 'draft' },
      { no: '第22章', title: '困境反转：先活下来，再谈回报', file: '第22章-困境反转型.md', status: 'draft' },
    ],
  },
  {
    id: 'part5',
    title: '第五部分 长线选股：跟巴菲特学买企业',
    subtitle: '能力圈 · 护城河 · 所有者收益 · 安全边际 · 长期持有',
    chapters: [
      { no: '第23章', title: '能力圈与护城河：先问“十年后它还在赚钱吗”', file: '第23章-能力圈与护城河.md', status: 'draft' },
      { no: '第24章', title: '安全边际与长期持有：好公司也要买得值', file: '第24章-安全边际与长期持有.md', status: 'draft' },
    ],
  },
  {
    id: 'part6',
    title: '第六部分 研究工具箱：看懂行业、公司和财报',
    subtitle: '中线与长线共同依赖的研究工具：产业、公司、财报、估值、周期、趋势、未来产业',
    chapters: [
      { no: '第25章', title: '产业：先看懂公司所在的世界', file: '第25章-产业.md', status: 'draft' },
      { no: '第26章', title: '公司：它到底是一门怎样的生意？', file: '第26章-公司.md', status: 'draft' },
      { no: '第27章', title: '财报：利润是真的吗，现金在哪里？', file: '第27章-财报.md', status: 'draft' },
      { no: '第28章', title: '估值：公司贵不贵，怎样才算买得值？', file: '第28章-估值.md', status: 'draft' },
      { no: '第29章', title: '周期：先问公司现在站在周期的哪个位置', file: '第29章-周期.md', status: 'draft' },
      { no: '第30章', title: '趋势：三种趋势，别混在一起看', file: '第30章-趋势.md', status: 'draft' },
      { no: '第31章', title: '未来产业：怎样研究“下一个十年”', file: '第31章-未来产业展望.md', status: 'draft' },
      { no: '实战', title: '一家公司，从看懂到决定', file: '专题-一家公司从研究到决定.md', status: 'draft' },
      { no: '第32章', title: '建自己的观察库：看得多了，才认得好公司', file: '第32章-公司观察库.md', status: 'draft' },
    ],
  },
  {
    id: 'part7',
    title: '第七部分 落地执行：组合、拿住、卖出与复盘',
    subtitle: '买对之后,靠规则拿住、卖出和复盘',
    chapters: [
      { no: '第33章', title: '组合搭配：先算亏得起，再算赚多少', file: '第33章-组合搭配.md', status: 'draft' },
      { no: '专题', title: '正念决策：把情绪、事实与行动分开', file: '专题-正念决策.md', status: 'draft' },
      { no: '第34章', title: '怎么拿住：波动是你的朋友', file: '第34章-怎么拿住.md', status: 'draft' },
      { no: '第35章', title: '什么时候卖：比买入难十倍', file: '第35章-什么时候卖.md', status: 'draft' },
      { no: '第36章', title: '仓位与纪律：买几只、买多少、何时停', file: '第36章-仓位与纪律.md', status: 'draft' },
      { no: '第37章', title: '犯错与复盘：把错误变成规则', file: '第37章-犯错与复盘.md', status: 'draft' },
    ],
  },
  {
    id: 'part8',
    title: '第八部分 修心：投资是为了更好的生活',
    subtitle: '忙碌的时候，多专注；\n迷茫的时候，多读书；\n独处的时候，多运动；\n空闲的时候，找兴趣。',
    chapters: [
      { no: '第38章', title: '投资为了什么：让钱服务生活', file: '第38章-投资为了什么.md', status: 'draft' },
      { no: '专题', title: '提款与生活：从积累资金到支付账单', file: '专题-提款与生活.md', status: 'draft' },
      { no: '第39章', title: '给投资设边界：少一点噪音，多一点从容', file: '第39章-给投资设边界.md', status: 'draft' },
      { no: '第40章', title: '回到生活：专注、读书、运动、兴趣', file: '第40章-回到生活.md', status: 'draft' },
    ],
  },
  {
    id: 'appendix',
    title: '附录：读者工具与延伸阅读',
    subtitle: '一页纸工具、选修与资料',
    chapters: [
      { no: '附录A', title: '十倍股检查清单', file: '附录A-十倍股检查清单.md', status: 'draft' },
      { no: '附录B', title: '道德经投资心法卡（15张补充卡）', file: '附录B-道德经投资心法卡.md', status: 'draft' },
      { no: '附录C', title: '中线投资者的年度操作日历', file: '附录C-年度操作日历.md', status: 'draft' },
      { no: '附录D', title: '周期股速查（选修）', file: '附录D-周期股速查.md', status: 'draft' },
      { no: '附录E', title: '凯利公式与半凯利推导（选读）', file: '附录E-凯利公式推导.md', status: 'draft' },
      { no: '附录F', title: '推荐书单与数据来源', file: '附录F-书单与数据来源.md', status: 'draft' },
      { no: '附录G', title: '未来产业观察表（年度更新）', file: '附录G-未来产业观察表.md', status: 'draft' },
      { no: '附录H', title: '林家的投资全过程：从资金表到压力复盘', file: '附录H-家庭投资全过程.md', status: 'draft' },
      { no: '附录I', title: '术语表：一句话白话，和"在哪能看到"', file: '附录I-术语表.md', status: 'draft' },
    ],
  },
]

const EXTRA_FILES = [
  { no: '导读', title: '把注意力还给生活', file: '导读-把注意力还给生活.md', status: 'draft' },
  { no: '全书', title: '全书大纲（40章 + 5篇专题 + 附录）', file: '全书大纲.md', status: 'done' },
]

/** 写作与审校过程文档：不属于正文，放在书末单独区块 */
const REVIEW_FILES = [
  { no: '修订', title: '第十六轮：叙事、研究实战与阅读体验（2026-10-11）', file: '修订记录-第十六轮-2026-10-11.md', status: 'note' },
  { no: '修订', title: '修订记录（第十五轮：全收益口径、宽基模板与家庭财务底座，2026-10-05）', file: '修订记录-第十五轮-2026-10-05.md', status: 'note' },
  { no: '审稿', title: '审稿建议（第十五轮·专业投资者视角，2026-10-05）', file: '审稿建议-第十五轮-专业投资者视角-2026-10-05.md', status: 'note' },
  { no: '修订', title: '修订记录（第十四轮：正念练习、数据证据与案例阅读，2026-10-04）', file: '修订记录-第十四轮-2026-10-04.md', status: 'note' },
  { no: '修订', title: '修订记录（第十三轮：章节标题整体优化——去术语、口语化，2026-10-04）', file: '修订记录-第十三轮-2026-10-04.md', status: 'note' },
  { no: '修订', title: '修订记录（第十二轮：第四至第八部分重排，新增长线两章，2026-10-04）', file: '修订记录-第十二轮-2026-10-04.md', status: 'note' },
  { no: '修订', title: '修订记录（第十一轮：收口轮——去重、销账与减负，2026-10-03）', file: '修订记录-第十一轮-2026-10-03.md', status: 'note' },
  { no: '修订', title: '修订记录（第十轮：三种战法正反对照案例，2026-10-03）', file: '修订记录-第十轮-2026-10-03.md', status: 'note' },
  { no: '修订', title: '修订记录（第九轮：清单统一与困境反转案例，2026-10-03）', file: '修订记录-第九轮-2026-10-03.md', status: 'note' },
  { no: '修订', title: '修订记录（第八轮：读者可用性补齐，2026-10-03）', file: '修订记录-第八轮-2026-10-03.md', status: 'note' },
  { no: '修订', title: '修订记录（第七轮：回归检查与断点修补，2026-10-03）', file: '修订记录-第七轮-2026-10-03.md', status: 'note' },
  { no: '修订', title: '修订记录（第六轮，2026-10-03）', file: '修订记录-第六轮-2026-10-03.md', status: 'note' },
  { no: '审稿', title: '审稿建议（第六轮·读者视角，2026-10-03）', file: '审稿建议-第六轮-读者视角-2026-10-03.md', status: 'note' },
  { no: '修订', title: '修订记录（第五轮：资金、产品与生活，2026-10-03）', file: '修订记录-第五轮-2026-10-03.md', status: 'note' },
  { no: '资料', title: '第五轮资料与口径（数据来源与口径说明）', file: '第五轮资料与口径.md', status: 'note' },
  { no: '修订', title: '修订记录（第四轮：选股与组合，2026-10-03）', file: '修订记录-第四轮-2026-10-03.md', status: 'note' },
  { no: '资料', title: '第四轮案例证据（案例数据来源留档）', file: '第四轮案例证据.md', status: 'note' },
  { no: '修订', title: '修订记录（第三轮，2026-10-03）', file: '修订记录-第三轮-2026-10-03.md', status: 'note' },
  { no: '审稿', title: '审稿建议（第三轮：知识密度，2026-10-03）', file: '审稿建议-第三轮-2026-10-03.md', status: 'note' },
  { no: '修订', title: '修订记录（第二轮，2026-10-03）', file: '修订记录-第二轮-2026-10-03.md', status: 'note' },
  { no: '审稿', title: '审稿建议（第二轮，2026-10-03）', file: '审稿建议-第二轮-2026-10-03.md', status: 'note' },
  { no: '修订', title: '修订记录（第一轮，2026-10-03）', file: '修订记录-2026-10-03.md', status: 'note' },
  { no: '审稿', title: '审稿建议（第一轮，2026-10-03）', file: '审稿建议-2026-10-03.md', status: 'note' },
  { no: '待办', title: '优化待办：下一轮该做什么（T1—T22）', file: '优化待办-下一步.md', status: 'note' },
  { no: '核对', title: '数字核对表：全书数字的来源、口径与核验状态', file: '数字核对表.md', status: 'note' },
  { no: '核对', title: '跨周期压力检查（双资产代理，非原五项组合）', file: '跨周期压力检查.md', status: 'note' },
]

const STATUS_LABEL: Record<string, string> = {
  done: '已定稿',
  draft: '初稿完成',
  pending: '待撰写',
  note: '过程文档',
}

/* ---------- 轻量 Markdown 渲染（覆盖本书用到的语法子集） ---------- */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>，。；）]+|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link || /^https?:\/\//.test(token)) {
      const label = link ? link[1] : token
      const href = link ? link[2] : token
      const localFile = safeDecode(href)
      if (knownBookFiles.has(localFile)) {
        nodes.push(<Link key={`${keyPrefix}-l${i}`} to={chapterHref(localFile)}>{label}</Link>)
      } else if (/^https?:\/\//i.test(href)) {
        nodes.push(<a key={`${keyPrefix}-l${i}`} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)
      } else {
        nodes.push(label)
      }
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

function renderMarkdown(md: string, onListenSection?: (index: number) => void): React.ReactNode[] {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0
  let sectionIndex = 0
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
          <div key={nextKey()} className="md-table-wrap" role="region" aria-label="表格" tabIndex={0}>
            <table className="md-table">
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j} scope="col">
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
      // 页面 h1 是章节名（PageTitle），正文标题从 h2 开始
      const level = heading[1].length
      const Tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4'
      const index = level === 2 ? sectionIndex++ : undefined
      const title = <Tag id={index !== undefined ? `chapter-section-${index}` : undefined} className={`md-h md-h${level}`}>{renderInline(heading[2], nextKey())}</Tag>
      out.push(index !== undefined && onListenSection ? (
        <div key={nextKey()} className="book-section-heading-row">
          {title}
          <button type="button" className="book-section-listen" aria-label={`听本节：${heading[2]}`} onClick={() => onListenSection(index)}><Headphones size={15} aria-hidden="true" />听本节</button>
        </div>
      ) : <React.Fragment key={nextKey()}>{title}</React.Fragment>)
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

/* ---------- 页面 ---------- */

const STATUS_TONE: Record<string, string> = { done: 'is-done', draft: 'is-draft', pending: 'is-pending', note: 'is-pending' }

function StatusIcon({ status }: { status: string }): JSX.Element {
  if (status === 'pending') return <Circle size={16} className="book-status-icon is-pending" aria-hidden="true" />
  if (status === 'done') return <CheckCircle2 size={16} className="book-status-icon is-done" aria-hidden="true" />
  return <PenLine size={16} className="book-status-icon is-draft" aria-hidden="true" />
}

function ChapterRow({ no, title, status, file, showStatus = false }: { no?: string; title: string; status: string; file?: string; showStatus?: boolean }): JSX.Element {
  const inner = (
    <>
      {showStatus && <StatusIcon status={status} />}
      {no && <span className="book-row__no">{no}</span>}
      <span className="book-row__title">{title}</span>
      {showStatus && <span className={`book-row__status ${STATUS_TONE[status] ?? ''}`}>{STATUS_LABEL[status]}</span>}
      {file && <ArrowRight size={14} className="book-row__arrow" aria-hidden="true" />}
    </>
  )
  return file
    ? <Link to={`/first-book/read/${encodeURIComponent(file)}`} className="book-row">{inner}</Link>
    : <div className="book-row is-disabled" aria-disabled="true">{inner}</div>
}

const chapterHref = (file: string): string => `/first-book/read/${encodeURIComponent(file)}`
const knownBookFiles = new Set([...EXTRA_FILES, ...PARTS.flatMap(p => p.chapters), ...REVIEW_FILES].map(c => c.file))
const AUDIO_CHAPTERS = [EXTRA_FILES[0], ...PARTS.flatMap(p => p.chapters)]
const LAST_CHAPTER_KEY = 'mindful-book:last-chapter'
const FONT_SIZE_KEY = 'mindful-book:font-size'
const FONT_SIZES = [16, 18, 20, 22]

function safeDecode(file: string): string {
  try { return decodeURIComponent(file) } catch { return file }
}

function readPreference(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}

function savePreference(key: string, value: string): void {
  try { window.localStorage.setItem(key, value) } catch { /* 阅读不依赖存储可用 */ }
}

const READING_PATHS = [
  {
    id: 'simple', title: '省心起步', description: '先安排家庭的钱，再选择配置与产品。主动投资额度可以为零。',
    outcome: '留下资金表、产品核查和初步投资规则。',
    files: ['导读-把注意力还给生活.md', '第7章-配置优先.md', '专题-家庭财务底座.md', '专题-资产基础.md', '第18章-我的投资选择.md', '第8章-动态平衡.md', '第9章-参考方案.md', '第10章-标普500与纳指100落地.md', '专题-正念决策.md', '第37章-犯错与复盘.md'],
  },
  {
    id: 'research', title: '研究一家公司', description: '已有资金与风险边界后，把生意、财报、价格和决策连起来。',
    outcome: '完成一份可核查、可证伪的研究记录。结论可以是不买。',
    files: ['第19章-总纲.md', '第23章-能力圈与护城河.md', '第26章-公司.md', '第27章-财报.md', '第28章-估值.md', '专题-一家公司从研究到决定.md', '第36章-仓位与纪律.md', '第37章-犯错与复盘.md'],
  },
  {
    id: 'life', title: '遇到波动时', description: '已经开始投资，却在追涨、亏损或家庭用款面前难以决定。',
    outcome: '辨认感受与事实，重新检查风险和生活需要。',
    files: ['专题-正念决策.md', '第34章-怎么拿住.md', '第35章-什么时候卖.md', '附录H-家庭投资全过程.md', '专题-提款与生活.md', '第39章-给投资设边界.md', '第40章-回到生活.md'],
  },
]

function BookReviews(): JSX.Element {
  const location = useLocation()
  useEffect(() => {
    if (location.hash === '#book-comments') document.getElementById('book-comments')?.scrollIntoView?.({ block: 'start' })
  }, [location.hash])

  return <section id="book-comments" className="book-end-comments" aria-label="《正念投资》书评">
    <p>欢迎留下对《正念投资》的感受、问题或修改建议。</p>
    {import.meta.env.BASE_URL === '/' ? <ChapterComments slug="正念投资.md" title="全书书评" /> : <a className="book-secondary-link" href="https://business-web-black.vercel.app/first-book/slow-is-fast#book-comments">前往正式站查看和提交书评 <ArrowRight size={15} aria-hidden="true" /></a>}
  </section>
}

function BookDashboard(): JSX.Element {
  const audio = useBookAudio()
  const [pathId, setPathId] = useState('simple')
  const [query, setQuery] = useState('')
  const [lastFile] = useState(() => readPreference(LAST_CHAPTER_KEY))
  const bodyChapters = useMemo(() => [...EXTRA_FILES, ...PARTS.flatMap(p => p.chapters)], [])
  const lastChapter = bodyChapters.find(c => c.file === lastFile)
  const readingPath = READING_PATHS.find(path => path.id === pathId) ?? READING_PATHS[0]
  const search = query.trim().toLocaleLowerCase()
  const matches = (chapter: { no: string; title: string }): boolean => `${chapter.no} ${chapter.title}`.toLocaleLowerCase().includes(search)
  const visibleParts = PARTS.map(part => ({ ...part, chapters: part.chapters.filter(matches) })).filter(part => part.chapters.length)
  const extraChapters = EXTRA_FILES.filter(matches)
  const matchCount = extraChapters.length + visibleParts.reduce((count, part) => count + part.chapters.length, 0)

  return <>
    <Page className="book-page">
      <Link to="/first-book" className="book-back"><ArrowLeft size={15} aria-hidden="true" /> 返回我的书</Link>
      <section className="book-intro" aria-labelledby="book-title">
        <div className="book-cover" aria-hidden="true">
          <span className="book-cover__spine">普通人用规则代替盯盘的投资方法</span>
          <span className="book-cover__title">正念投资</span>
          <span className="book-cover__note">慢下来，看清楚。<br />让钱服务生活。</span>
          <span className="book-cover__ring" />
        </div>
        <div className="book-intro__copy">
          <p className="book-intro__edition">持续修订的在线书稿</p>
          <h1 id="book-title">正念投资</h1>
          <p className="book-intro__promise">把注意力还给生活，<br />把投资交给规则。</p>
          <p className="book-intro__description">从一张家庭资金表开始，学会配置、研究与复盘。在价格起伏中，保留自己的判断，也保留生活的余地。</p>
          <div className="book-intro__actions">
            <Link className="book-start" to={chapterHref(lastChapter?.file ?? '导读-把注意力还给生活.md')}>
              <BookOpen size={18} aria-hidden="true" />{lastChapter ? '继续阅读' : '开始阅读'}
            </Link>
            <button className="book-listen-button" type="button" disabled={!audio.supported} onClick={() => audio.listenBook()}><Headphones size={18} aria-hidden="true" />听全书</button>
            <a className="book-secondary-link" href="#book-contents">浏览全书目录 <ArrowRight size={15} aria-hidden="true" /></a>
          </div>
          {!audio.supported && <p className="book-audio-unavailable">当前浏览器不支持听书，可用新版 Chrome、Edge 或 Safari 打开。</p>}
          {lastChapter && <p className="book-resume">上次读到：{lastChapter.no} · {lastChapter.title}</p>}
          <p className="book-intro__meta">40章正文 · 5篇专题 · 9篇附录</p>
        </div>
      </section>

      <section className="book-paths" aria-labelledby="book-paths-title">
        <div className="book-section-heading">
          <h2 id="book-paths-title">从你眼前的问题开始</h2>
          <p>不必从第一页一路读完，先选一条适合现在的路。</p>
        </div>
        <div className="book-paths__choices" role="group" aria-label="选择阅读路线">
          {READING_PATHS.map(path => <button key={path.id} type="button" aria-pressed={path.id === pathId} onClick={() => setPathId(path.id)}>{path.title}</button>)}
        </div>
        <div className="book-paths__content" aria-live="polite">
          <p className="book-paths__description">{readingPath.description}</p>
          <ol className="book-paths__steps">
            {readingPath.files.map(file => {
              const chapter = bodyChapters.find(c => c.file === file)!
              return <li key={file}><Link to={chapterHref(file)}><span>{chapter.no}</span>{chapter.title}<ArrowRight size={14} aria-hidden="true" /></Link></li>
            })}
          </ol>
          <p className="book-paths__outcome">{readingPath.outcome}</p>
        </div>
      </section>

      <section id="book-contents" className="book-contents" aria-labelledby="book-contents-title">
        <div className="book-section-heading book-section-heading--search">
          <div><h2 id="book-contents-title">全书目录</h2><p>从生活出发，经由研究，再回到生活。</p></div>
          <div className="book-search">
            <Search size={17} aria-hidden="true" />
            <label className="visually-hidden" htmlFor="book-search">搜索章节</label>
            <input id="book-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索章节，如：估值" />
            {query && <button type="button" aria-label="清除章节搜索" onClick={() => setQuery('')}><X size={16} aria-hidden="true" /></button>}
          </div>
        </div>
        {search && <p className="book-search-result" role="status">找到 {matchCount} 篇{matchCount === 0 ? '，试试“配置”“财报”或“生活”。' : ''}</p>}
        {extraChapters.length > 0 && <div className="book-contents__opening">{extraChapters.map(ch => <ChapterRow key={ch.file} {...ch} />)}</div>}
        {visibleParts.map(part => (
          <section key={part.id} className="book-part" aria-labelledby={`part-${part.id}`}>
            <div className="book-part__heading"><h3 id={`part-${part.id}`} className="book-part__title">{part.title}</h3><p className="book-part__sub">{part.subtitle}</p></div>
            <div className="book-rows">{part.chapters.map(ch => <ChapterRow key={ch.file} {...ch} />)}</div>
          </section>
        ))}
      </section>

      <details className="book-review">
        <summary>写作与审校 <span>查看修订记录与资料核验</span></summary>
        <p className="book-part__sub">以下是过程文档。正文仍在修订，历史数据与待核事项以各篇说明为准。</p>
        <div className="book-rows">{REVIEW_FILES.map(f => <ChapterRow key={f.file} {...f} showStatus />)}</div>
      </details>
      <p className="book-disclaimer">本书用于投资方法学习与研究，不构成个人投资建议。</p>
    </Page>
    <BookReviews />
  </>
}

/** 章节阅读器 */
function ChapterReader({ file }: { file: string }): JSX.Element {
  const audio = useBookAudio()
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(readPreference(FONT_SIZE_KEY))
    return FONT_SIZES.includes(saved) ? saved : 18
  })
  const topRef = useRef<HTMLDivElement | null>(null)
  const shownFile = useRef(file)

  const allChapters = useMemo(
    () => [EXTRA_FILES[0], ...PARTS.flatMap(p => p.chapters)].filter(c => c.file),
    []
  )
  const decoded = safeDecode(file)
  const idx = allChapters.findIndex(c => c.file === decoded)
  const chapter = [...allChapters, ...EXTRA_FILES, ...REVIEW_FILES].find(c => c.file === decoded) ?? null
  const prev = idx > 0 ? allChapters[idx - 1] : null
  const next = idx >= 0 && idx < allChapters.length - 1 ? allChapters[idx + 1] : null
  usePageSeo(chapter ? `${chapter.title}｜《正念投资》${chapter.no}` : undefined, chapter ? `《正念投资》${chapter.no}：${chapter.title}。` : undefined)

  // 从目录切换章节后回到正文顶部；首次进入不滚动，保留浏览器的刷新恢复位置
  useEffect(() => {
    if (shownFile.current === file) return
    shownFile.current = file
    topRef.current?.scrollIntoView?.({ block: 'start' })
  }, [file])

  useEffect(() => {
    const controller = new AbortController()
    setContent(null)
    setError(false)
    if (!knownBookFiles.has(decoded)) {
      setError(true)
      return () => controller.abort()
    }
    fetch(`${import.meta.env.BASE_URL}first-book/${encodeURIComponent(decoded)}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error('not found')
        return r.text()
      })
      .then(text => {
        if (controller.signal.aborted) return
        setContent(text)
        if (allChapters.some(c => c.file === decoded)) savePreference(LAST_CHAPTER_KEY, decoded)
      })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [decoded, allChapters])

  const sections = useMemo(() => content?.split('\n').filter(line => /^##\s+/.test(line)).map(line => line.replace(/^##\s+/, '')) ?? [], [content])
  const changeFontSize = (amount: number): void => {
    const nextSize = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, FONT_SIZES.indexOf(fontSize) + amount))]
    setFontSize(nextSize)
    savePreference(FONT_SIZE_KEY, String(nextSize))
  }

  return (
    <main id="main-content" className="reader-layout book-reading-page">
      <PageTitle>{chapter ? chapter.title : '《正念投资》'}</PageTitle>
      <ChapterNav parts={PARTS} topLinks={EXTRA_FILES} currentFile={decoded} />
      <div className="reader-main">
        <div ref={topRef} className="reader-top" />
        <Link to="/first-book/slow-is-fast" className="book-back">
          <ArrowLeft size={15} aria-hidden="true" /> 返回全书目录
        </Link>

        <div className="book-reading-tools" aria-label="阅读设置">
          <span>{chapter?.no}{content ? ` · 约${Math.max(1, Math.ceil(content.replace(/\s/g, '').length / 450))}分钟` : ''}</span>
          <div className="book-font-controls">
            <button type="button" onClick={() => changeFontSize(-1)} disabled={fontSize === FONT_SIZES[0]} aria-label="缩小正文字号"><Minus size={16} aria-hidden="true" /></button>
            <output aria-live="polite" aria-label="正文字号">{fontSize}</output>
            <button type="button" onClick={() => changeFontSize(1)} disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]} aria-label="放大正文字号"><Plus size={16} aria-hidden="true" /></button>
          </div>
        </div>
        {chapter && <div className="book-listen-actions" role="group" aria-label="听书">
          <button className="book-listen-button" type="button" disabled={!audio.supported || !content} onClick={() => content && audio.listenChapter(chapter, content)}><Headphones size={17} aria-hidden="true" />听本章</button>
          {idx >= 0 && <button className="book-listen-continuous" type="button" disabled={!audio.supported || !content} onClick={() => content && audio.listenBook(decoded, content)}>从本章连续听 <ArrowRight size={14} aria-hidden="true" /></button>}
          {!audio.supported && <p className="book-audio-unavailable">当前浏览器不支持听书，可用新版 Chrome、Edge 或 Safari 打开。</p>}
        </div>}
        {sections.length > 0 && <details key={decoded} className="book-section-nav"><summary>本篇内容 <span>{sections.length}节</span></summary><nav aria-label="本篇内容"><ol>{sections.map((section, index) => <li key={index}><a href={`#chapter-section-${index}`}>{section}</a></li>)}</ol></nav></details>}
        <article className="ui-card book-reader" style={{ '--book-font-size': `${fontSize}px` } as React.CSSProperties}>
          {!content && !error && <p className="book-muted" role="status">加载中……</p>}
          {error && <p className="book-error" role="alert">章节文件未找到：{decoded}</p>}
          {content && renderMarkdown(content, audio.supported && chapter ? index => audio.listenSection(chapter, content, index) : undefined)}
        </article>

        <nav className="book-pager" aria-label="上一篇与下一篇">
          {prev ? (
            <Link to={`/first-book/read/${encodeURIComponent(prev.file)}`} className="ui-card book-pager__link">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>上一篇：{prev.title}</span>
            </Link>
          ) : (
            <div className="book-pager__spacer" />
          )}
          {next && (
            <Link to={`/first-book/read/${encodeURIComponent(next.file)}`} className="ui-card book-pager__link is-next">
              <span>下一篇：{next.title}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </nav>
      </div>
    </main>
  )
}

export default function FirstBook(): JSX.Element {
  const params = useParams<{ file?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  // Preserve previously published links to the former chapter-level review anchor.
  useEffect(() => {
    if (params.file && location.hash === '#book-comments') navigate('/first-book/slow-is-fast#book-comments', { replace: true })
  }, [params.file, location.hash, navigate])
  return <BookAudioProvider chapters={AUDIO_CHAPTERS}>{params.file ? <ChapterReader file={params.file} /> : <BookDashboard />}</BookAudioProvider>
}
