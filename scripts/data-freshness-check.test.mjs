import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  isTradingDay, latestReadySession, tradingDaysBetween, recentTradingDays,
} from './lib/trading-calendar.mjs'
import {
  ALLOWLIST, applyAllowlist, checkWorkflows, dispatchDelays, expectedReportPeriod, firesBetween, judgeCollection, judgeDate,
  judgeWorkflow, listScheduledWorkflows, parseCron, renderMarkdown, runFreshnessCheck, scheduleDelays,
} from './data-freshness-check.mjs'

globalThis.fetch = async () => { throw new Error('Network forbidden in offline tests') }
const noGh = () => { const e = new Error('gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable'); throw e }

// 周六 07:30 北京时间：三市场最近已落地交易日都是周五 2026-11-13
const NOW = new Date('2026-11-14T23:30:00Z')

// ---------------------------------------------------------------- fixture repo

const US_KEYS = ['gdp', 'unrate', 'sahm', 'claims', 'corePce', 'realRate', 'curve', 'hy', 'nfci', 'vix', 'dd', 'kre', 'marginGdp', 'cashDebt', 'equityShare', 'buffett', 'debtService', 'ccDelinq', 'tenYear', 'saving', 'dxy', 'gold', 'silver', 'wti']
const CN_KEYS = ['gdp', 'pmi', 'nmpmi', 'cpi', 'ppi', 'ip', 'm1m2', 'lpr', 'marginGdp', 'marginMcap']
const HK_KEYS = ['hsiDd', 'hsi12m', 'hkd', 'fed', 'south']
const VALUE = { hy: 300, gold: 2000, silver: 30, wti: 70, dxy: 100, claims: 220, equityShare: 40, buffett: 150, debtService: 10, pmi: 50, nmpmi: 50, hkd: 7.8 }
const macro = (keys, date) => ({ series: Object.fromEntries(keys.map(k => [k, { latest: { date, value: VALUE[k] ?? 5 } }])) })
const anchor = date => [['价格锚点', `1.00（${date}T16:00:00+08:00；腾讯延迟行情）`]]

function healthyFiles(day = '2026-11-13') {
  const cnDays = recentTradingDays('cn', day, 12)
  return {
    'public/data/us.json': [{ code: 'AAA', metrics: anchor(day) }, { code: 'BBB', metrics: anchor(day) }],
    'public/data/cn.json': [{ code: '000001', metrics: anchor(day) }],
    'public/data/hk.json': [{ code: '00001', metrics: anchor(day) }],
    'public/data/adr.json': [{ code: 'TSM', metrics: anchor(day) }],
    'src/data/companyMarketSnapshot.json': { 'us:AAA': { date: day }, 'cn:000001': { date: day }, 'hk:00001': { date: day } },
    'public/data/lynch.json': { 'us:AAA': { peAsOf: day }, 'cn:000001': { peAsOf: day } },
    'public/data/company-valuations/us.json': { asOf: day, records: [{ key: 'us:AAA', price: { date: day } }, { key: 'us:BBB', price: null }] },
    'public/data/daily-analysis.json': { schemaVersion: 1, snapshots: cnDays.map(d => ({ dataDate: d, session: 'closed' })) },
    'public/data/macro-us.json': macro(US_KEYS, '2026-11-12'),
    'public/data/macro-cn.json': macro(CN_KEYS, '2026-11-12'),
    'public/data/macro-hk.json': macro(HK_KEYS, '2026-11-12'),
    'public/data/market-cycle.json': { markets: { csi300: { week: [{ date: day }] }, spx: { week: [{ date: day }] } } },
    'public/data/market-cycle-auto.json': { facts: [
      { market: 'csi300', metricId: 'pe', frequency: 'daily', kind: 'observed', observationDate: '2026-11-11' },
      { market: 'csi300', metricId: 'pe', frequency: 'daily', kind: 'observed', observationDate: '2026-10-01' },
      { market: 'spx', metricId: 'fwd_pe', frequency: 'weekly', kind: 'observed', observationDate: '2026-08-05' },
      { market: 'hsi', metricId: 'pe', frequency: 'monthly', kind: 'observed', observationDate: '2026-10-30' },
      // FRED H.10 is published every Monday through the prior Friday: an 8-day-old Friday is the normal state.
      { market: 'all', metricId: 'hkd', frequency: 'daily', kind: 'observed', observationDate: '2026-11-06' },
      { market: 'hsi', metricId: 'pe_history_5y_percentile', frequency: 'daily', kind: 'observed', observationDate: '2026-10-30' },
    ] },
    'public/data/market-cycle-breadth.json': { markets: { csi300: { observationDate: '2026-11-06' } } },
    'public/data/market-cycle-hk-pe-history.json': { rows: [{ date: '2026-10-31' }] },
    'public/data/market-cycle-report.json': { issues: [], records: [{ weekEnding: '2026-11-14' }] },
    'public/data/index-history.json': { indexes: {
      spx: { group: '美股', latest: { date: day }, fpe: [['2026-11-01', 17]] },
      hsi: { group: '港股', latest: { date: day }, fpe: [] },
      csi300: { group: 'A 股', latest: { date: day } },
    } },
    'public/data/equity-bond-spread.json': { rows: [['2026-11-13', 6.1, 4000]] },
    'public/data/us-equity-bond-spread.json': { latestYield: { date: '2026-11-12', value: 4.8 }, latestReal: { date: '2026-11-12', value: 2.6 }, rows: [['2026-08-05', 0.3]] },
    'public/data/etf-technical-latest.json': { asOf: '2026-11-14', records: [{ code: '510300', asOf: day }], errors: [] },
    'public/data/national-team/meta.json': { reportDate: '2026-09-30' },
    'public/data/national-team/etf.json': { meta: { latestDate: '2025-12-31', priceAsOf: day } },
    'public/data/signal-ledger-2026.json': { schemaVersion: 1, snapshots: { '2026-11-06': {}, [day]: {} } },
    'public/data/rating-review.json': { schemaVersion: 1, asOf: day },
    'public/data/market-cycle-backtest.json': { schemaVersion: 1, asOf: day },
    'public/data/earnings-calendar.json': { schemaVersion: 1, generatedAt: '2026-11-14T12:22:01Z', sources: {
      yahoo: { ok: true, fetchedAt: '2026-11-14T12:22:02Z', error: null },
      hkex: { ok: true, fetchedAt: '2026-11-14T12:22:01Z', error: null },
      cnAppoint: { ok: true, fetchedAt: '2026-11-14T12:22:01Z', error: null },
      cnConsensus: { ok: null, fetchedAt: null, error: '本次未运行' },
    }, items: [] },
    'public/data/dcf-prefill.json': { riskFree: { cn: { date: '2026-11-11', label: '中国10年期国债' } }, issues: [], items: [{ m: 'cn', c: '000001', pxDate: day }] },
    '.github/workflows/demo.yml': "name: Demo job\non:\n  schedule:\n    - cron: '40 10 * * 1-5'\n",
    '.github/workflows/data-freshness.yml': "name: Monitor\non:\n  schedule:\n    - cron: '20 23 * * *'\n",
  }
}

async function withRepo(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'freshness-'))
  try {
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true })
      writeFileSync(join(root, rel), typeof body === 'string' ? body : JSON.stringify(body))
    }
    return await fn(root)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

// ---------------------------------------------------------------- calendar

test('trading calendar: weekends, SSE holidays, NYSE holidays and ready cut-off', () => {
  assert.equal(isTradingDay('cn', '2026-10-05'), false) // 国庆
  assert.equal(isTradingDay('cn', '2026-10-09'), true)
  assert.equal(isTradingDay('us', '2026-11-26'), false) // 感恩节
  assert.equal(isTradingDay('hk', '2026-11-14'), false) // 周六
  assert.equal(latestReadySession('cn', new Date('2026-11-13T09:00:00Z')), '2026-11-12') // 北京 17:00，未到 18:00
  assert.equal(latestReadySession('cn', new Date('2026-11-13T10:30:00Z')), '2026-11-13')
  assert.equal(latestReadySession('us', new Date('2026-11-13T23:30:00Z')), '2026-11-12') // 纽约 18:30，未到 19:00
  assert.equal(latestReadySession('us', new Date('2026-11-14T01:00:00Z')), '2026-11-13')
  assert.equal(latestReadySession('cn', NOW), '2026-11-13')
  assert.equal(tradingDaysBetween('cn', '2026-09-30', '2026-10-09'), 2) // 休市 10-01～10-07，只算 10-08、10-09
  assert.equal(tradingDaysBetween('us', '2026-11-25', '2026-11-27'), 1)
  assert.equal(tradingDaysBetween('cn', '2026-11-13', '2026-11-13'), 0)
})

// ---------------------------------------------------------------- judging

test('judgeDate counts market trading days and flags missing / future dates', () => {
  const ok = judgeDate({ observed: '2026-11-10', market: 'cn', unit: 'trading', max: 3, now: NOW })
  assert.deepEqual([ok.lag, ok.status, ok.expected], [3, 'ok', '2026-11-13'])
  assert.equal(judgeDate({ observed: '2026-11-09', market: 'cn', unit: 'trading', max: 3, now: NOW }).status, 'stale')
  assert.equal(judgeDate({ observed: null, unit: 'days', max: 3, now: NOW }).status, 'error')
  assert.equal(judgeDate({ observed: '2026-12-31', market: 'us', unit: 'trading', max: 3, now: NOW }).status, 'error')
  const days = judgeDate({ observed: '2026-11-01', unit: 'days', max: 10, now: NOW })
  assert.deepEqual([days.lag, days.status], [13, 'stale'])
})

test('judgeCollection: newest date drives status; a small stale share warns, a large one alarms', () => {
  const base = { id: 'x', group: 'g', label: 'l' }
  const threshold = { unit: 'trading', max: 3 }
  const fresh = Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, date: '2026-11-13' }))
  assert.equal(judgeCollection({ base, entries: fresh, market: 'us', threshold, now: NOW }).status, 'ok')
  const oneOld = [...fresh, { key: 'old', date: '2026-10-30' }]
  const warn = judgeCollection({ base, entries: oneOld, market: 'us', threshold, now: NOW })
  assert.equal(warn.status, 'warn')
  assert.match(warn.detail, /old\(2026-10-30\)/)
  const many = [...fresh.slice(0, 5), ...Array.from({ length: 5 }, (_, i) => ({ key: `o${i}`, date: '2026-10-30' }))]
  assert.equal(judgeCollection({ base, entries: many, market: 'us', threshold, now: NOW }).status, 'stale')
  const allOld = fresh.map(e => ({ ...e, date: '2026-11-06' }))
  assert.equal(judgeCollection({ base, entries: allOld, market: 'us', threshold, now: NOW }).status, 'stale')
  assert.equal(judgeCollection({ base, entries: [], market: 'us', threshold, now: NOW }).status, 'error')
})

test('allowlist acknowledges only matching, unexpired entries with the recorded observation date', () => {
  const allow = [{ id: 'a.*', observedDate: '2026-08-05', until: '2027-01-01', reason: '源停更' }, { id: 'b', until: '2026-11-01', reason: '已过期' }]
  const out = applyAllowlist([
    { id: 'a.one', status: 'stale', observed: '2026-08-05' },
    { id: 'a.two', status: 'stale', observed: '2026-09-01' }, // 序列动过又停住：重新告警
    { id: 'b', status: 'stale', observed: '2026-01-01' }, // 白名单过期
    { id: 'a.three', status: 'error', observed: '2026-08-05' }, // 错误不吃白名单
  ], allow, NOW)
  assert.deepEqual(out.map(i => i.status), ['known', 'stale', 'stale', 'error'])
  assert.equal(out[0].ackReason, '源停更')
  assert.ok(ALLOWLIST.every(a => a.reason && a.until), '每条白名单都要写原因和到期日')
})

test('expected report period follows disclosure deadlines plus slack', () => {
  const stock = [{ period: '03-31', deadline: '04-30' }, { period: '06-30', deadline: '08-31' }, { period: '09-30', deadline: '10-31' }, { period: '12-31', deadline: '04-30', nextYear: true }]
  const fund = [{ period: '06-30', deadline: '08-31' }, { period: '12-31', deadline: '03-31', nextYear: true }]
  assert.equal(expectedReportPeriod('2026-11-14', stock), '2026-09-30')
  assert.equal(expectedReportPeriod('2026-11-10', stock), '2026-06-30')
  assert.equal(expectedReportPeriod('2026-05-20', stock), '2026-03-31')
  assert.equal(expectedReportPeriod('2026-11-14', fund), '2026-06-30')
  assert.equal(expectedReportPeriod('2026-04-10', fund), '2025-06-30')
  assert.equal(expectedReportPeriod('2026-04-20', fund), '2025-12-31')
})

// ---------------------------------------------------------------- cron & workflows

test('cron parsing and fire enumeration (UTC, weekday ranges, lists)', () => {
  const c = parseCron('15 7,19 * * 1-5')
  assert.deepEqual([...c.hour], [7, 19])
  assert.deepEqual([...c.dow], [1, 2, 3, 4, 5])
  const fires = firesBetween(['40 10 * * 1-5'], new Date('2026-11-13T00:00:00Z'), new Date('2026-11-16T23:59:00Z'))
  assert.deepEqual(fires.map(f => f.toISOString()), ['2026-11-13T10:40:00.000Z', '2026-11-16T10:40:00.000Z'])
  assert.equal(firesBetween(['0 6 16 * *'], new Date('2026-11-01T00:00:00Z'), new Date('2026-11-30T00:00:00Z')).length, 1)
  assert.throws(() => parseCron('* * *'))
})

test('schedule delays pair runs with fires FIFO and survive dropped fires', () => {
  const crons = ['35 7 * * 1-5', '10 9 * * 1-5']
  const runs = [
    { event: 'schedule', createdAt: '2026-11-12T15:40:00Z' }, // 07:35 的 +8h05
    { event: 'schedule', createdAt: '2026-11-12T17:10:00Z' }, // 09:10 的 +8h00
    // 11-13 两次触发都被 GitHub 丢弃
    { event: 'schedule', createdAt: '2026-11-16T15:40:00Z' }, // 11-16 07:35 的 +8h05，不应错配到 11-13
    { event: 'workflow_dispatch', createdAt: '2026-11-16T16:00:00Z' },
  ]
  const delays = scheduleDelays(crons, runs)
  assert.deepEqual(delays.map(d => d.delayMinutes), [485, 480, 485])
  // 8 小时一触发、丢掉一次后不会把后续运行都错配到更早的触发
  const keep = scheduleDelays(['23 0,8,16 * * *'], [
    { event: 'schedule', createdAt: '2026-11-13T06:50:00Z' },
    { event: 'schedule', createdAt: '2026-11-14T06:47:00Z' },
  ])
  assert.deepEqual(keep.map(d => d.delayMinutes), [387, 384])
})

test('judgeWorkflow: failure alarms, recovered failure notes, disabled alarms, missed schedule warns', () => {
  const wf = { file: 'demo.yml', name: 'Demo', crons: ['40 10 * * 1-5'] }
  const run = (createdAt, conclusion, event = 'schedule') => ({ createdAt, conclusion, status: 'completed', event, url: `u/${createdAt}` })
  const failed = judgeWorkflow(wf, [run('2026-11-13T18:00:00Z', 'failure'), run('2026-11-12T18:00:00Z', 'success')], NOW)
  assert.equal(failed.status, 'stale')
  assert.equal(failed.delay.last, 440)
  const recovered = judgeWorkflow(wf, [run('2026-11-13T18:00:00Z', 'success'), run('2026-11-12T18:35:00Z', 'failure')], NOW)
  assert.equal(recovered.status, 'ok')
  assert.match(recovered.detail, /失败 1 次/)
  assert.equal(judgeWorkflow(wf, [run('2026-11-13T18:00:00Z', 'success')], NOW, { state: 'disabled_inactivity' }).status, 'stale')
  const missed = judgeWorkflow(wf, [run('2026-11-11T18:00:00Z', 'success')], new Date('2026-11-14T12:00:00Z'))
  assert.equal(missed.status, 'warn')
  assert.match(missed.detail, /2026-11-13T10:40Z/)
  const brandNew = judgeWorkflow({ ...wf, crons: ['0 6 16 * *'] }, [], NOW, { state: 'active', createdAt: '2026-10-25T10:00:00Z' })
  assert.equal(brandNew.status, 'ok')
})

test('checkWorkflows skips gracefully without gh and flags workflows missing on the default branch', () => withRepo(healthyFiles(), root => {
  assert.match(checkWorkflows(root, NOW, { gh: noGh }).skipped, /gh 不可用/)
  assert.equal(checkWorkflows(root, NOW, { skip: true }).workflows.length, 0)
  const notPushed = checkWorkflows(root, NOW, { gh: args => (args[0] === 'api' ? '[]' : '[]') })
  assert.equal(notPushed.workflows.length, 1, 'data-freshness.yml itself is excluded')
  assert.match(notPushed.workflows[0].detail, /远端默认分支尚无/)
}))

test('Vercel Cron dispatch: vercel.json crons map to workflows, dispatch delays pair within 2h, on-time dispatch satisfies the schedule check', () => withRepo({
  ...healthyFiles(),
  'vercel.json': { crons: [
    { path: '/api/market-data/cron-dispatch?workflow=demo.yml', schedule: '0 22 * * 1-5' },
    { path: '/api/market-data/cron-dispatch?workflow=only-vercel.yml', schedule: '0 8 * * 1-5' },
    { path: '/api/other', schedule: '0 1 * * *' },
  ] },
  '.github/workflows/only-vercel.yml': 'name: Only Vercel\non:\n  workflow_dispatch:\n',
}, root => {
  const listed = listScheduledWorkflows(root)
  assert.deepEqual(listed.map(w => [w.file, w.crons, w.dispatchCrons]), [
    ['demo.yml', ['40 10 * * 1-5'], ['0 22 * * 1-5']],
    ['only-vercel.yml', [], ['0 8 * * 1-5']],
  ])
  const crons = ['0 22 * * 1-5']
  const delays = dispatchDelays(crons, [
    { event: 'workflow_dispatch', createdAt: '2026-11-12T22:41:00Z' }, // Hobby 小时内抖动
    { event: 'workflow_dispatch', createdAt: '2026-11-13T15:00:00Z' }, // 手动触发，配不上
    { event: 'schedule', createdAt: '2026-11-13T04:00:00Z' },
    { event: 'workflow_dispatch', createdAt: '2026-11-13T22:03:00Z' },
  ])
  assert.deepEqual(delays.map(d => d.delayMinutes), [41, 3])
  assert.deepEqual(dispatchDelays([], [{ event: 'workflow_dispatch', createdAt: '2026-11-13T22:03:00Z' }]), [])

  const wf = { file: 'demo.yml', name: 'Demo', crons: ['0 22 * * 1-5'], dispatchCrons: crons }
  const run = (createdAt, event, conclusion = 'success') => ({ createdAt, event, conclusion, status: 'completed', url: `u/${createdAt}` })
  // GitHub 兜底排程被丢弃，但 Vercel 准点派发了：不提示
  const onTime = judgeWorkflow(wf, [run('2026-11-13T22:04:00Z', 'workflow_dispatch'), run('2026-11-12T22:02:00Z', 'workflow_dispatch')], NOW)
  assert.equal(onTime.status, 'ok', onTime.detail)
  assert.deepEqual(onTime.dispatchDelay, { last: 4, median: 2, max: 4, samples: 2 })
  // Vercel 没派发（环境变量未配置），只有迟到的 GitHub 兜底排程：提示去看 Vercel 日志
  const missing = judgeWorkflow(wf, [run('2026-11-14T05:30:00Z', 'schedule'), run('2026-11-13T05:10:00Z', 'schedule')], NOW)
  assert.equal(missing.status, 'warn')
  assert.match(missing.detail, /Vercel Cron 2026-11-13T22:00Z/)
  // 派发端因 6 小时内已成功而跳过时，触发前的运行也算数
  const skipped = judgeWorkflow(wf, [run('2026-11-13T19:00:00Z', 'workflow_dispatch')], NOW)
  assert.doesNotMatch(skipped.detail ?? '', /Vercel Cron/)
  // 没配 Vercel Cron 的工作流：手动 workflow_dispatch 不能顶替定时运行
  const plain = judgeWorkflow({ ...wf, dispatchCrons: [] }, [run('2026-11-14T10:00:00Z', 'workflow_dispatch')], NOW)
  assert.match(plain.detail, /24 小时内没有定时运行/)
  assert.match(renderMarkdown({ checkedAt: NOW.toISOString(), alarm: false, counts: {}, items: [], workflows: [onTime], workflowsSkipped: null, fingerprint: 'x' }), /0 22 \* \* 1-5 · 0h02m \/ 0h04m/)
}))

// ---------------------------------------------------------------- end to end on fixture repos

test('healthy fixture: no alarm; known source stops are acknowledged, not alarmed', async () => {
  await withRepo(healthyFiles(), async root => {
    const gh = args => (args[0] === 'api'
      ? JSON.stringify([{ path: '.github/workflows/demo.yml', state: 'active', createdAt: '2026-10-01T00:00:00Z' }])
      : JSON.stringify([{ createdAt: '2026-11-13T18:03:00Z', conclusion: 'success', status: 'completed', event: 'schedule', url: 'u' }]))
    const result = await runFreshnessCheck({ root, now: NOW, gh })
    const bad = result.items.filter(i => i.status === 'stale' || i.status === 'error')
    assert.deepEqual(bad.map(i => `${i.id}: ${i.detail}`), [])
    assert.equal(result.alarm, false)
    const known = result.items.filter(i => i.status === 'known').map(i => i.id).sort()
    assert.deepEqual(known, ['cycle.fact.hsi.pe_history_5y_percentile', 'cycle.fact.spx.fwd_pe', 'nationalTeam.etfHolders', 'spread.us.forwardPe'])
    assert.equal(result.items.find(i => i.id === 'cycle.fact.all.hkd').status, 'ok')
    assert.equal(result.workflows[0].delay.last, 443)
    const md = renderMarkdown(result)
    assert.match(md, /结论：正常/)
    assert.match(md, /已知停更/)
    assert.match(md, /freshness-fingerprint: [0-9a-f]{12}/)
  })
})

test('2026-11-12 style incident: missing daily snapshot, stale quotes and broken file raise an alarm', async () => {
  const files = healthyFiles()
  files['public/data/daily-analysis.json'].snapshots = files['public/data/daily-analysis.json'].snapshots.filter(s => s.dataDate !== '2026-11-12')
  files['public/data/us.json'] = [{ code: 'AAA', metrics: anchor('2026-11-06') }]
  files['public/data/lynch.json'] = '{not json'
  files['public/data/macro-us.json'].series.vix.latest.date = '2026-10-01'
  await withRepo(files, async root => {
    const result = await runFreshnessCheck({ root, now: NOW, skipGh: true })
    assert.equal(result.alarm, true)
    const status = Object.fromEntries(result.items.map(i => [i.id, i.status]))
    assert.equal(status['dailyAnalysis.latest'], 'ok')
    assert.equal(status['dailyAnalysis.gaps'], 'stale')
    assert.equal(status['quotes.us'], 'stale')
    assert.equal(status['lynch.load'], 'error')
    assert.equal(status['macro.us.vix'], 'stale')
    assert.ok(result.alarmIds.includes('dailyAnalysis.gaps'))
    const md = renderMarkdown(result)
    assert.match(md, /结论：告警/)
    assert.match(md, /缺 2026-11-12/)
    assert.match(md, /未查询：已按 --no-gh 跳过/)
  })
})

test('daily analysis behind the latest A-share session alarms even when nothing else is wrong', async () => {
  const files = healthyFiles()
  files['public/data/daily-analysis.json'].snapshots = files['public/data/daily-analysis.json'].snapshots.filter(s => s.dataDate !== '2026-11-13')
  await withRepo(files, async root => {
    const result = await runFreshnessCheck({ root, now: NOW, skipGh: true })
    const latest = result.items.find(i => i.id === 'dailyAnalysis.latest')
    assert.deepEqual([latest.status, latest.observed, latest.expected, latest.lag], ['stale', '2026-11-12', '2026-11-13', 1])
  })
})

test('FRED HKD uses its weekly-release lag; a missed Monday release still alarms', async () => {
  const files = healthyFiles()
  files['public/data/market-cycle-auto.json'].facts.find(f => f.metricId === 'hkd').observationDate = '2026-10-30'
  await withRepo(files, async root => {
    const result = await runFreshnessCheck({ root, now: NOW, gh: null })
    assert.equal(result.items.find(i => i.id === 'cycle.fact.all.hkd').status, 'stale')
  })
})

test('earnings calendar: each source fetchedAt within 3 days; a failed source keeps its old date and goes stale', async () => {
  const files = healthyFiles()
  files['public/data/earnings-calendar.json'].sources.hkex = { ok: false, fetchedAt: '2026-11-10T12:00:00Z', error: 'HTTP 503' }
  files['public/data/earnings-calendar.json'].sources.cnAppoint = { ok: true, fetchedAt: '2026-11-11T23:10:00Z', error: null }
  await withRepo(files, async root => {
    const result = await runFreshnessCheck({ root, now: NOW, gh: noGh })
    const byId = id => result.items.find(i => i.id === id)
    assert.deepEqual([byId('earnings.yahoo').status, byId('earnings.yahoo').lag], ['ok', 0])
    assert.deepEqual([byId('earnings.cnAppoint').status, byId('earnings.cnAppoint').lag], ['ok', 3])
    assert.deepEqual([byId('earnings.hkex').status, byId('earnings.hkex').lag], ['stale', 4])
    assert.match(byId('earnings.hkex').detail, /HTTP 503/)
    assert.ok(result.alarmIds.includes('earnings.hkex'))
    assert.equal(result.items.some(i => i.id === 'earnings.cnConsensus'), false)
  })
  delete files['public/data/earnings-calendar.json']
  await withRepo(files, async root => {
    const result = await runFreshnessCheck({ root, now: NOW, gh: noGh })
    assert.equal(result.items.find(i => i.id === 'earnings.load').status, 'error')
  })
})

test('method reviews: rating review lagging the ledger warns; a stale backtest alarms', async () => {
  const files = healthyFiles()
  files['public/data/rating-review.json'] = { schemaVersion: 1, asOf: '2026-11-06' }
  files['public/data/market-cycle-backtest.json'] = { schemaVersion: 1, asOf: '2026-10-23' }
  await withRepo(files, async root => {
    const result = await runFreshnessCheck({ root, now: NOW, gh: noGh })
    const byId = id => result.items.find(i => i.id === id)
    assert.equal(byId('review.signalLedger').status, 'ok')
    assert.equal(byId('review.rating').status, 'warn')
    assert.match(byId('review.rating').detail, /落后于台账/)
    assert.equal(byId('review.cycleBacktest').status, 'stale')
    assert.ok(result.alarmIds.includes('review.cycleBacktest'))
  })
})
