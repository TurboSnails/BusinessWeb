// ETF 择时每日观察：有信号才发、去重、发信失败释放认领、旧快照不发
import { describe, expect, it, vi } from 'vitest'
import { createTimingDigest } from './timing-digest'
import { fixture } from '../src/features/etf-timing/fixtures'

const NOW = new Date('2026-11-13T23:30:00Z') // 北京 2026-11-14 周六 07:30
const ENV = { GMAIL_USER: 'a@example.com', GMAIL_APP_PASSWORD: 'pw', ALERT_EMAIL_TO: 'b@example.com' }

function res() {
  return {
    code: 0, body: null as unknown,
    status(n: number) { this.code = n; return this },
    json(b: unknown) { this.body = b; return this },
  }
}

function body(withSignal = true) {
  const f = fixture()
  if (withSignal) f.latest.items[0].hs = { holding: false, pending: 'buy', lastSignal: { date: '2026-11-13', side: 'buy' } } as never
  return f
}

function setup({ data = body() as unknown, sent = new Set<string>(), claimOk = true, sendFails = false, sentThrows = false } = {}) {
  const repo = {
    sent: vi.fn(async () => { if (sentThrows) throw new Error('x'); return sent }),
    claim: vi.fn(async (rows: { fingerprint: string }[]) => new Set(claimOk ? rows.map(r => r.fingerprint) : [])),
    release: vi.fn(async () => {}),
  }
  const send = vi.fn(async () => { if (sendFails) throw Object.assign(new Error('smtp'), { code: 'ECONN' }) })
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const run = createTimingDigest({
    env: ENV, now: () => NOW, log, site: 'https://x.test', logTable: 't',
    fetchJson: async () => data, repository: () => repo, isLogMissing: () => false, send,
  })
  return { run, repo, send }
}

describe('timing digest handler', () => {
  it('有新信号时认领并发送', async () => {
    const { run, repo, send } = setup()
    const r = res(); await run(r, false)
    expect(r.body).toMatchObject({ ok: true, sent: true, asOf: '2026-11-13', buys: 1 })
    expect(repo.claim).toHaveBeenCalledWith([{ fingerprint: 'timing|2026-11-13', day: '2026-11-14', kind: 'digest' }])
    expect(send).toHaveBeenCalledOnce()
  })

  it('没有新信号不发', async () => {
    const { run, send } = setup({ data: body(false) })
    const r = res(); await run(r, false)
    expect(r.body).toMatchObject({ sent: false, skipped: 'no-changes' })
    expect(send).not.toHaveBeenCalled()
  })

  it('已发过的数据日期不重发', async () => {
    const { run, send } = setup({ sent: new Set(['timing|2026-11-13']) })
    const r = res(); await run(r, false)
    expect(r.body).toMatchObject({ sent: false, skipped: 'already-sent' })
    expect(send).not.toHaveBeenCalled()
  })

  it('发信失败释放认领', async () => {
    const { run, repo } = setup({ sendFails: true })
    const r = res(); await run(r, false)
    expect(r.code).toBe(502)
    expect(repo.release).toHaveBeenCalledWith(['timing|2026-11-13'])
  })

  it('去重表读取失败不发', async () => {
    const { run, send } = setup({ sentThrows: true })
    const r = res(); await run(r, false)
    expect(r.code).toBe(502)
    expect(send).not.toHaveBeenCalled()
  })

  it('试运行返回邮件内容，不认领不发送', async () => {
    const { run, repo, send } = setup()
    const r = res(); await run(r, true)
    expect(r.body).toMatchObject({ dryRun: true, wouldSend: true })
    expect(String((r.body as { subject: string }).subject)).toContain('买入信号 1')
    expect(repo.claim).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('只漏一个工作日时静默跳过', async () => {
    const f = body(); f.latest.asOf = '2026-11-12'
    const { run, send } = setup({ data: f })
    const r = res(); await run(r, false)
    expect(r.body).toMatchObject({ sent: false, skipped: 'stale' })
    expect(send).not.toHaveBeenCalled()
  })

  it('连续漏两个工作日以上发一次断更提醒，按快照日期去重', async () => {
    const f = body(); f.latest.asOf = '2026-11-10'
    const { run, repo, send } = setup({ data: f })
    const r = res(); await run(r, false)
    expect(r.body).toMatchObject({ sent: true, staleAlert: true, missed: 3, asOf: '2026-11-10' })
    expect(repo.claim).toHaveBeenCalledWith([{ fingerprint: 'timing-stale|2026-11-10', day: '2026-11-14', kind: 'digest' }])
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'ETF 择时观察 · 影子运行已 3 个工作日没有更新' }))

    const again = setup({ data: f, sent: new Set(['timing-stale|2026-11-10']) })
    const r2 = res(); await again.run(r2, false)
    expect(r2.body).toMatchObject({ sent: false, skipped: 'already-sent' })
    expect(again.send).not.toHaveBeenCalled()
  })

  it('去重表缺失时本实例内同一键只发一次', async () => {
    const repo = { sent: vi.fn(async () => { throw new Error('missing') }), claim: vi.fn(), release: vi.fn() }
    const send = vi.fn(async () => {})
    const run = createTimingDigest({
      env: ENV, now: () => NOW, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, site: 'https://x.test', logTable: 't',
      fetchJson: async () => body(), repository: () => repo as never, isLogMissing: () => true, send,
    })
    await run(res(), false)
    const r = res(); await run(r, false)
    expect(send).toHaveBeenCalledOnce()
    expect(r.body).toMatchObject({ skipped: 'already-sent' })
  })
})
