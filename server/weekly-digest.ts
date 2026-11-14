// 每周变化摘要邮件：Vercel Cron（vercel.json，UTC 周一 00:00 = 北京周一 08:00–08:59）
// → /api/market-data/candidate-alerts-digest?weekly=1（与每日提醒同一路由、同一鉴权、同一 Gmail、同一去重表）
// → 读 Supabase 候选池快照 + 站点静态 JSON（信号台账、牛熊周期自动周报、宏观快照、自动 DCF、公司参考数据、财报前瞻）
// → 用站内同一份规则（src/features/weekly/weeklySummary.ts）生成上一个完整自然周的变化 → 发给本人。
//
// 不含 AI，只列可复核的事实，每条带日期和来源；没有变化时不发信。
// 「下周财报」只是背景信息：不计入标题项数，也不会让一封本来没有变化的邮件发出去。
// 去重：businessweb_candidate_alert_log 里写一行 fingerprint = weekly|YYYY-Www、kind = 'digest'（表的 kind 检查约束已允许 digest，
// 不需要新迁移；每日提醒用的是 digest|YYYY-MM-DD，前缀不同不会冲突）。同一周最多一封；发信失败会删掉这行，下次再发。
// ?weekly=1&dryRun=1：照常鉴权与生成，返回摘要 JSON，不发信、不写去重表。
import type { CronLog } from './functions/cron-auth.js'
import { codeKey, venueOf } from '../src/features/candidates/markets.js'
import { priceObservations, VENUE_CURRENCY, type PriceObservation } from '../src/features/candidates/priceAlert.js'
import { candidateKey, type CandidateItem, type CandidateMarket } from '../src/features/candidates/validation.js'
import { autoDcfKey, parseAutoSummary } from '../src/features/dcf/autoDcfSummary.js'
import {
  addDays, asCycleReport, asEarningsCalendar, asLedger, asMacro, beijingDay, buildWeeklySummary, companyIndexFrom, completedWeek, composeWeeklyEmail,
  ledgerYears, mergeLedgers, mergePriceHits, priceHitFromFingerprint, weeklyCount, weeklyPriceHits, type PriceHit,
} from '../src/features/weekly/weeklySummary.js'
import type { CompanyRef } from './candidate-alerts-digest.js'

type Env = Record<string, string | undefined>
interface Response { status(code: number): { json(body: unknown): unknown } }
/** 由每日提醒模块注入：避免两个模块互相 import */
export interface WeeklyRepository {
  snapshot(): Promise<CandidateItem[]>
  sent(fingerprints: string[]): Promise<Set<string>>
  claim(rows: { fingerprint: string; day: string; kind: string }[]): Promise<Set<string>>
  release(fingerprints: string[]): Promise<void>
  loggedFingerprints(kind: string, from: string, to: string): Promise<string[]>
}
export interface WeeklyDeps {
  env: Env
  now: () => Date
  log: CronLog
  site: string
  logTable: string
  fetchJson: (url: string) => Promise<unknown>
  /** Supabase 未配置时返回 null */
  repository: () => WeeklyRepository | null
  isLogMissing: (error: unknown) => boolean
  send: (message: { subject: string; text: string; html: string }) => Promise<void>
}

const MAIL_VARS = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'ALERT_EMAIL_TO']
export const weeklyKey = (weekId: string): string => `weekly|${weekId}`

export function createWeeklyDigest({ env, now, log, site, logTable, fetchJson, repository, isLogMissing, send }: WeeklyDeps) {
  /** 去重表不可用时，本实例已发过的周（附加保护，跨实例不共享） */
  let fallbackSentWeek: string | null = null

  return async function weeklyDigest(res: Response, dryRun: boolean): Promise<unknown> {
    const repo = repository()
    if (!repo) {
      log.error('[weekly-digest] SUPABASE_URL / SUPABASE_SECRET_KEY 未配置或无效')
      return res.status(503).json({ ok: false, weekly: true, error: '候选池云同步未配置（SUPABASE_URL / SUPABASE_SECRET_KEY）' })
    }
    const missingMail = MAIL_VARS.filter(k => !env[k])
    if (missingMail.length && !dryRun) {
      log.error(`[weekly-digest] 邮件环境变量未配置：${missingMail.join('、')}`)
      return res.status(503).json({ ok: false, weekly: true, error: `邮件未配置：${missingMail.join('、')}` })
    }

    const today = beijingDay(now())
    const week = completedWeek(now())
    const key = weeklyKey(week.id)
    const warnings: string[] = []

    // 去重：先查这一周是否已发过（试运行也查，便于确认迁移已执行）
    let sentLog: 'ok' | 'missing' | 'error' = 'ok'
    let alreadySent = false
    try { alreadySent = (await repo.sent([key])).has(key) } catch (error) { sentLog = isLogMissing(error) ? 'missing' : 'error' }
    if (sentLog === 'missing') log.warn(`[weekly-digest] 去重表 ${logTable} 不存在：请执行 supabase/migrations/202611140001_candidate_alert_log.sql；先按本实例保护发送`)
    if (sentLog === 'ok' && alreadySent && !dryRun) {
      log.info(`[weekly-digest] ${week.id} 已发过，跳过`)
      return res.status(200).json({ ok: true, weekly: true, week, sent: false, skipped: 'already-sent-this-week' })
    }

    const settled = async <T>(label: string, p: Promise<T>): Promise<T | null> => {
      try { return await p } catch { warnings.push(`${label}未能读取，相关部分未比较。`); return null }
    }
    const [candidates, autoBody, refsBody, cycleBody, macroBody, earningsBody, ...ledgerBodies] = await Promise.all([
      settled('云端候选池', repo.snapshot()),
      settled('自动 DCF 预填库', fetchJson(`${site}/data/dcf-auto.json`)),
      settled('公司参考数据', fetchJson(`${site}/data/company-refs.json`)),
      settled('牛熊周期自动周报', fetchJson(`${site}/data/market-cycle-report.json`)),
      settled('宏观快照', fetchJson(`${site}/data/macro-us.json`)),
      // 背景信息：读不到时只是少一节「下周财报」，不写进数据缺口说明
      fetchJson(`${site}/data/earnings-calendar.json`).catch(() => null),
      ...ledgerYears(week).map(y => settled(`信号台账 ${y}`, fetchJson(`${site}/data/signal-ledger-${y}.json`))),
    ])
    const auto = parseAutoSummary(autoBody) ?? new Map()
    const refsObj = (refsBody as { version?: number; items?: unknown } | null)
    const refs: Record<string, CompanyRef> = refsObj?.version === 1 && refsObj.items && typeof refsObj.items === 'object' && !Array.isArray(refsObj.items) ? refsObj.items as Record<string, CompanyRef> : {}
    const items = candidates ?? []

    // 本周触及条件价：当前收盘价观测（与每日提醒同一来源） + 本周每日提醒已发过的价位提醒
    const observations = new Map<string, PriceObservation[]>()
    for (const item of items) {
      if (!item.alert) continue
      const venue = venueOf(item.market)
      const ref = Object.hasOwn(refs, candidateKey(item)) ? refs[candidateKey(item)] : undefined
      observations.set(candidateKey(item), priceObservations({ venueCurrency: VENUE_CURRENCY[venue], autoDcf: auto.get(autoDcfKey(venue, codeKey(venue, item.code))), marketRefresh: ref?.q }))
    }
    let logged: PriceHit[] = []
    if (sentLog === 'ok' && items.some(i => i.alert)) {
      try {
        logged = (await repo.loggedFingerprints('price-hit', week.start, addDays(week.end, 1)))
          .map(priceHitFromFingerprint).filter((h): h is Omit<PriceHit, 'source'> => !!h && h.date >= week.start && h.date <= week.end)
          .map(h => ({ ...h, source: '候选池每日提醒（已发送）' }))
      } catch { warnings.push('每日提醒发送记录未能读取，本周触及条件价只按当前收盘价判断。') }
    }
    const companies = companyIndexFrom(Object.entries(refs).flatMap(([k, r]) => {
      const i = k.indexOf(':')
      return i > 0 && r?.n ? [{ market: k.slice(0, i) as CandidateMarket, code: k.slice(i + 1), name: r.n }] : []
    }))
    const summary = buildWeeklySummary({
      week, candidates: items, priceHits: mergePriceHits(weeklyPriceHits(items, observations, week), logged),
      ledger: mergeLedgers(...ledgerBodies.map(asLedger)), cycle: asCycleReport(cycleBody), macro: asMacro(macroBody), earnings: asEarningsCalendar(earningsBody), companies,
    })
    summary.notes.push(...warnings)
    const mail = summary.empty ? null : composeWeeklyEmail(summary, site)
    const info = { today, week, count: weeklyCount(summary), sections: summary.sections.map(s => ({ id: s.id, lines: s.lines.length, more: s.more ?? 0, ...(s.context ? { context: true } : {}) })), notes: summary.notes, sentLog }

    if (dryRun) {
      return res.status(200).json({ ok: true, weekly: true, dryRun: true, ...info, alreadySent, mailConfigured: !missingMail.length,
        wouldSend: !!mail && sentLog !== 'error' && !alreadySent && fallbackSentWeek !== week.id, summary, ...(mail ? { subject: mail.subject, text: mail.text } : {}) })
    }
    if (sentLog === 'error') {
      log.error('[weekly-digest] 去重表读取失败，本次不发送')
      return res.status(502).json({ ok: false, weekly: true, ...info, sent: false, error: '去重记录读取失败，本次不发送' })
    }
    if (!mail) {
      log.info(`[weekly-digest] ${week.id} 没有需要复核的变化，不发信`)
      return res.status(200).json({ ok: true, weekly: true, ...info, sent: false, skipped: 'no-changes' })
    }
    let claimed = false
    if (sentLog === 'ok') {
      try {
        claimed = (await repo.claim([{ fingerprint: key, day: today, kind: 'digest' }])).has(key)
      } catch {
        log.error('[weekly-digest] 去重表写入失败，本次不发送')
        return res.status(502).json({ ok: false, weekly: true, ...info, sent: false, error: '去重记录写入失败，本次不发送' })
      }
      if (!claimed) return res.status(200).json({ ok: true, weekly: true, ...info, sent: false, skipped: 'already-sent-this-week' })
    } else if (fallbackSentWeek === week.id) {
      return res.status(200).json({ ok: true, weekly: true, ...info, sent: false, skipped: 'already-sent-this-week' })
    }

    try {
      await send(mail)
    } catch (error) {
      const e = error as { code?: unknown; responseCode?: unknown }
      log.error(`[weekly-digest] 发信失败 code=${String(e?.code ?? 'unknown')} responseCode=${String(e?.responseCode ?? '-')}`)
      if (claimed) await repo.release([key]).catch(() => log.warn('[weekly-digest] 释放认领失败，本周不会重发'))
      return res.status(502).json({ ok: false, weekly: true, ...info, sent: false, error: e?.responseCode === 535 || e?.code === 'EAUTH' ? 'Gmail 登录失败：检查 GMAIL_USER 与应用专用密码' : '发信失败' })
    }
    if (sentLog !== 'ok') fallbackSentWeek = week.id
    log.info(`[weekly-digest] ${week.id} 已发送 ${info.count} 项`)
    return res.status(200).json({ ok: true, weekly: true, ...info, sent: true, subject: mail.subject })
  }
}
