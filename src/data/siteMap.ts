import { LAB_DIRECTIONS } from './aiLab'

export interface NavItem {
  path: string
  label: string
}

export interface HubLink {
  path: string
  label: string
  desc: string
  /** 栏目页卡片上的短说明（14 字以内）；完整说明 desc 用于搜索与工作台 */
  short?: string
  /** 已舍弃的页面：保留可访问，子页面顶部显示这条说明 */
  archived?: string
}

export interface HubGroup {
  id: string
  step?: string
  title: string
  hint?: string
  collapsed?: boolean
  links: HubLink[]
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '首页' },
  { path: '/invest', label: '投资' },
  { path: '/ai', label: 'AI实验室' },
  { path: '/knowledge', label: '知识图谱' },
  { path: '/life', label: '自由空间' },
  { path: '/about', label: '关于' },
]

// 按「我要做什么」分组：读书横幅在最上，日常用的研究与工具在前，行情只作参考，已舍弃折叠在最后。
// 分组同时决定子页面顶部的「同组切换条」，同一组只放同一件事。
export const INVEST_GROUPS: HubGroup[] = [
  {
    id: 'read',
    title: '读这本书',
    hint: '推荐顺序：读书 → 定规则 → 选标的 → 用工具',
    links: [
      { path: '/first-book', label: '我的书', desc: '《正念投资：普通人用规则代替盯盘的投资方法》全文与目录' },
    ],
  },
  {
    id: 'research',
    title: '研究标的',
    hint: '观察池按书第32、36章自己建，10到20家，每家一份决策记录。',
    links: [
      { path: '/research-notes', label: '公司研究', short: '四个市场的公司库与候选池', desc: '四个市场的公司库、候选池与研究方法' },
      { path: '/industry-landscape', label: '产业格局', short: '按行业看龙头与格局', desc: '固态电池、半导体、AI算力、AI应用、机器人、军工、新能源车、光伏储能、核电电网、创新药、低空与商业航天、消费电子、白酒、银行、新材料、前沿科技，和一页纸主题研究卡' },
      { path: '/future-trends', label: '未来趋势', short: '按赛道看产业链', desc: 'AI、智驾、机器人、创新药、航空航天、新能源等赛道的产业链与中美参与公司' },
      { path: '/invest/national-team', label: '国家队持仓', short: '汇金证金社保持仓变化', desc: '汇金、证金、社保等持有哪些 A 股：按机构、行业、个股看持仓与季度变化' },
      { path: '/invest/etf', label: 'ETF 流派地图', short: '各类 ETF 与主要风险', desc: '宽基、因子、主题、债券、商品等流派的主要 ETF 与风险' },
    ],
  },
  {
    id: 'tools',
    title: '估值与交易',
    hint: '估值定价格，网格管节奏。',
    links: [
      { path: '/valuation', label: '公司估值', short: '多方法三情景估值', desc: '六方法三情景估值与报告导出' },
      { path: '/dcf', label: '现金流折现 DCF', short: '现金流折现与安全边际', desc: 'WACC + 五年现金流折现估值与安全边际，可保存记录' },
      { path: '/grid-trading', label: '网格交易', short: '网格模拟、回测与记录', desc: 'ETF / 个股网格模拟、回测与记录' },
    ],
  },
  {
    id: 'method',
    title: '计划与周期',
    hint: '今年怎么投写成计划；宏观温度判断所处阶段。',
    links: [
      { path: '/investment-plan-2026', label: '2026 投资计划', short: '三笔钱、再平衡与红线', desc: '三笔钱、再平衡、红线与回撤补仓' },
      { path: '/monitor', label: '宏观温度', short: '经济温度与周期阶段', desc: '中美经济温度、周期阶段与对应动作' },
    ],
  },
  {
    id: 'watch',
    title: '行情（少看）',
    hint: '书里主张少看行情，这几页只作参考。',
    collapsed: false,
    links: [
      { path: '/pulse', label: '全球行情', desc: '全球指数、商品外汇与 A 股涨跌停' },
      { path: '/sector-rotation', label: '板块轮动', desc: '板块强弱与轮动' },
      { path: '/limit-up-analysis', label: '涨停分析', desc: '每日板块涨停' },
    ],
  },
  {
    id: 'related',
    title: '相关',
    links: [
      { path: '/invest/ai-tools', label: 'AI 投研 Skills', desc: '开发协作、投资分析、视频创作与小说写作 Skills 的介绍和下载包' },
    ],
  },
  {
    id: 'archived',
    title: '已舍弃',
    hint: '和书里的方法不一致，不再更新，只留存档。',
    collapsed: true,
    links: [
      { path: '/trading-philosophy', label: '道与术（短线策略）', desc: '早期短线交易体系', archived: '已舍弃：这是早期的短线交易体系，需要盯盘，和书里「不盯盘、不预测」的方法相反，仅留存档。' },
      { path: '/investment-strategy', label: '综合投资策略框架', desc: '巴菲特 · 邓普顿 · 双阶段轮动', archived: '已舍弃：这套框架已不再使用，方法以书和 2026 投资计划为准，仅留存档。' },
      { path: '/mainland-investment-targets', label: 'A 股观察池（AI 扩散）', desc: '2026 年 1 月的 AI 主题标的清单', archived: '已舍弃：这是 2026 年 1 月按 AI 主题整理的具体标的清单，含“立即配置”“回调加仓”等买卖建议和未注明来源的预测数字，与书里“不荐股、无来源的数字不写”相悖，内容已过期，仅留存档，不构成投资建议。观察池请按书第32、36章自己建立。' },
      { path: '/investment-targets', label: '美股观察池', desc: '未完成的占位页', archived: '已舍弃：这一页从未完成。观察池请按书第32、36章自己建立：10到20家，每家一份统一决策记录（37.4）。' },
    ],
  },
]

const ALL_LINKS: Array<{ group: HubGroup; link: HubLink }> = INVEST_GROUPS.flatMap(group =>
  group.links.map(link => ({ group, link }))
)

function matchesPath(base: string, pathname: string): boolean {
  return pathname === base || pathname.startsWith(base + '/')
}

export function findInvestEntry(pathname: string): { group: HubGroup; link: HubLink } | null {
  let best: { group: HubGroup; link: HubLink } | null = null
  for (const entry of ALL_LINKS) {
    if (!matchesPath(entry.link.path, pathname)) continue
    if (!best || entry.link.path.length > best.link.path.length) best = entry
  }
  return best
}

export function isNavActive(itemPath: string, pathname: string): boolean {
  if (itemPath === '/') return pathname === '/'
  if (itemPath === '/invest') {
    return matchesPath('/invest', pathname) || findInvestEntry(pathname) !== null
  }
  return matchesPath(itemPath, pathname)
}

export interface SearchablePage {
  path: string
  label: string
  group: string
  desc?: string
  archived?: boolean
}

export interface WorkbenchTool {
  path: string
  label: string
  desc: string
}

// 不在导航和投资分组里、但有固定路径的页面
const EXTRA_PAGES: SearchablePage[] = [
  { path: '/first-book/slow-is-fast', label: '书的目录', group: '投资 · 读这本书', desc: '《正念投资》目录与章节' },
  { path: '/grid-trading/records', label: '网格记录', group: '投资 · 用工具执行', desc: '已保存的网格模拟与回测记录' },
  { path: '/ai/fullstack-roadmap', label: '全栈学习路线', group: 'AI实验室', desc: 'AI 全栈开发学习计划' },
  { path: '/ai/dev-team', label: 'dev-team 使用说明', group: 'AI实验室', desc: 'Orca 开发团队的安装、自检、配置、派工与验证范围' },
]

/** 跳转面板与最近访问共用的页面注册表，由导航、投资分组和 AI 方向拼出，不另外手写 */
export const SEARCHABLE_PAGES: SearchablePage[] = [
  ...NAV_ITEMS.map(i => ({ path: i.path, label: i.label, group: '栏目' })),
  ...INVEST_GROUPS.flatMap(g =>
    g.links.map(l => ({
      path: l.path,
      label: l.label,
      group: `投资 · ${g.title}`,
      desc: l.desc,
      ...(l.archived ? { archived: true } : {}),
    }))
  ),
  ...EXTRA_PAGES,
  ...LAB_DIRECTIONS.map(d => ({ path: `/ai/${d.slug}`, label: d.title, group: 'AI实验室 · 方向', desc: d.reason })),
]

export function findSearchablePage(pathname: string): SearchablePage | null {
  return SEARCHABLE_PAGES.find(p => p.path === pathname) ?? null
}

const descOf = (path: string): string => findSearchablePage(path)?.desc ?? ''

export const WORKBENCH_TOOLS: WorkbenchTool[] = [
  { path: '/research-notes', label: '公司研究', desc: descOf('/research-notes') },
  { path: '/valuation', label: '公司估值', desc: descOf('/valuation') },
  { path: '/dcf', label: 'DCF', desc: descOf('/dcf') },
  { path: '/grid-trading', label: '网格交易', desc: descOf('/grid-trading') },
  { path: '/monitor', label: '宏观温度', desc: descOf('/monitor') },
  { path: '/invest/national-team', label: '国家队持仓', desc: descOf('/invest/national-team') },
  { path: '/knowledge', label: '知识图谱', desc: '个人知识库与笔记关系图' },
  { path: '/first-book', label: '我的书', desc: descOf('/first-book') },
]

/** 关键词按空格切开，每个词都要命中；label 开头 > label 包含 > 其他字段；已舍弃永远最后 */
export function searchPages(query: string, pages: SearchablePage[] = SEARCHABLE_PAGES): SearchablePage[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const first = terms[0]
  const scored = pages.flatMap((page, index) => {
    const label = page.label.toLowerCase()
    const haystack = [page.label, page.group, page.desc ?? '', page.path].join(' ').toLowerCase()
    if (!terms.every(t => haystack.includes(t))) return []
    const rank = !first ? 0 : label.startsWith(first) ? 0 : label.includes(first) ? 1 : 2
    return [{ page, index, rank: rank + (page.archived ? 10 : 0) }]
  })
  return scored.sort((a, b) => a.rank - b.rank || a.index - b.index).map(s => s.page)
}
