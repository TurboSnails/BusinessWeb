export interface NavItem {
  path: string
  label: string
}

export interface HubLink {
  path: string
  label: string
  desc: string
}

export interface HubGroup {
  id: string
  title: string
  hint?: string
  collapsed?: boolean
  links: HubLink[]
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '首页' },
  { path: '/invest', label: '正念投资' },
  { path: '/ai', label: 'AI 与独立开发' },
  { path: '/life', label: '自由生活实验' },
  { path: '/about', label: '关于' },
]

export const INVEST_GROUPS: HubGroup[] = [
  {
    id: 'read',
    title: '读这本书',
    links: [
      { path: '/first-book', label: '我的书', desc: '《正念投资：不盯盘、不预测的普通人投资方法》全文与目录' },
    ],
  },
  {
    id: 'method',
    title: '方法与框架',
    links: [
      { path: '/investment-strategy', label: '策略框架', desc: '综合投资策略框架' },
      { path: '/trading-philosophy', label: '道与术', desc: '交易哲学与方法' },
      { path: '/investment-plan-2026', label: '2026 投资计划', desc: '全年投资作战计划书' },
    ],
  },
  {
    id: 'tools',
    title: '工具',
    links: [
      { path: '/valuation', label: '公司估值', desc: '六方法三情景估值与报告导出' },
      { path: '/grid-trading', label: '网格交易', desc: 'ETF / 个股网格模拟、回测与记录' },
    ],
  },
  {
    id: 'research',
    title: '研究',
    links: [
      { path: '/research-notes', label: '研究笔记', desc: '公司研究笔记与候选池' },
      { path: '/industry-landscape', label: '产业格局', desc: '产业链与竞争格局' },
      { path: '/investment-targets', label: '美股投资', desc: '美股标的与观察' },
      { path: '/mainland-investment-targets', label: '大陆投资', desc: 'A 股标的与观察' },
      { path: '/pulse', label: '经济脉搏', desc: '宏观与市场指标' },
    ],
  },
  {
    id: 'watch',
    title: '盯盘观察（选看）',
    hint: '书里主张少看行情，这三页留作参考。',
    collapsed: false,
    links: [
      { path: '/monitor', label: '每日监控', desc: '每日行情监控' },
      { path: '/limit-up-analysis', label: '涨停分析', desc: '每日板块涨停' },
      { path: '/sector-rotation', label: '板块轮动', desc: '板块强弱与轮动' },
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
