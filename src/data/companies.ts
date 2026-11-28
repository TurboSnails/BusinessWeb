import { useCallback, useEffect, useState } from 'react'
import { loadCompanyValuations, type CompanyValuation } from '../features/company-valuation/model'
import { loadCompanyShard } from './companyShard'
// 数据来源：Notion「投资计划 / 标普500分类」及「沪深产业分类」下的公司研究页，汇总于 2026-09-29。
// 仅为个人研究笔记，情景价值与价位均为研究假设，不构成目标价或投资建议。

export type Market = 'us' | 'cn' | 'hk' | 'adr' | 'ndx'

export interface Company {
  valuation?: CompanyValuation
  marketRefresh?: { adapterVersion?: number; checkedAt: string; evidenceCheckedAt?: string; priceDate: string; price: number; currency?: string; source: string; originalAsOf: string; programmatic?: boolean; tradability?: 'unverified' | 'no-known-restriction'; quoteDateKind?: 'provider-label' | 'provider-market-time' }
  code: string
  name: string
  market: Market
  sector: string // 板块分组：us/adr/ndx 为 GICS 一级，cn 为中证一级，hk 为恒生行业（见 sectorTaxonomy.ts）
  batch: string // 研究批次
  theme?: string // cn 主题/来源标签（新能源汽车、AI 算力、高盛增持等），与中证一级 sector 分开
  region?: string // adr 地域/题材分组（海外龙头、中概、新兴市场平台、新上市/热门、美股本土成长）
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
// 只存完整结果（补全 JSON 有效）；部分结果不进此缓存
const genCache: Partial<Record<Market, Promise<Company[]>>> = {}
const resolved: Partial<Record<Market, Company[]>> = {}
const coreOf = (market: Market, codes?: readonly string[]) =>
  import('./companyCore').then(m => m.resolveMarket(market, codes ? { codes } : undefined))

// 估值表按市场只解析一次；详情/列表共享，避免重复 JSON.parse
const valuationCache: Partial<Record<Market, Promise<Map<string, CompanyValuation>>>> = {}
const valuationsOf = (market: Market): Promise<Map<string, CompanyValuation>> => {
  const cached = valuationCache[market]
  if (cached) return cached
  const p = loadCompanyValuations(market)
  valuationCache[market] = p
  const evict = () => { if (valuationCache[market] === p) delete valuationCache[market] }
  // 估值加载器在请求或校验失败时返回空表，后续访问仍可以重试。
  p.then(map => { if (!map.size) evict() }, evict)
  return p
}

// 加载失败（如分包下载中断）时清掉缓存，下次调用可以重试，而不是永远拿到同一个失败结果
function remember(cache: Partial<Record<Market, Promise<Company[]>>>, market: Market, p: Promise<Company[]>): Promise<Company[]> {
  cache[market] = p
  p.catch(() => { if (cache[market] === p) delete cache[market] })
  return p
}

// 只含手工研究页（不拉取程序化补全 JSON）；全量分册，供列表与其它入口
export const loadBaseCompanies = (market: Market): Promise<Company[]> =>
  baseCache[market] ?? remember(baseCache, market, coreOf(market).then(r => r.base))

/** 程序化补全层的加载状态：complete = 补全 JSON 有效（可能为空数组）；partial = 补全 JSON 失败，只含手工研究页 */
export interface CompaniesResult {
  list: Company[]
  partial: boolean
  /** partial 时的失败原因（HTTP 状态、非 JSON 等），供提示与排错 */
  error?: string
}

/** 纳指100 新增公司全部为手工研究页，没有 public/data/ndx.json，不请求（否则开发服务器返回应用壳 HTML） */
const HAS_GENERATED: Record<Market, boolean> = { us: true, cn: true, hk: true, adr: true, ndx: false }

export class CompanyDataError extends Error {}

/** 非 2xx、网络失败、HTML/无效 JSON、非数组都视为失败，不能当成「有效的空数组」 */
const fetchGenerated = async (market: Market): Promise<Company[]> => {
  if (!HAS_GENERATED[market]) return []
  let r: Response
  try {
    r = await fetch(`${import.meta.env.BASE_URL}data/${market}.json`)
  } catch (e) {
    throw new CompanyDataError(`网络失败：${e instanceof Error ? e.message : String(e)}`)
  }
  if (!r || !r.ok) throw new CompanyDataError(`HTTP ${r?.status ?? '未知'}`)
  let data: unknown
  try {
    data = await r.json()
  } catch {
    throw new CompanyDataError('返回内容不是有效 JSON')
  }
  if (!Array.isArray(data)) throw new CompanyDataError('返回内容不是公司数组')
  return data as Company[]
}

// 同一 SPA 中切换沪深详情和公司库时复用下载与解析，失败后允许重试。
let cnGenerated: Promise<Company[]> | undefined
const generatedOf = (market: Market): Promise<Company[]> => {
  if (market !== 'cn') return fetchGenerated(market)
  if (!cnGenerated) {
    const pending = fetchGenerated(market)
    cnGenerated = pending
    pending.catch(() => { if (cnGenerated === pending) cnGenerated = undefined })
  }
  return cnGenerated
}

const generatedResult = (market: Market) => generatedOf(market).then(
  list => ({ ok: true as const, list }),
  (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
)

// 进行中或已完整的结果；部分结果结算后立即移出，下次调用会重新请求补全 JSON
const resultCache: Partial<Record<Market, Promise<CompaniesResult>>> = {}
// 最近一次部分结果：仅用于重新挂载时先显示手工公司，不当作完整数据
const partialResolved: Partial<Record<Market, Company[]>> = {}

export const loadCompaniesResult = (market: Market): Promise<CompaniesResult> => {
  const cached = resultCache[market]
  if (cached) return cached
  const p: Promise<CompaniesResult> = Promise.all([coreOf(market), generatedResult(market), valuationsOf(market)]).then(([core, g, valuations]) => {
    const list = core.merge(g.ok ? g.list : []).map(c => ({ ...c, valuation: valuations.get(c.code) }))
    if (g.ok) {
      resolved[market] = list
      delete partialResolved[market]
      genCache[market] = Promise.resolve(list)
      return { list, partial: false }
    }
    partialResolved[market] = list
    return { list, partial: true, error: g.error }
  })
  resultCache[market] = p
  p.then(
    r => { if (r.partial && resultCache[market] === p) delete resultCache[market] },
    () => { if (resultCache[market] === p) delete resultCache[market] },
  )
  return p
}

/** 数组契约保持不变：补全 JSON 失败时返回手工公司（部分列表），但不缓存为完整结果 */
export const loadCompanies = (market: Market): Promise<Company[]> => genCache[market] ?? loadCompaniesResult(market).then(r => r.list)

export interface UseCompaniesState {
  list: Company[]
  loading: boolean
  /** 手工研究页分包也加载失败，列表为空 */
  failed: boolean
  /** 程序化补全数据暂不可用，list 只含手工研究页 */
  partial: boolean
  /** 同页重试（不刷新页面） */
  retry: () => void
}

export const useCompanies = (market: Market, enabled = true): UseCompaniesState =>
  useMarketCompanies(market, enabled)

export const useCompanyDetailCompanies = (market: Market, enabled: boolean, code?: string): UseCompaniesState =>
  useMarketCompanies(market, enabled, code)

function useMarketCompanies(market: Market, enabled: boolean, focusCode?: string): UseCompaniesState {
  const [list, setList] = useState<Company[]>(() => resolved[market] ?? (focusCode ? [] : partialResolved[market] ?? []))
  const [loading, setLoading] = useState(enabled && !resolved[market])
  const [failed, setFailed] = useState(false)
  const [partial, setPartial] = useState(() => !focusCode && !resolved[market] && !!partialResolved[market])
  const [attempt, setAttempt] = useState(0)
  const requestKey = focusCode ? `${market}:${focusCode}` : market
  const [activeKey, setActiveKey] = useState<string | undefined>(enabled ? requestKey : undefined)
  useEffect(() => {
    if (!enabled) { setActiveKey(undefined); return }
    let alive = true
    setActiveKey(requestKey)
    if (resolved[market]) { setList(resolved[market]!); setLoading(false); setFailed(false); setPartial(false); return }
    setLoading(true)
    setFailed(false)

    const commit = (result: CompaniesResult) => {
      if (!alive) return
      setList(result.list)
      setLoading(false)
      setPartial(result.partial)
    }
    const fail = () => { if (alive) { setLoading(false); setFailed(true) } }
    const loadFocusFallback = (code: string) => {
      // 先渲染正文，再补估值。窄分册的结果留在详情页，避免写入全市场缓存。
      Promise.all([coreOf(market, [code]), generatedResult(market)]).then(([core, g]) => {
        if (!alive) return
        const generated = g.ok ? g.list.find(company => company.code === code) : undefined
        const list = core.merge(generated ? [generated] : [])
        commit({ list, partial: !g.ok })
        if (!list.length) return
        valuationsOf(market).then(valuations => {
          commit({ list: list.map(company => ({ ...company, valuation: valuations.get(company.code) })), partial: !g.ok })
        }, fail)
      }).catch(fail)
    }
    if (focusCode) {
      setList([])
      setPartial(false)
      // 优先公司分片；不存在 / SPA HTML 回退 / 字段残缺时走全量
      loadCompanyShard(market, focusCode).then(shard => {
        if (!alive) return
        if (!shard) {
          loadFocusFallback(focusCode)
          return
        }
        coreOf(market, [focusCode]).then(core => {
          if (!alive) return
          const list = core.merge(shard.company ? [shard.company] : [])
          commit({ list, partial: false })
          if (!list.length || !shard.valuation) return
          // 分片已含估值：下一微任务再挂上，保留「正文先出」的提交节奏
          Promise.resolve().then(() => {
            if (!alive) return
            commit({
              list: list.map(company => (
                company.code === focusCode ? { ...company, valuation: shard.valuation } : company
              )),
              partial: false,
            })
          })
        }, fail)
      }, () => loadFocusFallback(focusCode))
    } else {
      loadCompaniesResult(market).then(commit, fail)
    }
    return () => { alive = false }
  }, [market, enabled, attempt, focusCode, requestKey])
  const retry = useCallback(() => setAttempt(a => a + 1), [])
  if (enabled && requestKey !== activeKey) return { list: [], loading: enabled, failed: false, partial: false, retry }
  return { list, loading, failed, partial, retry }
}

// ───────── 林奇分类 + 护城河证据（脚本按统一规则生成，public/data/lynch.json，键为 market:code）─────────
export interface LynchInfo {
  t: string // 林奇类型
  r: string // 同类内关注度：高/中/低/待定（待定 = PE 等估值输入缺失）
  pe?: number | null; g?: number | null; c?: number | null; rg?: number | null; peg?: number | null
  ph?: string | null; dy?: number | null; pb?: number | null
  v?: string; w: string[]; f: string[]
  classificationNote?: string | null // 规则重算时的变更说明
  m: { s: number; n: number; l: string; i: [string, boolean | null, string][] } | null
}
/** 林奇数据键：market:code；纳指页签手工新增的公司（market 为 ndx）为美股上市，回退查 us: / adr: 键 */
export const lynchKeysOf = (c: { market: Market; code: string }): string[] =>
  c.market === 'ndx' ? [`ndx:${c.code}`, `us:${c.code}`, `adr:${c.code}`] : [`${c.market}:${c.code}`]
export const lynchFor = (lynch: Record<string, LynchInfo>, c: { market: Market; code: string }): LynchInfo | undefined => {
  for (const key of lynchKeysOf(c)) if (lynch[key]) return lynch[key]
  return undefined
}
export type LynchLoadResult = { data: Record<string, LynchInfo>; ok: boolean }
let lynchCache: Promise<LynchLoadResult> | null = null
export const loadLynch = (): Promise<LynchLoadResult> => {
  if (!lynchCache) {
    lynchCache = fetch(`${import.meta.env.BASE_URL}data/lynch.json`)
      .then(async r => {
        if (!r.ok) return { data: {} as Record<string, LynchInfo>, ok: false }
        return { data: await r.json() as Record<string, LynchInfo>, ok: true }
      })
      .catch(() => ({ data: {} as Record<string, LynchInfo>, ok: false }))
  }
  return lynchCache
}
export type LynchState = { data: Record<string, LynchInfo>; loading: boolean; failed: boolean }
export const useLynch = (enabled = true): LynchState => {
  const [data, setData] = useState<Record<string, LynchInfo>>({})
  const [loading, setLoading] = useState(enabled)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    let alive = true
    setLoading(true)
    setFailed(false)
    loadLynch().then(result => {
      if (!alive) return
      setData(result.data)
      setFailed(!result.ok)
      setLoading(false)
    })
    return () => { alive = false }
  }, [enabled])
  return { data, loading, failed }
}

/** 详情页林奇：分片命中只用该公司；分片失败回退全量 lynch.json */
export const useCompanyDetailLynch = (market: Market, enabled: boolean, code?: string): LynchState => {
  const [data, setData] = useState<Record<string, LynchInfo>>({})
  const [loading, setLoading] = useState(enabled)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!enabled || !code) { setLoading(false); setData({}); setFailed(false); return }
    let alive = true
    setLoading(true)
    setFailed(false)
    const applyFull = () => loadLynch().then(result => {
      if (!alive) return
      setData(result.data)
      setFailed(!result.ok)
      setLoading(false)
    })
    loadCompanyShard(market, code).then(shard => {
      if (!alive) return
      if (!shard) return applyFull()
      // ndx 手工页林奇键常在 us:/adr:；分片无条目时回退全量
      if (!shard.lynch && market === 'ndx') return applyFull()
      const next: Record<string, LynchInfo> = {}
      if (shard.lynch) next[shard.lynchKey] = shard.lynch
      setData(next)
      setFailed(false)
      setLoading(false)
    }, () => applyFull())
    return () => { alive = false }
  }, [market, enabled, code])
  return { data, loading, failed }
}
