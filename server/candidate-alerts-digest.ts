// 候选池每日提醒邮件：Vercel Cron（vercel.json，UTC 23:00 周一至周五 = 北京 07:00–07:59 周二至周六）
// → /api/market-data/candidate-alerts-digest → 读 Supabase 里的候选池快照 + 站点自己的静态行情 JSON
// → 用站内同一份规则（src/features/candidates/alertRules.ts、priceAlert.ts）判断 → 去重 → 用 Gmail 发给本人。
//
// 只是「到了你设的价位，该复核一眼」，不是买卖指令。每天最多一封；同一事项（同一交易日的同一条件）只发一次。
// 去重记录在 Supabase 表 businessweb_candidate_alert_log（supabase/migrations/202611140001_candidate_alert_log.sql）。
// 表还没建时退回「当日保护」：只发最新收盘日触发的价位提醒和刚到期的复查，同一实例当天只发一次，并在日志里提示执行迁移。
//
// 环境变量（Production）：CRON_SECRET；SUPABASE_URL、SUPABASE_SECRET_KEY（与 api/candidates-sync.ts 相同）；
// GMAIL_USER、GMAIL_APP_PASSWORD、ALERT_EMAIL_TO。邮箱地址与密钥一律不写日志、不进响应。
// ?dryRun=1：照常鉴权与判断，返回邮件 JSON，不发信、不写去重表。
import { requireCron, type CronLog } from './functions/cron-auth.js'
import { itemAlerts, type CandidateAlert } from '../src/features/candidates/alertRules.js'
import { codeKey, MARKET_LABEL, venueOf } from '../src/features/candidates/markets.js'
import { priceObservations, tradingDaysBetween, VENUE_CURRENCY, type PriceInputs } from '../src/features/candidates/priceAlert.js'
import { candidateKey, validCandidatesPayload, type CandidateItem } from '../src/features/candidates/validation.js'
import { autoDcfKey, parseAutoSummary, type AutoDcf } from '../src/features/dcf/autoDcfSummary.js'

type Env = Record<string, string | undefined>
type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
export interface MailMessage { from: string; to: string; subject: string; text: string; html: string }
export interface MailTransport { sendMail(message: MailMessage): Promise<unknown>; close?(): void }
export type CreateTransport = (options: Record<string, unknown>) => MailTransport | Promise<MailTransport>
interface Request { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined> }
interface Response { setHeader(name: string, value: string): unknown; status(code: number): { json(body: unknown): unknown } }

export const SITE = 'https://business-web-black.vercel.app'
export const LOG_TABLE = 'businessweb_candidate_alert_log'
/** 邮件只列这三类：服务端看不到本机保存的 DCF，「进入买入区」「DCF 过期」只在站内显示 */
export const DIGEST_KINDS = ['price-hit', 'review', 'rating'] as const
type DigestKind = typeof DIGEST_KINDS[number]
const GROUP_TITLE: Record<DigestKind, string> = { 'price-hit': '触及条件价', review: '到期复查', rating: '评级变化' }
const FOOTER = '观察提醒，不是买卖指令；行情为收盘价，数据日期见各条。'
const TIMEOUT_MS = 8_000
const MAX_ITEMS = 50

/** 公司参考数据（scripts/build-company-index.mjs → public/data/company-refs.json） */
export interface CompanyRef { n: string; r?: string; q?: PriceInputs['marketRefresh'] }

export interface DigestItem {
  kind: DigestKind; market: CandidateItem['market']; code: string; name: string; text: string
  /** 去重键：同一键只发一次 */
  fingerprint: string
  /** 这条事项依据的数据日期（价位：收盘日；复查：检查日；评级：决策记录日） */
  dataDate: string
  companyUrl: string | null
  /** 此前没发过（或去重表不可用时按当日保护判断为新） */
  fresh: boolean
}

/** 北京时间的日期：站内按本地日期判断，用户在北京，这里保持一致 */
export const beijingDay = (now: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/** 上一次定时运行的北京日期（cron 在北京周二至周六早上运行） */
export function previousRunDay(today: string): string {
  let t = Date.parse(`${today}T00:00:00Z`)
  do t -= 86_400_000; while (![2, 3, 4, 5, 6].includes(new Date(t).getUTCDay()))
  return new Date(t).toISOString().slice(0, 10)
}

function fingerprintOf(a: CandidateAlert, item: CandidateItem): { fingerprint: string; dataDate: string } {
  const key = candidateKey(a)
  if (a.kind === 'price-hit' && a.price && a.rule) return { fingerprint: `price-hit|${key}|${a.price.date}|${a.rule.kind}|${a.rule.threshold}`, dataDate: a.price.date }
  if (a.kind === 'review') return { fingerprint: `review|${key}|${a.nextCheck}`, dataDate: a.nextCheck ?? '' }
  const at = item.decisions?.at(-1)?.at.slice(0, 10) ?? ''
  return { fingerprint: `rating|${key}|${a.rating?.before}>${a.rating?.after}|${at}`, dataDate: at }
}

/** 用站内同一份规则判断全部候选；返回邮件要列的事项（尚未去重） */
export function evaluateDigest(items: CandidateItem[], today: string, auto: Map<string, AutoDcf>, refs: Record<string, CompanyRef>, site = SITE): DigestItem[] {
  const out: DigestItem[] = []
  for (const item of items) {
    const venue = venueOf(item.market)
    const ref = Object.hasOwn(refs, candidateKey(item)) ? refs[candidateKey(item)] : undefined
    // 与站内一致：先自动 DCF 预填库收盘价，再公司页价格锚点；同日以前者为准
    const observations = item.alert ? priceObservations({ venueCurrency: VENUE_CURRENCY[venue], autoDcf: auto.get(autoDcfKey(venue, codeKey(venue, item.code))), marketRefresh: ref?.q }) : []
    for (const a of itemAlerts(item, { today, observations, rating: ref?.r })) {
      if (!(DIGEST_KINDS as readonly string[]).includes(a.kind)) continue
      out.push({
        kind: a.kind as DigestKind, market: a.market, code: a.code, name: ref?.n ?? '', text: a.text, ...fingerprintOf(a, item),
        companyUrl: ref ? `${site}/research-notes/${a.market}/${encodeURIComponent(a.code)}` : null, fresh: true,
      })
    }
  }
  return out
}

/** 去重表不可用时的当日保护：只留「新出现」的事项——最新收盘日触发的价位、上次运行之后才到期的复查；评级变化无法判断首次出现，不发 */
export function freshWithoutLog(item: DigestItem, today: string): boolean {
  if (item.kind === 'price-hit') return tradingDaysBetween(item.dataDate, today) <= 1
  if (item.kind === 'review') return item.dataDate > previousRunDay(today) && item.dataDate <= today
  return false
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const label = (i: DigestItem): string => `${i.name ? `${i.name}（` : ''}${i.code} · ${MARKET_LABEL[i.market]}${i.name ? '）' : ''}`

/** 邮件正文：纯文本 + 简单 HTML，按类别分组 */
export function composeDigest(items: DigestItem[], today: string, { pending = 0, warnings = [] as string[], site = SITE } = {}): { subject: string; text: string; html: string } {
  const candidatesUrl = `${site}/candidates`
  const groups = DIGEST_KINDS.map(kind => ({ kind, list: items.filter(i => i.kind === kind) })).filter(g => g.list.length)
  const subject = `候选池提醒 · ${today} · ${items.length} 项`
  const lead = `以下是候选池今天（北京时间 ${today}）新出现的事项，逐条复核即可。`
  const tail = [
    ...(pending > 0 ? [`另有 ${pending} 项此前已提醒、仍待处理，见候选池。`] : []),
    ...warnings,
  ]
  const text = [
    lead, '',
    ...groups.flatMap(g => [`【${GROUP_TITLE[g.kind]}】${g.list.length} 项`, ...g.list.flatMap(i => [`- ${label(i)}`, `  ${i.text}`, ...(i.companyUrl ? [`  公司页：${i.companyUrl}`] : [])]), '']),
    ...(tail.length ? [...tail, ''] : []),
    `打开候选池：${candidatesUrl}`, '', '—', FOOTER,
  ].join('\n')
  const html = `<!doctype html><html lang="zh-CN"><body style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.6;color:#1f2328;max-width:640px">
<p>${escapeHtml(lead)}</p>
${groups.map(g => `<h3 style="font-size:16px;margin:20px 0 8px">${escapeHtml(GROUP_TITLE[g.kind])} · ${g.list.length} 项</h3>
<ul style="padding-left:20px;margin:0">${g.list.map(i => `<li style="margin-bottom:10px"><strong>${escapeHtml(label(i))}</strong><br>${escapeHtml(i.text)}${i.companyUrl ? `<br><a href="${escapeHtml(i.companyUrl)}">公司页</a>` : ''}</li>`).join('')}</ul>`).join('\n')}
${tail.map(t => `<p style="color:#59636e">${escapeHtml(t)}</p>`).join('')}
<p><a href="${escapeHtml(candidatesUrl)}">打开候选池</a></p>
<hr style="border:none;border-top:1px solid #d1d9e0;margin:20px 0 8px"><p style="color:#59636e;font-size:13px">${escapeHtml(FOOTER)}</p>
</body></html>`
  return { subject, text, html }
}

// ── Supabase：候选池快照（只读）与去重记录 ──
interface Db { origin: string; headers: Record<string, string> }
export function supabaseConfig(env: Env): Db | null {
  const key = env.SUPABASE_SECRET_KEY
  try {
    const url = new URL(env.SUPABASE_URL ?? '')
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port || !key) return null
    const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' }
    if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`
    return { origin: url.origin, headers }
  } catch {
    return null
  }
}

class LogUnavailable extends Error {}
/** PostgREST 报「表不存在」：迁移还没执行 */
const missingTable = (status: number, body: unknown): boolean => {
  const code = (body as { code?: string } | null)?.code
  return status === 404 || code === '42P01' || code === 'PGRST205'
}
const inList = (values: string[]): string => `in.(${values.map(v => `"${v.replace(/["\\]/g, c => `\\${c}`)}"`).join(',')})`

function createRepository(db: Db, fetchImpl: FetchLike) {
  const call = async (path: string, init: Record<string, unknown> = {}): Promise<{ status: number; ok: boolean; body: unknown }> => {
    const r = await fetchImpl(`${db.origin}/rest/v1/${path}`, { ...init, headers: { ...db.headers, ...(init.headers as Record<string, string> | undefined) }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
    let body: unknown = null
    try { body = await r.json() } catch { /* 空响应 */ }
    return { status: r.status, ok: r.ok, body }
  }
  const logCall = async (path: string, init: Record<string, unknown> = {}): Promise<unknown> => {
    let r
    try { r = await call(path, init) } catch { throw new LogUnavailable('request') }
    if (!r.ok) throw new LogUnavailable(missingTable(r.status, r.body) ? 'missing' : `HTTP ${r.status}`)
    return r.body
  }
  return {
    async snapshot(): Promise<CandidateItem[]> {
      const r = await call('businessweb_candidates_snapshot?id=eq.1&select=payload')
      const row = Array.isArray(r.body) && r.body.length === 1 ? (r.body[0] as { payload?: unknown }) : null
      if (!r.ok || !row || !validCandidatesPayload(row.payload)) throw new Error(r.ok ? '云端候选池结构无效' : `HTTP ${r.status}`)
      return row.payload.items
    },
    /** 已发过的去重键 */
    async sent(fingerprints: string[]): Promise<Set<string>> {
      const out = new Set<string>()
      // 没有事项时也探测一次表是否存在，试运行能看出迁移有没有执行
      if (!fingerprints.length) await logCall(`${LOG_TABLE}?select=fingerprint&limit=1`)
      for (let i = 0; i < fingerprints.length; i += 40) {
        const chunk = fingerprints.slice(i, i + 40)
        const rows = await logCall(`${LOG_TABLE}?select=fingerprint&fingerprint=${encodeURIComponent(inList(chunk))}`)
        for (const row of Array.isArray(rows) ? rows : []) out.add(String((row as { fingerprint?: unknown }).fingerprint))
      }
      return out
    },
    /** 认领：插入去重键，返回本次真正插入的（已存在的被忽略），并发运行时只有一方拿到 */
    async claim(rows: { fingerprint: string; day: string; kind: string }[]): Promise<Set<string>> {
      const inserted = await logCall(`${LOG_TABLE}?on_conflict=fingerprint`, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows) })
      return new Set((Array.isArray(inserted) ? inserted : []).map(r => String((r as { fingerprint?: unknown }).fingerprint)))
    },
    async release(fingerprints: string[]): Promise<void> {
      if (!fingerprints.length) return
      await logCall(`${LOG_TABLE}?fingerprint=${encodeURIComponent(inList(fingerprints))}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    },
  }
}

async function fetchJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const r = await fetchImpl(url, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

/** 站点静态数据：自动 DCF 摘要（含收盘价与日期）与公司参考数据（名称、评级、价格锚点） */
async function loadPrices(fetchImpl: FetchLike, site: string): Promise<{ auto: Map<string, AutoDcf>; refs: Record<string, CompanyRef>; warnings: string[] }> {
  const [autoR, refsR] = await Promise.allSettled([fetchJson(fetchImpl, `${site}/data/dcf-auto.json`), fetchJson(fetchImpl, `${site}/data/company-refs.json`)])
  const auto = autoR.status === 'fulfilled' ? parseAutoSummary(autoR.value) : null
  const body = refsR.status === 'fulfilled' ? (refsR.value as { version?: number; items?: unknown }) : null
  const refs = body?.version === 1 && body.items && typeof body.items === 'object' && !Array.isArray(body.items) ? body.items as Record<string, CompanyRef> : null
  const warnings = !auto && !refs ? ['行情与公司参考数据都未能读取，本封没有判断价位提醒和评级变化。']
    : [...(auto ? [] : ['自动 DCF 预填库行情未能读取，本封只用公司页价格锚点判断价位。']), ...(refs ? [] : ['公司参考数据（价格锚点、评级）未能读取，本封未判断评级变化。'])]
  return { auto: auto ?? new Map(), refs: refs ?? {}, warnings }
}

const defaultTransport: CreateTransport = async options => {
  const { default: nodemailer } = await import('nodemailer')
  return nodemailer.createTransport(options)
}

export interface DigestDeps { fetchImpl?: FetchLike; env?: Env; now?: () => Date; log?: CronLog; createTransport?: CreateTransport }

export function createCandidateAlertsDigest({ fetchImpl = globalThis.fetch as unknown as FetchLike, env = process.env, now = () => new Date(), log = console, createTransport = defaultTransport }: DigestDeps = {}) {
  /** 去重表不可用时，本实例当天已发过的北京日期（只是附加保护，跨实例不共享） */
  let fallbackSentDay: string | null = null

  return async function candidateAlertsDigest(req: Request, res: Response): Promise<unknown> {
    if (!requireCron(req, res, { env, log, tag: 'candidate-alerts' })) return
    const dryRun = ['1', 'true'].includes(String(req.query?.dryRun ?? ''))
    const db = supabaseConfig(env)
    if (!db) {
      log.error('[candidate-alerts] SUPABASE_URL / SUPABASE_SECRET_KEY 未配置或无效')
      return res.status(503).json({ ok: false, error: '候选池云同步未配置（SUPABASE_URL / SUPABASE_SECRET_KEY）' })
    }
    const missingMail = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'ALERT_EMAIL_TO'].filter(k => !env[k])
    if (missingMail.length && !dryRun) {
      log.error(`[candidate-alerts] 邮件环境变量未配置：${missingMail.join('、')}`)
      return res.status(503).json({ ok: false, error: `邮件未配置：${missingMail.join('、')}` })
    }

    const today = beijingDay(now())
    const site = SITE
    const repo = createRepository(db, fetchImpl)
    let candidates: CandidateItem[]
    let prices: Awaited<ReturnType<typeof loadPrices>>
    try {
      ;[candidates, prices] = await Promise.all([repo.snapshot(), loadPrices(fetchImpl, site)])
    } catch (error) {
      log.error(`[candidate-alerts] 读取候选池失败：${error instanceof Error && error.name !== 'TimeoutError' ? error.message : '超时'}`)
      return res.status(502).json({ ok: false, error: '读取候选池失败，请检查 Supabase 配置与迁移' })
    }

    const all = evaluateDigest(candidates, today, prices.auto, prices.refs, site)
    let sentLog: 'ok' | 'missing' | 'error' = 'ok'
    let sent = new Set<string>()
    try { sent = await repo.sent(all.map(i => i.fingerprint)) } catch (error) { sentLog = error instanceof LogUnavailable && error.message === 'missing' ? 'missing' : 'error' }
    if (sentLog === 'missing') log.warn(`[candidate-alerts] 去重表 ${LOG_TABLE} 不存在：请在 Supabase SQL Editor 执行 supabase/migrations/202611140001_candidate_alert_log.sql；先按当日保护发送`)
    for (const item of all) item.fresh = sentLog === 'ok' ? !sent.has(item.fingerprint) : freshWithoutLog(item, today)
    const fresh = all.filter(i => i.fresh).slice(0, MAX_ITEMS)
    const pending = all.length - all.filter(i => i.fresh).length
    const mail = fresh.length ? composeDigest(fresh, today, { pending, warnings: prices.warnings, site }) : null
    const summary = { today, total: all.length, fresh: fresh.length, pending, sentLog, warnings: prices.warnings }

    if (dryRun) {
      return res.status(200).json({ ok: true, dryRun: true, ...summary, mailConfigured: !missingMail.length, wouldSend: !!mail && sentLog !== 'error' && fallbackSentDay !== today, items: all, ...(mail ? { subject: mail.subject, text: mail.text } : {}) })
    }
    if (sentLog === 'error') {
      // 去重表暂时读不到（不是没建）：宁可今天不发，也不重复发
      log.error('[candidate-alerts] 去重表读取失败，本次不发送')
      return res.status(502).json({ ok: false, ...summary, sent: false, error: '去重记录读取失败，本次不发送' })
    }
    if (!mail) {
      log.info(`[candidate-alerts] ${today} 没有新事项（共 ${all.length} 项均已提醒过）`)
      return res.status(200).json({ ok: true, ...summary, sent: false, skipped: 'nothing-new' })
    }

    // 认领：先写去重键（含当日一封的键），并发或重复调用时只有一方能发
    let claimed: string[] = []
    let toSend = fresh
    if (sentLog === 'ok') {
      const dayKey = `digest|${today}`
      let inserted: Set<string>
      try {
        inserted = await repo.claim([{ fingerprint: dayKey, day: today, kind: 'digest' }, ...fresh.map(i => ({ fingerprint: i.fingerprint, day: today, kind: i.kind }))])
      } catch {
        log.error('[candidate-alerts] 去重表写入失败，本次不发送')
        return res.status(502).json({ ok: false, ...summary, sent: false, error: '去重记录写入失败，本次不发送' })
      }
      claimed = [...inserted]
      toSend = fresh.filter(i => inserted.has(i.fingerprint))
      if (!inserted.has(dayKey) || !toSend.length) {
        await repo.release(claimed).catch(() => log.warn('[candidate-alerts] 释放认领失败'))
        const skipped = !inserted.has(dayKey) ? 'already-sent-today' : 'nothing-new'
        log.info(`[candidate-alerts] ${today} 跳过：${skipped}`)
        return res.status(200).json({ ok: true, ...summary, sent: false, skipped })
      }
    } else if (fallbackSentDay === today) {
      return res.status(200).json({ ok: true, ...summary, sent: false, skipped: 'already-sent-today' })
    }

    const message = toSend.length === fresh.length ? mail : composeDigest(toSend, today, { pending, warnings: prices.warnings, site })
    let transport: MailTransport | undefined
    try {
      transport = await createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      })
      await transport.sendMail({ from: `"候选池提醒" <${env.GMAIL_USER}>`, to: env.ALERT_EMAIL_TO as string, subject: message.subject, text: message.text, html: message.html })
    } catch (error) {
      // 只记录错误代码：SMTP 报错文本可能含邮箱地址
      const e = error as { code?: unknown; responseCode?: unknown }
      log.error(`[candidate-alerts] 发信失败 code=${String(e?.code ?? 'unknown')} responseCode=${String(e?.responseCode ?? '-')}`)
      if (claimed.length) await repo.release(claimed).catch(() => log.warn('[candidate-alerts] 释放认领失败，相关事项明天不会重发'))
      return res.status(502).json({ ok: false, ...summary, sent: false, error: e?.responseCode === 535 || e?.code === 'EAUTH' ? 'Gmail 登录失败：检查 GMAIL_USER 与应用专用密码' : '发信失败' })
    } finally {
      transport?.close?.()
    }
    if (sentLog !== 'ok') fallbackSentDay = today
    log.info(`[candidate-alerts] ${today} 已发送 ${toSend.length} 项`)
    return res.status(200).json({ ok: true, ...summary, sent: true, count: toSend.length, subject: message.subject })
  }
}

export default createCandidateAlertsDigest()
