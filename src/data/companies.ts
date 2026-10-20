import { useEffect, useState } from 'react'
// 数据来源：Notion「投资计划 / 标普500分类」及「沪深产业分类」下的公司研究页，汇总于 2026-09-29。
// 仅为个人研究笔记，情景价值与价位均为研究假设，不构成目标价或投资建议。

export type Market = 'us' | 'cn' | 'hk' | 'adr' | 'ndx'

export interface Company {
  marketRefresh?: { adapterVersion?: number; checkedAt: string; evidenceCheckedAt?: string; priceDate: string; price: number; source: string; originalAsOf: string; programmatic?: boolean; tradability?: 'unverified' | 'no-known-restriction'; quoteDateKind?: 'provider-label' | 'provider-market-time' }
  code: string
  name: string
  market: Market
  sector: string // 板块分组
  batch: string // 研究批次
  rating: string // 条件化评级
  headline: string // 一句话结论
  metrics: [string, string][] // 关键指标
  thesis: string[] // 核心逻辑
  risk: string[] // 风险 / 证伪
  next: string[] // 后续验证 / 操作参考
  asOf: string // 数据时点与口径
  url?: string // Notion 原页
  // ── 以下为“最终返回标准”的扩展字段，逐步补全（缺则详情页显示“待补充”） ──
  certainty?: string // 确定性：高/中/低 + 依据
  duration?: string // 增长可持续期限
  moat?: string[] // 护城河
  growth?: string[] // 增长来源拆解
  scenarios?: { name: string; prob?: string; assumption: string; multiple?: string; price: string; change: string; trigger: string }[]
  ratioNote?: string // 盈亏比推导与概率说明
  discipline?: { zone?: string; add?: string; trim?: string; invalid?: string; position?: string }
  bullBear?: { bull: string; bear: string; verdict: string } // 整理自研究页，非独立对抗检验
  pitfalls?: string[] // 口径与陷阱、[MISSING] 清单
  calendar?: string[] // 后续验证日历
  aiNote?: string // AI 是否为可量化变量
  profile?: string // 公司简介
  segments?: { name: string; share?: string; note?: string }[] // 业务分布
  pros?: string[] // 优势
  cons?: string[] // 缺点
  industry?: string[] // 行业趋势
  auto?: boolean // 程序化研究页：数值部分由脚本按统一规则计算，定性部分为简述
  reviewed?: boolean // 程序化页经人工用最新公告复核过（见指标表「人工复核」行）
  researchReport?: string // 当前复核报告，相对站点根路径
}


export const sectorsOf = (list: Company[]): string[] => Array.from(new Set(list.map(c => c.sector)))

// ───────── 公司数据全部按市场懒加载：手工研究页在 companyCore（独立 chunk），
// 程序化补全公司（标普500 / 沪深500 成分股等）在 public/data/{market}.json ─────────
const baseCache: Partial<Record<Market, Promise<Company[]>>> = {}
const genCache: Partial<Record<Market, Promise<Company[]>>> = {}
const resolved: Partial<Record<Market, Company[]>> = {}
const coreOf = (market: Market) => import('./companyCore').then(m => m.resolveMarket(market))

// 加载失败（如分包下载中断）时清掉缓存，下次调用可以重试，而不是永远拿到同一个失败结果
function remember(cache: Partial<Record<Market, Promise<Company[]>>>, market: Market, p: Promise<Company[]>): Promise<Company[]> {
  cache[market] = p
  p.catch(() => { if (cache[market] === p) delete cache[market] })
  return p
}

// 只含手工研究页（不拉取程序化补全 JSON）
export const loadBaseCompanies = (market: Market): Promise<Company[]> =>
  baseCache[market] ?? remember(baseCache, market, coreOf(market).then(r => r.base))

export const loadCompanies = (market: Market): Promise<Company[]> => {
  const cached = genCache[market]
  if (cached) return cached
  const gen = fetch(`${import.meta.env.BASE_URL}data/${market}.json`)
    .then(r => (r.ok ? (r.json() as Promise<Company[]>) : []))
    .catch(() => [] as Company[])
  return remember(genCache, market, Promise.all([coreOf(market), gen]).then(([core, g]) => (resolved[market] = core.merge(g))))
}

export const useCompanies = (market: Market, enabled = true): { list: Company[]; loading: boolean; failed: boolean } => {
  const [list, setList] = useState<Company[]>(() => resolved[market] ?? [])
  const [loading, setLoading] = useState(enabled && !resolved[market])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    if (resolved[market]) { setList(resolved[market]!); setLoading(false); setFailed(false); return }
    setLoading(true)
    loadCompanies(market).then(
      l => { if (alive) { setList(l); setLoading(false); setFailed(false) } },
      () => { if (alive) { setLoading(false); setFailed(true) } },
    )
    return () => { alive = false }
  }, [market, enabled])
  return { list, loading, failed }
}

// ───────── 林奇分类 + 护城河证据（脚本按统一规则生成，public/data/lynch.json，键为 market:code）─────────
export interface LynchInfo {
  t: string // 林奇类型
  r: string // 同类内关注度：高/中/低
  pe?: number | null; g?: number | null; c?: number | null; rg?: number | null; peg?: number | null
  ph?: string | null; dy?: number | null; pb?: number | null
  v?: string; w: string[]; f: string[]
  m: { s: number; n: number; l: string; i: [string, boolean | null, string][] } | null
}
let lynchCache: Promise<Record<string, LynchInfo>> | null = null
export const loadLynch = (): Promise<Record<string, LynchInfo>> => {
  if (!lynchCache) {
    lynchCache = fetch(`${import.meta.env.BASE_URL}data/lynch.json`)
      .then(r => (r.ok ? (r.json() as Promise<Record<string, LynchInfo>>) : {}))
      .catch(() => ({} as Record<string, LynchInfo>))
  }
  return lynchCache
}
export const useLynch = (enabled = true): Record<string, LynchInfo> => {
  const [data, setData] = useState<Record<string, LynchInfo>>({})
  useEffect(() => {
    if (!enabled) return
    let alive = true
    loadLynch().then(d => { if (alive) setData(d) })
    return () => { alive = false }
  }, [enabled])
  return data
}
