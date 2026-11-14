// 每周变化摘要邮件（/api/market-data/candidate-alerts-digest?weekly=1 → server/weekly-digest.ts）：
// 鉴权、配置、试运行、每周最多一封（去重键 weekly|YYYY-Www，kind = digest）、无变化不发、发信失败释放、并入每日提醒的触及记录。
import { describe, expect, it, vi } from 'vitest'
import { createCandidateAlertsDigest, SITE, type MailMessage } from '../../../server/candidate-alerts-digest'
import type { CandidateAlertRule, CandidateItem } from '../candidates/validation'

const NOW = new Date('2026-11-16T00:10:00Z') // 北京 2026-11-16（周一）08:10 → 总结 2026-W46（11-09 至 11-15）
const SECRET = 'cron-secret-0123456789'
const MAIL = { GMAIL_USER: 'sender.secret@example.com', GMAIL_APP_PASSWORD: 'app-password-secret', ALERT_EMAIL_TO: 'receiver.secret@example.com' }
const ENV = { CRON_SECRET: SECRET, SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_supabase_key', ...MAIL }
const SECRETS = [SECRET, ...Object.values(MAIL), ENV.SUPABASE_SECRET_KEY]
const KEY = 'weekly|2026-W46'

const rule = (over: Partial<CandidateAlertRule> = {}): CandidateAlertRule => ({ kind: 'price-below', threshold: 1500, currency: 'CNY', anchor: { type: 'research-bear', value: 1500, asOf: '2026-11-01' }, enabled: true, createdAt: '2026-11-01T00:00:00.000Z', ...over })
const ITEMS: CandidateItem[] = [
  { market: 'cn', code: '600519', addedAt: '2026-10-01T00:00:00Z', alert: rule() },
  { market: 'cn', code: '000001', addedAt: '2026-10-01T00:00:00Z', alert: rule({ threshold: 13, anchor: { type: 'manual', value: 12, asOf: '2026-11-01' } }) },
]
const AUTO = { schemaVersion: 1, generatedAt: '2026-11-15T23:00:00Z', items: { 'cn:600519': [0, 2000, 1500, 'm', 1400, 'CNY', '2026-11-13', 0], 'cn:000001': [0, 15, 13, 'm', 14, 'CNY', '2026-11-13', 0] } }
const REFS = { version: 1, items: { 'cn:600519': { n: '贵州茅台', r: '观察' }, 'cn:000001': { n: '平安银行', r: '观察' }, 'us:MSFT': { n: '微软', r: '条件关注' } } }
const LEDGER = { schemaVersion: 1, snapshots: { '2026-11-07': { 'cn:600519': [1450, 1], 'us:MSFT': [500, 2] }, '2026-11-13': { 'cn:600519': [1400, 2], 'us:MSFT': [510, 1] } } }
const shadow = { trendState: '防守', riskGate: '防守复核', valuationZone: '中间区域' }
const CYCLE = { schemaVersion: 1, generatedAt: '2026-11-14T10:00:00Z', issues: [], records: [
  { weekEnding: '2026-11-14', decisionAt: '2026-11-14T10:00:00Z', ruleVersion: 'cycle-shadow-v2', markets: { csi300: { legacyState: '趋势防守', shadow }, hsi: { legacyState: '趋势防守', shadow } } },
  { weekEnding: '2026-11-07', decisionAt: '2026-11-13T10:00:00Z', ruleVersion: 'cycle-shadow-v2', markets: { csi300: { legacyState: '趋势防守', shadow }, hsi: { legacyState: '趋势防守', shadow } } },
] }
const EARNINGS = { schemaVersion: 1, generatedAt: '2026-11-15T23:30:00Z', today: '2026-11-15', sources: { yahoo: { label: 'Yahoo Finance（yfinance）' }, cnAppoint: { label: '东方财富·定期报告预约披露' } }, items: [
  { market: 'cn', code: '600519', name: '贵州茅台', date: '2026-11-18', time: 'unknown', confirmed: true, period: null, dateSource: 'cnAppoint', research: { rating: '观察' } },
  { market: 'us', code: 'NVDA', name: '英伟达', date: '2026-11-17', time: 'amc', confirmed: true, period: 'FY2027Q3', dateSource: 'yahoo', research: { rating: '条件关注' } },
  { market: 'us', code: 'WMT', name: '沃尔玛', date: '2026-11-19', time: 'bmo', confirmed: false, period: null, dateSource: 'yahoo', research: { rating: '观察' } },
] }
const MACRO = { generatedAt: '2026-11-14', series: { vix: { latest: { date: '2026-11-13', value: 16 }, history: [['2026-10-30', 15]] } } }

const res = () => ({
  code: 0, body: null as any, headers: {} as Record<string, string>,
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v },
  status(n: number) { this.code = n; return this },
  json(b: unknown) { this.body = b; return this },
})
const req = ({ auth = `Bearer ${SECRET}`, method = 'GET', dryRun = false } = {}) => ({ method, headers: auth ? { authorization: auth } : {}, query: { weekly: '1', ...(dryRun ? { dryRun: '1' } : {}) } })
const capture = () => { const lines: string[] = []; const push = (...a: unknown[]) => { lines.push(a.join(' ')) }; return { lines, info: push, warn: push, error: push } }

function fakeBackend({ items = ITEMS, ledger = LEDGER as unknown, earnings = null as unknown, logTable = true, logReadStatus = 200, sent = [] as string[], logged = [] as { fingerprint: string; kind: string; day: string }[] } = {}) {
  const log = new Map<string, { kind: string; day: string }>(logged.map(r => [r.fingerprint, r]))
  for (const f of sent) log.set(f, { kind: 'digest', day: '2026-11-16' })
  const calls: { url: string; method: string; body?: string }[] = []
  const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body })
  const parseIn = (url: string): string[] => {
    const m = /fingerprint=([^&]+)/.exec(url)
    return m ? [...decodeURIComponent(m[1]).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]) : []
  }
  const fetchImpl = vi.fn(async (url: string, init: Record<string, any> = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ url, method, body: init.body })
    const files: Record<string, unknown> = { 'dcf-auto.json': AUTO, 'company-refs.json': REFS, 'signal-ledger-2026.json': ledger, 'market-cycle-report.json': CYCLE, 'macro-us.json': MACRO, ...(earnings ? { 'earnings-calendar.json': earnings } : {}) }
    for (const [name, body] of Object.entries(files)) if (url === `${SITE}/data/${name}`) return reply(200, body)
    if (url.startsWith('https://demo.supabase.co/rest/v1/businessweb_candidates_snapshot')) return reply(200, [{ payload: { schemaVersion: 1, items } }])
    if (url.startsWith('https://demo.supabase.co/rest/v1/businessweb_candidate_alert_log')) {
      if (!logTable) return reply(404, { code: 'PGRST205', message: 'Could not find the table' })
      if (method === 'GET') {
        if (logReadStatus !== 200) return reply(logReadStatus, {})
        const kind = /kind=eq\.([^&]+)/.exec(url)?.[1]
        if (kind) {
          const from = /day=gte\.([^&]+)/.exec(url)![1], to = /day=lte\.([^&]+)/.exec(url)![1]
          return reply(200, [...log].filter(([, r]) => r.kind === kind && r.day >= from && r.day <= to).map(([fingerprint]) => ({ fingerprint })))
        }
        return reply(200, parseIn(url).filter(f => log.has(f)).map(fingerprint => ({ fingerprint })))
      }
      if (method === 'POST') {
        const rows = JSON.parse(init.body) as { fingerprint: string; kind: string; day: string }[]
        const inserted = rows.filter(r => !log.has(r.fingerprint))
        inserted.forEach(r => log.set(r.fingerprint, r))
        return reply(201, inserted)
      }
      if (method === 'DELETE') { parseIn(url).forEach(f => log.delete(f)); return reply(204, null) }
    }
    throw new Error(`unexpected ${method} ${url}`)
  })
  return { fetchImpl, calls, log }
}
function fakeMailer({ fail = null as null | Record<string, unknown> } = {}) {
  const sent: MailMessage[] = []
  const createTransport = vi.fn(() => ({ sendMail: vi.fn(async (m: MailMessage) => { if (fail) throw Object.assign(new Error(`535 for ${MAIL.GMAIL_USER}`), fail); sent.push(m) }), close: vi.fn() }))
  return { createTransport, sent }
}
const setup = (backend = fakeBackend(), mailer = fakeMailer(), env: Record<string, string | undefined> = ENV) => {
  const log = capture()
  const handler = createCandidateAlertsDigest({ fetchImpl: backend.fetchImpl as any, env, now: () => NOW, log, createTransport: mailer.createTransport })
  return { handler, backend, mailer, log }
}
const noSecrets = (text: string) => { for (const s of SECRETS) expect(text).not.toContain(s) }

describe('weekly 鉴权与配置', () => {
  it('与每日提醒同一鉴权：非 GET 405、无/错 Bearer 401；鉴权前不读任何数据', async () => {
    const { handler, backend } = setup()
    for (const [request, code] of [[req({ method: 'POST' }), 405], [req({ auth: '' }), 401], [req({ auth: 'Bearer wrong' }), 401]] as const) {
      const r = res(); await handler(request, r)
      expect(r.code).toBe(code)
      expect(r.headers['cache-control']).toBe('no-store')
    }
    expect(backend.fetchImpl).not.toHaveBeenCalled()
  })

  it('Supabase 未配置 503；邮件变量缺失 503 且只报变量名；试运行不需要邮件变量', async () => {
    const noDb = setup(fakeBackend(), fakeMailer(), { ...ENV, SUPABASE_SECRET_KEY: undefined })
    const a = res(); await noDb.handler(req(), a)
    expect(a.code).toBe(503)
    expect(a.body.weekly).toBe(true)

    const noMail = setup(fakeBackend(), fakeMailer(), { ...ENV, ALERT_EMAIL_TO: undefined })
    const b = res(); await noMail.handler(req(), b)
    expect(b.code).toBe(503)
    expect(b.body.error).toContain('ALERT_EMAIL_TO')
    noSecrets(JSON.stringify(b.body) + noMail.log.lines.join('\n'))

    const dry = setup(fakeBackend(), fakeMailer(), { ...ENV, GMAIL_USER: undefined })
    const c = res(); await dry.handler(req({ dryRun: true }), c)
    expect(c.code).toBe(200)
    expect(c.body).toMatchObject({ dryRun: true, mailConfigured: false })
  })
})

describe('weekly 试运行与发送', () => {
  it('试运行：返回上一完整周的摘要与邮件正文，不发信、不写去重表', async () => {
    const { handler, backend, mailer } = setup()
    const r = res(); await handler(req({ dryRun: true }), r)
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ ok: true, weekly: true, dryRun: true, today: '2026-11-16', week: { id: '2026-W46', start: '2026-11-09', end: '2026-11-15' }, alreadySent: false, wouldSend: true, sentLog: 'ok' })
    expect(r.body.sections).toEqual([{ id: 'candidates', lines: 2, more: 0 }, { id: 'library', lines: 2, more: 0 }])
    expect(r.body.subject).toBe('每周变化摘要 · 2026-W46（11-09–11-15）· 4 项')
    expect(r.body.text).toContain('贵州茅台（600519 · A股）：研究评级「条件关注」→「观察」')
    expect(r.body.text).toContain('收盘价 CNY 1,400 ≤ 条件价 1,500')
    expect(r.body.text).toContain('微软（MSFT · 标普500）：新进「条件关注」')
    expect(r.body.text).not.toContain('平安银行') // 收盘 14 > 条件价 13，未触及
    expect(mailer.createTransport).not.toHaveBeenCalled()
    expect(backend.calls.some(c => c.method !== 'GET')).toBe(false)
    noSecrets(JSON.stringify(r.body))
  })

  it('每周最多一封：第一次认领 weekly|2026-W46（kind = digest）并发送；同周再调用跳过', async () => {
    const backend = fakeBackend()
    const { handler, mailer } = setup(backend)
    const a = res(); await handler(req(), a)
    expect(a.code).toBe(200)
    expect(a.body).toMatchObject({ sent: true, subject: '每周变化摘要 · 2026-W46（11-09–11-15）· 4 项' })
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]).toMatchObject({ to: MAIL.ALERT_EMAIL_TO, from: `"每周变化摘要" <${MAIL.GMAIL_USER}>` })
    expect(mailer.sent[0].text).toContain('不是买卖指令')
    expect(backend.log.get(KEY)).toEqual({ fingerprint: KEY, day: '2026-11-16', kind: 'digest' })
    // 只写周键，不写逐项去重键，不影响每日提醒的去重
    expect([...backend.log.keys()]).toEqual([KEY])

    const b = res(); await handler(req(), b)
    expect(b.body).toMatchObject({ ok: true, sent: false, skipped: 'already-sent-this-week' })
    // 另一个实例（冷启动）同样跳过：依据是去重表，不是内存
    const other = setup(backend, mailer)
    const c = res(); await other.handler(req(), c)
    expect(c.body.skipped).toBe('already-sent-this-week')
    expect(mailer.sent).toHaveLength(1)

    const dry = res(); await other.handler(req({ dryRun: true }), dry)
    expect(dry.body).toMatchObject({ alreadySent: true, wouldSend: false })
  })

  it('没有变化：不发信、不写去重表', async () => {
    const backend = fakeBackend({ items: [], ledger: { schemaVersion: 1, snapshots: { '2026-11-07': { 'us:KO': [1, 2] }, '2026-11-13': { 'us:KO': [1, 2] } } } })
    const { handler, mailer } = setup(backend)
    const r = res(); await handler(req(), r)
    expect(r.body).toMatchObject({ ok: true, sent: false, skipped: 'no-changes', count: 0 })
    expect(mailer.createTransport).not.toHaveBeenCalled()
    expect(backend.log.size).toBe(0)
  })

  it('下周财报：只限候选池与条件关注以上，作为背景附在有变化的邮件里，不计入标题项数', async () => {
    const { handler } = setup(fakeBackend({ earnings: EARNINGS }))
    const r = res(); await handler(req({ dryRun: true }), r)
    expect(r.body.sections).toEqual([{ id: 'candidates', lines: 2, more: 0 }, { id: 'library', lines: 2, more: 0 }, { id: 'earnings', lines: 2, more: 0, context: true }])
    expect(r.body.count).toBe(4)
    expect(r.body.subject).toBe('每周变化摘要 · 2026-W46（11-09–11-15）· 4 项')
    expect(r.body.text).toContain('【下周财报】2 家')
    expect(r.body.text).toContain('贵州茅台（600519 · A股）：11-18公布（日期已确认；候选池）')
    expect(r.body.text).toContain('英伟达（NVDA · 标普500）：11-17 盘后公布 FY2027Q3（日期已确认；站内评级「条件关注」）')
    expect(r.body.text).not.toContain('沃尔玛')
  })

  it('只有下周财报、没有变化：不发信（财报不单独触发邮件）', async () => {
    const backend = fakeBackend({ items: [{ market: 'us', code: 'WMT', addedAt: '2026-10-01T00:00:00Z' }], earnings: EARNINGS, ledger: { schemaVersion: 1, snapshots: { '2026-11-07': { 'us:KO': [1, 2] }, '2026-11-13': { 'us:KO': [1, 2] } } } })
    const { handler, mailer } = setup(backend)
    const dry = res(); await handler(req({ dryRun: true }), dry)
    expect(dry.body).toMatchObject({ wouldSend: false, count: 0 })
    expect(dry.body.sections.map((s: any) => s.id)).toEqual(['earnings'])
    const r = res(); await handler(req(), r)
    expect(r.body).toMatchObject({ ok: true, sent: false, skipped: 'no-changes', count: 0 })
    expect(mailer.createTransport).not.toHaveBeenCalled()
    expect(backend.log.size).toBe(0)
  })

  it('发信失败：502、只记错误代码、释放周键（下次再发）', async () => {
    const backend = fakeBackend()
    const { handler, log } = setup(backend, fakeMailer({ fail: { code: 'EAUTH', responseCode: 535 } }))
    const r = res(); await handler(req(), r)
    expect(r.code).toBe(502)
    expect(r.body.error).toMatch(/Gmail 登录失败/)
    expect(backend.log.has(KEY)).toBe(false)
    noSecrets(JSON.stringify(r.body) + log.lines.join('\n'))
  })

  it('去重表读取失败：不发送（宁可不发，也不重复）', async () => {
    const { handler, mailer } = setup(fakeBackend({ logReadStatus: 500 }))
    const r = res(); await handler(req(), r)
    expect(r.code).toBe(502)
    expect(mailer.createTransport).not.toHaveBeenCalled()
  })

  it('去重表不存在：按本实例保护发送一次，并提示执行迁移', async () => {
    const { handler, mailer, log } = setup(fakeBackend({ logTable: false }))
    const a = res(); await handler(req(), a)
    expect(a.body).toMatchObject({ sent: true, sentLog: 'missing' })
    const b = res(); await handler(req(), b)
    expect(b.body.skipped).toBe('already-sent-this-week')
    expect(mailer.sent).toHaveLength(1)
    expect(log.lines.join('\n')).toContain('202611140001_candidate_alert_log.sql')
  })

  it('并入本周每日提醒已发过的触及条件价（收盘价已回到条件之上也列出），周外的不列', async () => {
    const logged = [
      { fingerprint: 'price-hit|cn:000001|2026-11-11|price-below|13', kind: 'price-hit', day: '2026-11-12' },
      { fingerprint: 'price-hit|cn:000001|2026-11-06|price-below|13', kind: 'price-hit', day: '2026-11-07' },
    ]
    const { handler } = setup(fakeBackend({ logged }))
    const r = res(); await handler(req({ dryRun: true }), r)
    const lines = r.body.summary.sections.find((s: any) => s.id === 'candidates').lines
    expect(lines.filter((l: any) => l.kind === 'price-hit').map((l: any) => [l.text, l.date, l.source])).toEqual([
      ['平安银行（000001 · A股）：收盘价触及条件价（≤ 13），该复核一眼', '2026-11-11', '候选池每日提醒（已发送）'],
      ['贵州茅台（600519 · A股）：收盘价 CNY 1,400 ≤ 条件价 1,500，该复核一眼', '2026-11-13', '自动 DCF 预填库收盘价'],
    ])
  })

  it('静态文件读取失败：其余部分照常，摘要里写明哪部分未比较', async () => {
    const backend = fakeBackend({ ledger: null })
    const orig = backend.fetchImpl.getMockImplementation()!
    backend.fetchImpl.mockImplementation(async (url: string, init?: Record<string, any>) => url.endsWith('signal-ledger-2026.json') ? { ok: false, status: 404, json: async () => ({}) } : orig(url, init))
    const { handler } = setup(backend)
    const r = res(); await handler(req({ dryRun: true }), r)
    expect(r.code).toBe(200)
    expect(r.body.notes).toContain('信号台账 2026未能读取，相关部分未比较。')
    expect(r.body.sections).toEqual([{ id: 'candidates', lines: 1, more: 0 }])
  })

  it('不带 weekly 参数时仍是每日提醒（不受影响）', async () => {
    const { handler } = setup()
    const r = res(); await handler({ method: 'GET', headers: { authorization: `Bearer ${SECRET}` }, query: { dryRun: '1' } }, r)
    expect(r.body.weekly).toBeUndefined()
    expect(r.body.subject).toMatch(/^候选池提醒/)
  })
})
