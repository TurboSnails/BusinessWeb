// 单测：node --test server/functions/cron-dispatch.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { createCronDispatch, WORKFLOWS } from './cron-dispatch.js'
import marketRoute from '../../api/market-data/[marketRoute].js'

const NOW = new Date('2026-11-16T22:20:00Z')
const SECRET = 'cron-secret-0123456789'
const TOKEN = 'github_pat_fake_token'
const ENV = { CRON_SECRET: SECRET, GITHUB_DISPATCH_TOKEN: TOKEN }

const res = () => ({
  code: 200, body: null, headers: {},
  setHeader(k, v) { this.headers[k.toLowerCase()] = v },
  status(code) { this.code = code; return this },
  json(body) { this.body = body; return this },
})
const req = (workflow, { auth = `Bearer ${SECRET}`, method = 'GET' } = {}) => ({ method, headers: auth ? { authorization: auth } : {}, query: workflow ? { workflow } : {} })
const silent = { info() {}, warn() {}, error() {} }
const capture = () => { const lines = []; const push = (...a) => lines.push(a.join(' ')); return { lines, info: push, warn: push, error: push } }

/** 假 fetch：按 URL 路由，记录每次调用 */
function fakeFetch({ runs = [], listStatus = 200, dispatchStatus = 204, dispatchBody = null, throwOn = null } = {}) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url, init })
    if (throwOn && url.includes(throwOn)) throw Object.assign(new Error('boom'), { name: 'TypeError' })
    if (url.endsWith('/dispatches')) return { ok: dispatchStatus < 300, status: dispatchStatus, json: async () => dispatchBody ?? {} }
    if (url.includes('/runs?')) return { ok: listStatus < 300, status: listStatus, json: async () => ({ workflow_runs: runs }) }
    throw new Error(`unexpected url ${url}`)
  }
  return { impl, calls }
}
const run = (createdAt, status = 'completed', conclusion = 'success', event = 'schedule') => ({ id: 1, event, status, conclusion, created_at: createdAt, html_url: 'https://github.com/x' })

test('rejects non-GET, missing/wrong bearer, and fails loudly when CRON_SECRET is unset', async () => {
  const { impl, calls } = fakeFetch()
  const handler = createCronDispatch({ fetchImpl: impl, env: ENV, now: () => NOW, log: silent })
  for (const [request, code] of [
    [req('company-refresh.yml', { method: 'POST' }), 405],
    [req('company-refresh.yml', { auth: null }), 401],
    [req('company-refresh.yml', { auth: 'Bearer wrong' }), 401],
    [req('company-refresh.yml', { auth: SECRET }), 401],
  ]) {
    const r = res(); await handler(request, r)
    assert.equal(r.code, code)
    assert.equal(r.headers['cache-control'], 'no-store')
  }
  const log = capture()
  const unconfigured = createCronDispatch({ fetchImpl: impl, env: { GITHUB_DISPATCH_TOKEN: TOKEN }, now: () => NOW, log })
  const r = res(); await unconfigured(req('company-refresh.yml', { auth: 'Bearer ' }), r)
  assert.equal(r.code, 503)
  assert.match(r.body.error, /CRON_SECRET/)
  assert.match(log.lines.join('\n'), /CRON_SECRET 未配置/)
  assert.equal(calls.length, 0, 'no GitHub call before auth')
})

test('only allowlisted workflow files are dispatched', async () => {
  const { impl, calls } = fakeFetch()
  const handler = createCronDispatch({ fetchImpl: impl, env: ENV, now: () => NOW, log: silent })
  for (const workflow of [undefined, 'pages.yml', '../company-refresh.yml', 'toString', '__proto__', 'company-refresh.yml/../x']) {
    const r = res(); await handler(req(workflow), r)
    assert.equal(r.code, 400, String(workflow))
    assert.deepEqual(r.body.allowed, Object.keys(WORKFLOWS))
  }
  const r = res(); await handler({ ...req(), query: { workflow: ['company-refresh.yml'] } }, r)
  assert.equal(r.code, 400, 'array query param')
  assert.equal(calls.length, 0)
})

test('missing GITHUB_DISPATCH_TOKEN returns 503 and logs, without calling GitHub', async () => {
  const { impl, calls } = fakeFetch()
  const log = capture()
  const handler = createCronDispatch({ fetchImpl: impl, env: { CRON_SECRET: SECRET }, now: () => NOW, log })
  const r = res(); await handler(req('company-refresh.yml'), r)
  assert.equal(r.code, 503)
  assert.match(r.body.error, /GITHUB_DISPATCH_TOKEN/)
  assert.match(log.lines.join('\n'), /GITHUB_DISPATCH_TOKEN 未配置/)
  assert.equal(calls.length, 0)
})

test('dispatch request shape: runs lookup then POST {ref:main} with bearer PAT; token never logged or returned', async () => {
  const { impl, calls } = fakeFetch({ runs: [run('2026-11-16T06:10:00Z')] }) // 16 小时前的成功运行不在 6 小时窗口内
  const log = capture()
  const handler = createCronDispatch({ fetchImpl: impl, env: ENV, now: () => NOW, log })
  const r = res(); await handler(req('company-refresh.yml'), r)
  assert.equal(r.code, 200)
  assert.deepEqual(r.body, { ok: true, workflow: 'company-refresh.yml', dispatched: true, ref: 'main', at: NOW.toISOString(), duplicateCheck: 'ok' })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://api.github.com/repos/TurboSnails/BusinessWeb/actions/workflows/company-refresh.yml/runs?branch=main&per_page=10')
  const post = calls[1]
  assert.equal(post.url, 'https://api.github.com/repos/TurboSnails/BusinessWeb/actions/workflows/company-refresh.yml/dispatches')
  assert.equal(post.init.method, 'POST')
  assert.deepEqual(JSON.parse(post.init.body), { ref: 'main' })
  assert.equal(post.init.headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(post.init.headers.Accept, 'application/vnd.github+json')
  assert.equal(post.init.headers['X-GitHub-Api-Version'], '2022-11-28')
  assert.ok(post.init.headers['User-Agent'])
  assert.ok(!JSON.stringify(r.body).includes(TOKEN))
  assert.ok(!log.lines.join('\n').includes(TOKEN))
})

test('duplicate skip: active run always skips; recent success skips only where configured', async () => {
  const active = fakeFetch({ runs: [run('2026-11-16T22:05:00Z', 'in_progress', null, 'schedule')] })
  let r = res(); await createCronDispatch({ fetchImpl: active.impl, env: ENV, now: () => NOW, log: silent })(req('daily-analysis-snapshot.yml'), r)
  assert.equal(r.code, 200)
  assert.equal(r.body.dispatched, false)
  assert.match(r.body.skipped, /运行中/)
  assert.equal(active.calls.length, 1, 'no POST when skipping')

  const recent = fakeFetch({ runs: [run('2026-11-16T19:00:00Z')] }) // 3h20m 前成功
  r = res(); await createCronDispatch({ fetchImpl: recent.impl, env: ENV, now: () => NOW, log: silent })(req('company-refresh.yml'), r)
  assert.equal(r.body.dispatched, false)
  assert.match(r.body.skipped, /360 分钟内已有成功运行/)

  // 每日分析第二次核验不因第一次成功而跳过
  const daily = fakeFetch({ runs: [run('2026-11-16T21:30:00Z')] })
  r = res(); await createCronDispatch({ fetchImpl: daily.impl, env: ENV, now: () => NOW, log: silent })(req('daily-analysis-snapshot.yml'), r)
  assert.equal(r.body.dispatched, true)

  // 失败的近期运行不算
  const failed = fakeFetch({ runs: [run('2026-11-16T21:00:00Z', 'completed', 'failure')] })
  r = res(); await createCronDispatch({ fetchImpl: failed.impl, env: ENV, now: () => NOW, log: silent })(req('spread-snapshot.yml'), r)
  assert.equal(r.body.dispatched, true)
})

test('runs lookup failure falls back to dispatching; GitHub dispatch errors surface as 502', async () => {
  const log = capture()
  const noRead = fakeFetch({ listStatus: 403 })
  let r = res(); await createCronDispatch({ fetchImpl: noRead.impl, env: ENV, now: () => NOW, log })(req('etf-technical.yml'), r)
  assert.equal(r.body.dispatched, true)
  assert.match(r.body.duplicateCheck, /HTTP 403/)
  assert.match(log.lines.join('\n'), /去重检查不可用/)

  const offline = fakeFetch({ throwOn: '/runs?' })
  r = res(); await createCronDispatch({ fetchImpl: offline.impl, env: ENV, now: () => NOW, log: silent })(req('etf-technical.yml'), r)
  assert.equal(r.body.dispatched, true)

  const denied = fakeFetch({ dispatchStatus: 403, dispatchBody: { message: 'Resource not accessible by personal access token' } })
  r = res(); await createCronDispatch({ fetchImpl: denied.impl, env: ENV, now: () => NOW, log: silent })(req('company-refresh.yml'), r)
  assert.equal(r.code, 502)
  assert.match(r.body.error, /HTTP 403/)
  assert.match(r.body.githubMessage, /personal access token/)

  const down = fakeFetch({ throwOn: '/dispatches' })
  r = res(); await createCronDispatch({ fetchImpl: down.impl, env: ENV, now: () => NOW, log: silent })(req('company-refresh.yml'), r)
  assert.equal(r.code, 502)
})

test('every vercel.json cron-dispatch path names an allowlisted workflow file that exists; earnings calendar is scheduled daily', () => {
  const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
  const dispatched = vercel.crons.map(c => [new URL(c.path, 'https://x').searchParams.get('workflow'), c.schedule, c.path]).filter(([, , path]) => path.startsWith('/api/market-data/cron-dispatch'))
  for (const [workflow] of dispatched) {
    assert.ok(Object.hasOwn(WORKFLOWS, workflow), `${workflow} not in WORKFLOWS`)
    assert.ok(existsSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url)), `${workflow} missing`)
  }
  assert.deepEqual(dispatched.filter(([w]) => w === 'earnings-calendar.yml').map(([, s]) => s), ['0 23 * * *'])
  assert.deepEqual(WORKFLOWS['earnings-calendar.yml'], { skipIfSucceededWithinMinutes: 360 })
})

test('earnings calendar dispatch skips when a run succeeded within 6 hours', async () => {
  const recent = fakeFetch({ runs: [run('2026-11-16T19:00:00Z')] })
  let r = res(); await createCronDispatch({ fetchImpl: recent.impl, env: ENV, now: () => NOW, log: silent })(req('earnings-calendar.yml'), r)
  assert.equal(r.body.dispatched, false)
  const old = fakeFetch({ runs: [run('2026-11-15T23:10:00Z')] })
  r = res(); await createCronDispatch({ fetchImpl: old.impl, env: ENV, now: () => NOW, log: silent })(req('earnings-calendar.yml'), r)
  assert.equal(r.body.dispatched, true)
  assert.equal(old.calls.at(-1).url, 'https://api.github.com/repos/TurboSnails/BusinessWeb/actions/workflows/earnings-calendar.yml/dispatches')
})

test('shared market-data function routes cron-dispatch (unauthenticated request is rejected)', async () => {
  const saved = process.env.CRON_SECRET
  process.env.CRON_SECRET = SECRET
  try {
    const r = res(); await marketRoute({ method: 'GET', headers: {}, query: { marketRoute: 'cron-dispatch', workflow: 'company-refresh.yml' } }, r)
    assert.equal(r.code, 401)
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = saved
  }
})
