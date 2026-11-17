// ETF 择时每日观察邮件：Vercel Cron（vercel.json，UTC 周一至周五 23 点 = 北京周二至周六 07:00–07:59，开盘前）
// → /api/market-data/candidate-alerts-digest?timing=1（与候选池每日提醒同一路由、同一鉴权、同一 Gmail、同一去重表）
// → 读站点 /data/etf-timing.json（etf-timing-shadow.yml 工作日收盘后生成）→ src/features/etf-timing/digest.ts 判断 → 发给本人。
//
// 只在有新信号或择时状态翻转时发；快照不是前一个工作日的（节假日、采集失败）不发。规则仍在验证，邮件写明不是买卖指令。
// 快照连续 2 个工作日以上没更新时，改发一封断更提醒（同一快照日期只提醒一次）。
// 去重：businessweb_candidate_alert_log 写一行 fingerprint = timing|<数据日期>（断更提醒为 timing-stale|<数据日期>）、
// kind = 'digest'（kind 约束已允许，无需迁移）。
// ?timing=1&dryRun=1：照常鉴权与判断，返回邮件 JSON，不发信、不写去重表。
import type { CronLog } from './functions/cron-auth.js'
import { asEtfTiming } from '../src/features/etf-timing/model.js'
import { buildTimingDigest, composeTimingEmail, staleTimingAlert } from '../src/features/etf-timing/digest.js'
import { beijingDay } from '../src/features/weekly/weeklySummary.js'
import type { WeeklyRepository } from './weekly-digest.js'

type Env = Record<string, string | undefined>
interface Response { status(code: number): { json(body: unknown): unknown } }
export interface TimingDeps {
  env: Env
  now: () => Date
  log: CronLog
  site: string
  logTable: string
  fetchJson: (url: string) => Promise<unknown>
  repository: () => Pick<WeeklyRepository, 'sent' | 'claim' | 'release'> | null
  isLogMissing: (error: unknown) => boolean
  send: (message: { subject: string; text: string; html: string }) => Promise<void>
}

const MAIL_VARS = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'ALERT_EMAIL_TO']

export function createTimingDigest({ env, now, log, site, logTable, fetchJson, repository, isLogMissing, send }: TimingDeps) {
  /** 去重表不可用时，本实例已发过的去重键（附加保护，跨实例不共享） */
  const fallbackSent = new Set<string>()

  type Mail = { subject: string; text: string; html: string }
  /** 按 key 去重后发信：读去重表 → 认领 → 发送（失败释放认领）。去重表不存在时退回本实例保护。 */
  async function deliver(res: Response, repo: Pick<WeeklyRepository, 'sent' | 'claim' | 'release'>, key: string, today: string, mail: Mail | null, info: Record<string, unknown>, dryRun: boolean, missingMail: string[]) {
    let sentLog: 'ok' | 'missing' | 'error' = 'ok'
    let alreadySent = false
    try { alreadySent = (await repo.sent([key])).has(key) } catch (error) { sentLog = isLogMissing(error) ? 'missing' : 'error' }
    if (sentLog === 'missing') log.warn(`[timing-digest] 去重表 ${logTable} 不存在：请执行 supabase/migrations/202611140001_candidate_alert_log.sql；先按本实例保护发送`)

    if (dryRun) {
      return res.status(200).json({ ok: true, timing: true, dryRun: true, ...info, sentLog, alreadySent, mailConfigured: !missingMail.length,
        wouldSend: !!mail && sentLog !== 'error' && !alreadySent && !fallbackSent.has(key), ...(mail ? { subject: mail.subject, text: mail.text } : {}) })
    }
    if (!mail) {
      log.info(`[timing-digest] ${String(info.asOf)} 没有新信号，择时状态未变，不发信`)
      return res.status(200).json({ ok: true, timing: true, ...info, sent: false, skipped: 'no-changes' })
    }
    if (sentLog === 'error') {
      log.error('[timing-digest] 去重表读取失败，本次不发送')
      return res.status(502).json({ ok: false, timing: true, ...info, sent: false, error: '去重记录读取失败，本次不发送' })
    }
    if (alreadySent) return res.status(200).json({ ok: true, timing: true, ...info, sent: false, skipped: 'already-sent' })
    let claimed = false
    if (sentLog === 'ok') {
      try {
        claimed = (await repo.claim([{ fingerprint: key, day: today, kind: 'digest' }])).has(key)
      } catch {
        log.error('[timing-digest] 去重表写入失败，本次不发送')
        return res.status(502).json({ ok: false, timing: true, ...info, sent: false, error: '去重记录写入失败，本次不发送' })
      }
      if (!claimed) return res.status(200).json({ ok: true, timing: true, ...info, sent: false, skipped: 'already-sent' })
    } else if (fallbackSent.has(key)) {
      return res.status(200).json({ ok: true, timing: true, ...info, sent: false, skipped: 'already-sent' })
    }

    try {
      await send(mail)
    } catch (error) {
      const e = error as { code?: unknown; responseCode?: unknown }
      log.error(`[timing-digest] 发信失败 code=${String(e?.code ?? 'unknown')} responseCode=${String(e?.responseCode ?? '-')}`)
      if (claimed) await repo.release([key]).catch(() => log.warn('[timing-digest] 释放认领失败，这一天不会重发'))
      return res.status(502).json({ ok: false, timing: true, ...info, sent: false, error: e?.responseCode === 535 || e?.code === 'EAUTH' ? 'Gmail 登录失败：检查 GMAIL_USER 与应用专用密码' : '发信失败' })
    }
    if (sentLog !== 'ok') fallbackSent.add(key)
    log.info(`[timing-digest] 已发送 ${key}：${mail.subject}`)
    return res.status(200).json({ ok: true, timing: true, ...info, sent: true, subject: mail.subject })
  }

  return async function timingDigest(res: Response, dryRun: boolean): Promise<unknown> {
    const repo = repository()
    if (!repo) {
      log.error('[timing-digest] SUPABASE_URL / SUPABASE_SECRET_KEY 未配置或无效')
      return res.status(503).json({ ok: false, timing: true, error: '去重表未配置（SUPABASE_URL / SUPABASE_SECRET_KEY）' })
    }
    const missingMail = MAIL_VARS.filter(k => !env[k])
    if (missingMail.length && !dryRun) {
      log.error(`[timing-digest] 邮件环境变量未配置：${missingMail.join('、')}`)
      return res.status(503).json({ ok: false, timing: true, error: `邮件未配置：${missingMail.join('、')}` })
    }

    const today = beijingDay(now())
    let body: unknown
    try { body = await fetchJson(`${site}/data/etf-timing.json`) } catch {
      log.error('[timing-digest] etf-timing.json 读取失败')
      return res.status(502).json({ ok: false, timing: true, today, error: '择时数据读取失败' })
    }
    const data = asEtfTiming(body)
    const built = buildTimingDigest(data, today)
    if ('skip' in built) {
      const alert = built.skip === 'stale' ? staleTimingAlert(data, today, site) : null
      if (alert) {
        log.warn(`[timing-digest] ${today} 快照停在 ${alert.asOf}，已漏 ${alert.missed} 个工作日`)
        return deliver(res, repo, alert.key, today, alert, { today, asOf: alert.asOf, skipped: 'stale', staleAlert: true, missed: alert.missed }, dryRun, missingMail)
      }
      log.info(`[timing-digest] ${today} 跳过：${built.skip}`)
      return res.status(200).json({ ok: true, timing: true, today, sent: false, skipped: built.skip })
    }
    const d = built.digest
    const mail = d.empty ? null : composeTimingEmail(d, site)
    const info = { today, asOf: d.asOf, bull: d.bull, flipped: d.flipped, buys: d.buys.length, sells: d.sells.length, complete: d.complete }
    return deliver(res, repo, d.key, today, mail, info, dryRun, missingMail)
  }
}
