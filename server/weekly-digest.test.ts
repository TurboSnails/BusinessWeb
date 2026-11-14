// 周报计划 section：无金额、失败隔离、context 不单独发信、sentLog 非 ok 省略
import { describe, expect, it, vi } from 'vitest'
import { createWeeklyDigest } from './weekly-digest'
import { createEmptyPlan } from '../src/features/investment-plan/types'
import type { PlanWeeklyFacts } from '../src/features/investment-plan/weekly'

const NOW = new Date('2026-11-16T00:10:00Z')
const ENV = {
  CRON_SECRET: 'x',
  SUPABASE_URL: 'https://demo.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_x',
  GMAIL_USER: 'a@example.com',
  GMAIL_APP_PASSWORD: 'pw',
  ALERT_EMAIL_TO: 'b@example.com',
}

function res() {
  return {
    code: 0,
    body: null as unknown,
    status(n: number) {
      this.code = n
      return this
    },
    json(b: unknown) {
      this.body = b
      return this
    },
  }
}

type DigestBody = {
  plan: unknown
  wouldSend?: boolean
  notes: string[]
  sentLog?: string
  summary: { sections: Array<{ id: string; context?: boolean; lines: Array<{ text: string; kind: string }> }> }
}

const repo = () => ({
  snapshot: async () => [],
  sent: async () => new Set<string>(),
  claim: async (rows: { fingerprint: string }[]) => new Set(rows.map(r => r.fingerprint)),
  release: async () => undefined,
  loggedFingerprints: async () => [],
})

describe('weekly-digest plan section', () => {
  it('默认无计划 / 失败隔离不影响原周报；context 不单独发信', async () => {
    const facts: PlanWeeklyFacts = {
      snapshotDate: '2026-11-14',
      dueDate: '2026-11-16',
      upcomingDate: null,
      deferred: false,
    }
    const digest = createWeeklyDigest({
      env: ENV,
      now: () => NOW,
      log: { info() {}, warn() {}, error() {} },
      site: 'https://example.test',
      logTable: 'businessweb_candidate_alert_log',
      fetchJson: async () => null,
      repository: repo,
      isLogMissing: () => false,
      send: async () => {
        throw new Error('should not send')
      },
      loadPlanFacts: async () => ({ facts }),
    })
    const r = res()
    await digest(r, true)
    expect(r.code).toBe(200)
    const b1 = r.body as DigestBody
    expect(b1.plan).toEqual({
      dueDate: '2026-11-16',
      upcomingDate: null,
      deferred: false,
      snapshotDate: '2026-11-14',
    })
    expect(b1.wouldSend).toBe(false) // 仅 context，无变化项
    expect(JSON.stringify(b1)).not.toMatch(/fen|amount|token|Bearer|schemaVersion.:1,.id/i)

    const fail = createWeeklyDigest({
      env: ENV,
      now: () => NOW,
      log: { info() {}, warn() {}, error() {} },
      site: 'https://example.test',
      logTable: 't',
      fetchJson: async () => null,
      repository: repo,
      isLogMissing: () => false,
      send: async () => undefined,
      loadPlanFacts: async () => {
        throw new Error('boom')
      },
    })
    const r2 = res()
    await fail(r2, true)
    const b2 = r2.body as DigestBody
    expect(r2.code).toBe(200)
    expect(b2.plan).toBeNull()
    expect(b2.notes.some(n => n.includes('站长计划'))).toBe(true)
  })

  it('sentLog missing 时省略 plan', async () => {
    const digest = createWeeklyDigest({
      env: ENV,
      now: () => NOW,
      log: { info() {}, warn() {}, error() {} },
      site: 'https://example.test',
      logTable: 't',
      fetchJson: async () => null,
      repository: () => ({
        ...repo(),
        sent: async () => {
          const err = new Error('missing') as Error & { code?: string }
          err.code = 'PGRST205'
          throw err
        },
      }),
      isLogMissing: () => true,
      send: async () => undefined,
      loadPlanFacts: async () => ({
        facts: { snapshotDate: '2026-11-14', dueDate: '2026-11-16', upcomingDate: null, deferred: false },
      }),
    })
    const r = res()
    await digest(r, true)
    const b = r.body as DigestBody
    expect(b.plan).toBeNull()
    expect(b.sentLog).toBe('missing')
  })

  it('dryRun / 摘要无 PlanDocument 金额字段', async () => {
    void createEmptyPlan('2026-11-14T00:00:00.000Z', 'secret-plan')
    const load = vi.fn(async () => ({
      facts: {
        snapshotDate: '2026-11-14',
        dueDate: null as string | null,
        upcomingDate: '2026-11-18',
        deferred: true,
      },
    }))
    const digest = createWeeklyDigest({
      env: ENV,
      now: () => NOW,
      log: { info() {}, warn() {}, error() {} },
      site: 'https://example.test',
      logTable: 't',
      fetchJson: async () => null,
      repository: repo,
      isLogMissing: () => false,
      send: async () => undefined,
      loadPlanFacts: load,
    })
    const r = res()
    await digest(r, true)
    const body = r.body as DigestBody
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('9999')
    expect(raw).not.toContain('secret-plan')
    expect(body.summary.sections.find(s => s.id === 'plan')?.context).toBe(true)
    expect(body.summary.sections.find(s => s.id === 'plan')?.lines[0].text).toContain('未来 7 天内有检查日')
    expect(body.summary.sections.find(s => s.id === 'plan')?.lines[0].text).toContain('暂缓')
  })
})
