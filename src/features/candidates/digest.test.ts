// 服务端候选池每日提醒邮件（server/candidate-alerts-digest.ts）：鉴权、配置、去重、试运行、邮件内容，以及与站内规则一致。
import { describe, expect, it, vi } from 'vitest'
import { composeDigest, createCandidateAlertsDigest, evaluateDigest, previousRunDay, SITE, type CompanyRef, type MailMessage } from '../../../server/candidate-alerts-digest'
import { candidateAlerts } from './alerts'
import { priceObservations, VENUE_CURRENCY } from './priceAlert'
import { venueOf } from './markets'
import { parseAutoSummary } from '../dcf/autoDcfSummary'
import type { CandidateAlertRule, CandidateItem, CandidateMarket } from './validation'

const NOW = new Date('2026-11-13T23:10:00Z') // 北京 2026-11-14（周六）早上
const TODAY = '2026-11-14'
const SECRET = 'cron-secret-0123456789'
const MAIL = { GMAIL_USER: 'sender.secret@example.com', GMAIL_APP_PASSWORD: 'app-password-secret', ALERT_EMAIL_TO: 'receiver.secret@example.com' }
const ENV = { CRON_SECRET: SECRET, SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_supabase_key', ...MAIL }
const SECRETS = [SECRET, ...Object.values(MAIL), ENV.SUPABASE_SECRET_KEY]

const rule = (over: Partial<CandidateAlertRule> = {}): CandidateAlertRule => ({ kind: 'price-below', threshold: 1500, currency: 'CNY', anchor: { type: 'research-bear', value: 1500, asOf: '2026-11-01' }, enabled: true, createdAt: '2026-11-01T00:00:00.000Z', ...over })
const decision = (nextCheck: string, rating?: string) => ({ at: '2026-10-01T00:00:00.000Z', action: 'watch' as const, why: '护城河', wrong: '份额下滑', nextCheck, ...(rating ? { snapshot: { rating } } : {}) })
const item = (market: CandidateMarket, code: string, over: Partial<CandidateItem> = {}): CandidateItem => ({ market, code, addedAt: '2026-10-01T00:00:00.000Z', ...over })

const ITEMS: CandidateItem[] = [
  item('cn', '600519', { alert: rule() }), // 收盘 1400 ≤ 1500：触及
  item('us', 'AAPL', { decisions: [decision('2026-11-14', '优先关注')] }), // 检查日今天到期 + 评级从优先关注变为回避
  item('hk', '00700', { alert: rule({ currency: 'HKD', threshold: 500, anchor: { type: 'manual', value: 480, asOf: '2026-11-01' }, snoozedUntil: '2026-11-20' }) }), // 暂停中
  item('cn', '000001', { alert: rule({ threshold: 13, anchor: { type: 'manual', value: 12, asOf: '2026-11-01' }, lastSeenAt: '2026-11-13T12:00:00.000Z' }) }), // 这一行情日已看过
  item('cn', '600036', { alert: rule({ threshold: 30, anchor: { type: 'manual', value: 40, asOf: '2026-11-01' }, enabled: false }) }), // 已关闭
]
const AUTO = { schemaVersion: 1, generatedAt: '2026-11-13T23:00:00Z', items: {
  'cn:600519': [0, 2000, 1500, 'm', 1400, 'CNY', '2026-11-13', 0],
  'hk:00700': [0, 600, 450, 'm', 420, 'HKD', '2026-11-13', 0],
  'cn:000001': [0, 15, 13, 'm', 12, 'CNY', '2026-11-13', 0],
  'cn:600036': [0, 50, 35, 'm', 28, 'CNY', '2026-11-13', 0],
} }
const REFS: Record<string, CompanyRef> = {
  'cn:600519': { n: '贵州茅台', r: '条件关注', q: { price: 1450, priceDate: '2026-11-12', currency: 'CNY', source: 'research/quotes.json', tradability: 'no-known-restriction' } },
  'us:AAPL': { n: '苹果', r: '回避' },
  'hk:00700': { n: '腾讯控股', r: '优先关注' },
}

const res = () => ({
  code: 0, body: null as any, headers: {} as Record<string, string>,
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v },
  status(n: number) { this.code = n; return this },
  json(b: unknown) { this.body = b; return this },
})
const req = ({ auth = `Bearer ${SECRET}`, method = 'GET', dryRun = false } = {}) => ({ method, headers: auth ? { authorization: auth } : {}, query: dryRun ? { dryRun: '1' } : {} })
const capture = () => { const lines: string[] = []; const push = (...a: unknown[]) => { lines.push(a.join(' ')) }; return { lines, info: push, warn: push, error: push } }

/** 假 Supabase + 站点静态文件；去重表存在内存里 */
function fakeBackend({ items = ITEMS, logTable = true, logReadStatus = 200, sent = [] as string[], autoStatus = 200 } = {}) {
  const log = new Set(sent)
  const calls: { url: string; method: string; body?: string }[] = []
  const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body })
  const parseIn = (url: string): string[] => {
    const m = /fingerprint=([^&]+)/.exec(url)
    return m ? [...decodeURIComponent(m[1]).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]) : []
  }
  const fetchImpl = vi.fn(async (url: string, init: Record<string, any> = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ url, method, body: init.body })
    if (url === `${SITE}/data/dcf-auto.json`) return reply(autoStatus, AUTO)
    if (url === `${SITE}/data/company-refs.json`) return reply(200, { version: 1, items: REFS })
    if (url.startsWith('https://demo.supabase.co/rest/v1/businessweb_candidates_snapshot')) return reply(200, [{ payload: { schemaVersion: 1, items } }])
    if (url.startsWith('https://demo.supabase.co/rest/v1/businessweb_candidate_alert_log')) {
      if (!logTable) return reply(404, { code: 'PGRST205', message: 'Could not find the table' })
      if (method === 'GET') return logReadStatus === 200 ? reply(200, parseIn(url).filter(f => log.has(f)).map(fingerprint => ({ fingerprint }))) : reply(logReadStatus, {})
      if (method === 'POST') {
        const rows = JSON.parse(init.body) as { fingerprint: string }[]
        const inserted = rows.filter(r => !log.has(r.fingerprint))
        inserted.forEach(r => log.add(r.fingerprint))
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
  const options: Record<string, unknown>[] = []
  const createTransport = vi.fn((opts: Record<string, unknown>) => {
    options.push(opts)
    return { sendMail: vi.fn(async (m: MailMessage) => { if (fail) throw Object.assign(new Error(`535 auth failed for ${MAIL.GMAIL_USER}`), fail); sent.push(m) }), close: vi.fn() }
  })
  return { createTransport, sent, options }
}
const setup = (backend = fakeBackend(), mailer = fakeMailer(), env: Record<string, string | undefined> = ENV) => {
  const log = capture()
  const handler = createCandidateAlertsDigest({ fetchImpl: backend.fetchImpl as any, env, now: () => NOW, log, createTransport: mailer.createTransport })
  return { handler, backend, mailer, log }
}
const noSecrets = (text: string) => { for (const s of SECRETS) expect(text).not.toContain(s) }

describe('candidate-alerts-digest 鉴权与配置', () => {
  it('非 GET 405、无/错 Bearer 401、未配置 CRON_SECRET 503；鉴权前不读数据库', async () => {
    const { handler, backend } = setup()
    for (const [request, code] of [[req({ method: 'POST' }), 405], [req({ auth: '' }), 401], [req({ auth: 'Bearer wrong' }), 401], [req({ auth: SECRET }), 401]] as const) {
      const r = res(); await handler(request, r)
      expect(r.code).toBe(code)
      expect(r.headers['cache-control']).toBe('no-store')
    }
    const unconfigured = setup(fakeBackend(), fakeMailer(), { ...ENV, CRON_SECRET: undefined })
    const r = res(); await unconfigured.handler(req({ auth: 'Bearer ' }), r)
    expect(r.code).toBe(503)
    expect(r.body.error).toMatch(/CRON_SECRET/)
    expect(backend.fetchImpl).not.toHaveBeenCalled()
  })

  it('Supabase 未配置 503；邮件变量缺失 503 且只报变量名；试运行不需要邮件变量', async () => {
    const noDb = setup(fakeBackend(), fakeMailer(), { ...ENV, SUPABASE_URL: 'http://evil.example' })
    const a = res(); await noDb.handler(req(), a)
    expect(a.code).toBe(503)

    const noMail = setup(fakeBackend(), fakeMailer(), { ...ENV, GMAIL_APP_PASSWORD: undefined })
    const b = res(); await noMail.handler(req(), b)
    expect(b.code).toBe(503)
    expect(b.body.error).toContain('GMAIL_APP_PASSWORD')
    noSecrets(JSON.stringify(b.body) + noMail.log.lines.join('\n'))
    expect(noMail.backend.fetchImpl).not.toHaveBeenCalled()

    const dry = setup(fakeBackend(), fakeMailer(), { ...ENV, GMAIL_APP_PASSWORD: undefined })
    const c = res(); await dry.handler(req({ dryRun: true }), c)
    expect(c.code).toBe(200)
    expect(c.body).toMatchObject({ dryRun: true, mailConfigured: false })
  })
})

describe('candidate-alerts-digest 判断、去重与发送', () => {
  it('试运行：返回邮件 JSON（主题、正文、各条去重键），不发信、不写去重表', async () => {
    const { handler, backend, mailer } = setup()
    const r = res(); await handler(req({ dryRun: true }), r)
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ ok: true, dryRun: true, today: TODAY, total: 3, fresh: 3, pending: 0, sentLog: 'ok', wouldSend: true, mailConfigured: true })
    expect(r.body.subject).toBe('候选池提醒 · 2026-11-14 · 3 项')
    expect(r.body.items.map((i: any) => [i.kind, i.code])).toEqual([['price-hit', '600519'], ['review', 'AAPL'], ['rating', 'AAPL']])
    expect(r.body.items[0].fingerprint).toBe('price-hit|cn:600519|2026-11-13|price-below|1500')
    expect(mailer.createTransport).not.toHaveBeenCalled()
    expect(backend.calls.filter(c => c.method !== 'GET')).toEqual([])
    noSecrets(JSON.stringify(r.body))
  })

  it('发送：Gmail SMTP 465，邮件分组、写明收盘价/日期/来源/条件价来源与链接，页脚声明；不含密钥或地址', async () => {
    const { handler, backend, mailer, log } = setup()
    const r = res(); await handler(req(), r)
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ sent: true, count: 3, subject: '候选池提醒 · 2026-11-14 · 3 项' })
    expect(mailer.options[0]).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true })
    const [m] = mailer.sent
    expect(m.to).toBe(MAIL.ALERT_EMAIL_TO)
    expect(m.text).toContain('【触及条件价】1 项')
    expect(m.text).toContain('贵州茅台（600519 · A股）')
    expect(m.text).toContain('到了你设的价位，该复核一眼：收盘价 CNY 1,400（2026-11-13，自动 DCF 预填库收盘价）≤ 条件价 1,500（来自研究估值·悲观价，2026-11-01）')
    expect(m.text).toContain(`${SITE}/research-notes/cn/600519`)
    expect(m.text).toContain('【到期复查】1 项')
    expect(m.text).toContain('【评级变化】1 项')
    expect(m.text).toContain('从「优先关注」变为「回避」')
    expect(m.text).toContain(`${SITE}/candidates`)
    expect(m.text).toContain('观察提醒，不是买卖指令；行情为收盘价，数据日期见各条。')
    expect(m.html).toContain('触及条件价 · 1 项')
    expect(m.html).toContain('观察提醒，不是买卖指令')
    expect(m.text + m.html).not.toMatch(/买入信号/)
    noSecrets(m.subject + m.text + m.html + JSON.stringify(r.body) + log.lines.join('\n'))
    expect([...backend.log].sort()).toEqual(['digest|2026-11-14', 'price-hit|cn:600519|2026-11-13|price-below|1500', 'rating|us:AAPL|优先关注>回避|2026-10-01', 'review|us:AAPL|2026-11-14'].sort())

    // 同一天再调用：事项都已发过 → 不再发
    const again = res(); await handler(req(), again)
    expect(again.body).toMatchObject({ sent: false, skipped: 'nothing-new', pending: 3 })
    expect(mailer.sent).toHaveLength(1)
  })

  it('没有事项不发信，也不写去重表', async () => {
    const { handler, backend, mailer } = setup(fakeBackend({ items: [ITEMS[2], ITEMS[3], ITEMS[4]] }))
    const r = res(); await handler(req(), r)
    expect(r.body).toMatchObject({ ok: true, sent: false, skipped: 'nothing-new', total: 0 })
    expect(mailer.createTransport).not.toHaveBeenCalled()
    expect(backend.calls.filter(c => c.url.includes('alert_log') && c.method !== 'GET')).toEqual([])
  })

  it('去重：已发过的事项不再列；新的照发，并注明仍待处理的条数', async () => {
    const backend = fakeBackend({ sent: ['review|us:AAPL|2026-11-14', 'rating|us:AAPL|优先关注>回避|2026-10-01'] })
    const { handler, mailer } = setup(backend)
    const r = res(); await handler(req(), r)
    expect(r.body).toMatchObject({ sent: true, count: 1, pending: 2 })
    expect(mailer.sent[0].subject).toBe('候选池提醒 · 2026-11-14 · 1 项')
    expect(mailer.sent[0].text).toContain('另有 2 项此前已提醒、仍待处理')
    expect(mailer.sent[0].text).not.toContain('【到期复查】')
  })

  it('每天最多一封：当天已有一封（如交易日数据更新后再次调用）时，新事项留到下一封', async () => {
    const backend = fakeBackend({ sent: ['digest|2026-11-14'] })
    const { handler, mailer } = setup(backend)
    const r = res(); await handler(req(), r)
    expect(r.body).toMatchObject({ sent: false, skipped: 'already-sent-today' })
    expect(mailer.createTransport).not.toHaveBeenCalled()
    expect([...backend.log]).toEqual(['digest|2026-11-14']) // 认领的事项已释放
  })

  it('发信失败：502，释放认领以便下次重发；日志只有错误代码，不含地址', async () => {
    const backend = fakeBackend()
    const { handler, log } = setup(backend, fakeMailer({ fail: { code: 'EAUTH', responseCode: 535 } }))
    const r = res(); await handler(req(), r)
    expect(r.code).toBe(502)
    expect(r.body.error).toMatch(/Gmail 登录失败/)
    expect([...backend.log]).toEqual([])
    expect(log.lines.join('\n')).toContain('code=EAUTH responseCode=535')
    noSecrets(JSON.stringify(r.body) + log.lines.join('\n'))
  })

  it('去重表还没建：按当日保护只发新出现的事项（评级变化不发），同一实例当天只发一次，并提示执行迁移', async () => {
    const backend = fakeBackend({ logTable: false })
    const { handler, mailer, log } = setup(backend)
    const r = res(); await handler(req(), r)
    expect(r.body).toMatchObject({ sent: true, sentLog: 'missing', count: 2 })
    expect(mailer.sent[0].text).not.toContain('【评级变化】')
    expect(log.lines.join('\n')).toContain('202611140001_candidate_alert_log.sql')
    const again = res(); await handler(req(), again)
    expect(again.body).toMatchObject({ sent: false, skipped: 'already-sent-today' })
    expect(mailer.sent).toHaveLength(1)
  })

  it('没有事项时试运行也能看出去重表是否已建', async () => {
    const { handler } = setup(fakeBackend({ items: [], logTable: false }))
    const r = res(); await handler(req({ dryRun: true }), r)
    expect(r.body).toMatchObject({ total: 0, sentLog: 'missing', wouldSend: false })
  })

  it('去重表暂时读不到（非未建）：不发信', async () => {
    const { handler, mailer } = setup(fakeBackend({ logReadStatus: 500 }))
    const r = res(); await handler(req(), r)
    expect(r.code).toBe(502)
    expect(r.body.sent).toBe(false)
    expect(mailer.createTransport).not.toHaveBeenCalled()
  })

  it('行情文件读取失败：仍按公司页价格锚点判断，并在邮件里说明', async () => {
    const { handler, mailer } = setup(fakeBackend({ autoStatus: 500 }))
    const r = res(); await handler(req(), r)
    expect(r.body.sent).toBe(true)
    // 公司页价格锚点 1450（2026-11-12）也 ≤ 1500
    expect(mailer.sent[0].text).toContain('收盘价 CNY 1,450（2026-11-12，公司页价格锚点（research/quotes.json））')
    expect(mailer.sent[0].text).toContain('自动 DCF 预填库行情未能读取')
  })
})

describe('evaluateDigest 与站内规则一致', () => {
  it('同一份候选与行情：邮件事项 = 站内「今日待处理」中的触及条件价 / 到期复查 / 评级变化（文案逐字相同）', () => {
    const auto = parseAutoSummary(AUTO)!
    const anchorPrices = new Map(Object.entries(REFS).filter(([, r]) => r.q).map(([key, r]) => {
      const market = key.split(':')[0] as CandidateMarket
      return [key, priceObservations({ venueCurrency: VENUE_CURRENCY[venueOf(market)], marketRefresh: r.q })]
    }))
    const ratings = new Map(Object.entries(REFS).filter(([, r]) => r.r).map(([key, r]) => [key, r.r as string]))
    const client = candidateAlerts(ITEMS, { dcf: [], valuation: [], grid: [], auto }, TODAY, ratings, anchorPrices)
      .filter(a => a.kind === 'price-hit' || a.kind === 'review' || a.kind === 'rating')
      .map(a => [a.kind, a.market, a.code, a.text])
    const server = evaluateDigest(ITEMS, TODAY, auto, REFS).map(i => [i.kind, i.market, i.code, i.text])
    expect(server).toEqual(client)
    expect(server).toHaveLength(3)
    // 站内还会显示自动 DCF 的「进入买入区」，邮件不发（服务端看不到本机 DCF）
    expect(candidateAlerts(ITEMS, { dcf: [], valuation: [], grid: [], auto }, TODAY, ratings, anchorPrices).some(a => a.kind === 'buy-zone')).toBe(true)
  })

  it('港股代码按 5 位对齐自动 DCF；未收录的公司没有公司页链接', () => {
    const auto = parseAutoSummary(AUTO)!
    const items = [item('hk', '700', { alert: rule({ currency: 'HKD', threshold: 450, anchor: { type: 'manual', value: 420, asOf: '2026-11-01' } }) })]
    const [hit] = evaluateDigest(items, TODAY, auto, {})
    expect(hit).toMatchObject({ kind: 'price-hit', name: '', companyUrl: null, dataDate: '2026-11-13' })
    expect(composeDigest([hit], TODAY).text).toContain('- 700 · 港股')
  })

  it('上一次定时运行日：北京周二至周六', () => {
    expect(previousRunDay('2026-11-17')).toBe('2026-11-14') // 周二 ← 周六
    expect(previousRunDay('2026-11-18')).toBe('2026-11-17')
  })
})
