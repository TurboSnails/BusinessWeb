import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { assessSeries, buildSeries, crossCheck, dividendState, fetchTencentWithFallback, mergeIndex, tencentRows } from './portfolio-prices.mjs'

test('crossCheck 通过：最近 2 年日期一致且收盘差异 ≤0.5%', () => {
  const rows = [['2025-01-02', 100, 100], ['2025-01-03', 101, 101]]
  assert.deepEqual(crossCheck(rows, rows, { asOf: '2025-01-03' }), { ok: true, mismatches: 0, reason: null })
})

test('crossCheck 失败：某日差 1%', () => {
  const actual = crossCheck([['2025-01-02', 100, 100]], [['2025-01-02', 101, 101]], { asOf: '2025-01-02' })
  assert.equal(actual.ok, false)
  assert.ok(actual.mismatches >= 1)
})

test('buildSeries 按 validFrom 截断并升序', () => {
  const series = buildSeries([['2021-08-26', 11, 11], ['2021-08-24', 9, 9], ['2021-08-25', 10, 10]], { validFrom: '2021-08-25' })
  assert.equal(series.dates[0], '2021-08-25')
  assert.deepEqual(series.dates, ['2021-08-25', '2021-08-26'])
})

test('单日复权收益超过 ±50% 且不在 knownEvents 中则标记 stale', () => {
  assert.equal(assessSeries({ dates: ['2022-01-01', '2022-01-02'], adjClose: [100, 160] }).status, 'stale')
})

test('核对失败的代码保留上次文件，index 标 stale 并写原因', () => {
  const index = mergeIndex({ schemaVersion: 1, items: [{ symbol: 'AVGO', name: '博通', group: 'growth', first: '2020-01-01', last: '2025-01-01', asOf: '2025-01-01', status: 'ok', dividendStatus: 'ok' }] }, [{ symbol: 'AVGO', name: '博通', group: 'growth', status: 'stale', statusNote: '交叉核对：差异' }])
  assert.equal(index.items[0].status, 'stale')
  assert.match(index.items[0].statusNote, /交叉核对/)
})

test('分红：历史有分红但本次未返回 → missing；从未分红 → none', () => {
  assert.equal(dividendState({ dividends: [['2024-01-01', 1]] }, []), 'missing')
  assert.equal(dividendState(null, []), 'none')
})

test('Tencent 的非 JSON 响应重试两次后成功', async () => {
  let calls = 0
  const sleeps = []
  let clock = 0
  const fetchImpl = async () => {
    calls++
    if (calls < 3) return { ok: true, status: 200, text: async () => '<html>not JSON</html>' }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { 'usAVGO.OQ': { day: [['2026-01-02', '1', '100', '101', '99', '5']] } } }) }
  }
  const rows = await tencentRows('usAVGO.OQ', '2026-01-01', '2026-01-03', { fetchImpl, sleep: async ms => { sleeps.push(ms); clock += ms }, now: () => clock, warn: () => {} })
  assert.deepEqual(rows, [['2026-01-02', 100]])
  assert.equal(calls, 3)
  assert.deepEqual(sleeps, [3000, 3000])
})

test('Tencent 代码配置失败时按 .OQ、.N、.AM 回退并记录成功后缀', async () => {
  const requested = []
  const logs = []
  const fetchImpl = async url => {
    const code = new URL(url).searchParams.get('param').split(',')[0]
    requested.push(code)
    if (code !== 'usPLTR.OQ') throw new Error('no data')
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { [code]: { day: [['2026-01-02', '1', '100', '101', '99', '5']] } } }) }
  }
  let clock = 0
  const { symbol } = await fetchTencentWithFallback('usPLTR.N', '2026-01-01', '2026-01-03', { fetchImpl, sleep: async ms => { clock += ms }, now: () => clock, log: line => logs.push(line), warn: () => {} })
  assert.equal(symbol, 'usPLTR.OQ')
  assert.deepEqual(requested, ['usPLTR.N', 'usPLTR.N', 'usPLTR.N', 'usPLTR.OQ'])
  assert.match(logs[0], /usPLTR.N → usPLTR.OQ/)
})

test('腾讯不可用时仍写入 Yahoo 数据并标记 crossCheck unavailable', async () => {
  const out = await mkdtemp(join(tmpdir(), 'portfolio-prices-no-tencent-'))
  const oldCommand = process.env.PORTFOLIO_YF_CMD
  process.env.PORTFOLIO_YF_CMD = 'node scripts/fixtures/fake-yf.mjs'
  try {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: {} }) })
    await (await import('./portfolio-prices.mjs')).main(['--out', out], { fetchImpl, sleep: async () => {}, warn: () => {} })
    const index = JSON.parse(await readFile(join(out, 'index.json'), 'utf8'))
    assert.deepEqual(index.items.map(i => i.crossCheck), ['unavailable', 'unavailable', 'unavailable'])
    assert.ok(index.items.every(i => i.status === 'ok'))
    const body = JSON.parse(await readFile(join(out, 'AVGO.json'), 'utf8'))
    assert.equal(body.source.crossCheck, '交叉核对暂不可用（腾讯无响应），仅 Yahoo')
  } finally {
    if (oldCommand === undefined) delete process.env.PORTFOLIO_YF_CMD
    else process.env.PORTFOLIO_YF_CMD = oldCommand
    await rm(out, { recursive: true, force: true })
  }
})

test('腾讯数据不一致时不写入并将 index 标 stale', async () => {
  const out = await mkdtemp(join(tmpdir(), 'portfolio-prices-mismatch-'))
  const oldCommand = process.env.PORTFOLIO_YF_CMD
  const oldExitCode = process.exitCode
  process.env.PORTFOLIO_YF_CMD = 'node scripts/fixtures/fake-yf.mjs'
  try {
    const indexItems = ['AVGO', 'META', 'MSFT'].map(symbol => ({ symbol, name: symbol, group: 'growth', first: '2020-01-01', last: '2025-01-01', asOf: '2025-01-01', status: 'ok', dividendStatus: 'none' }))
    await import('node:fs/promises').then(({ writeFile }) => writeFile(join(out, 'index.json'), JSON.stringify({ schemaVersion: 1, items: indexItems })))
    await import('node:fs/promises').then(({ writeFile }) => writeFile(join(out, 'AVGO.json'), '{"symbol":"AVGO","sentinel":"keep"}'))
    const fetchImpl = async url => {
      const [symbol] = new URL(url).searchParams.get('param').split(',')
      const closes = symbol === 'usAVGO.OQ' ? [101, 101, 102] : [100, 101, 102]
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { [symbol]: { day: [['2024-01-02', '1', String(closes[0])], ['2024-01-03', '1', String(closes[1])], ['2024-01-04', '1', String(closes[2])]] } } }) }
    }
    await (await import('./portfolio-prices.mjs')).main(['--out', out], { fetchImpl, sleep: async () => {}, warn: () => {} })
    const index = JSON.parse(await readFile(join(out, 'index.json'), 'utf8'))
    assert.equal(index.items.find(i => i.symbol === 'AVGO').status, 'stale')
    assert.match(index.items.find(i => i.symbol === 'AVGO').statusNote, /交叉核对/)
    assert.equal(await readFile(join(out, 'AVGO.json'), 'utf8'), '{"symbol":"AVGO","sentinel":"keep"}')
    assert.equal(index.items.find(i => i.symbol === 'META').crossCheck, 'ok')
  } finally {
    if (oldCommand === undefined) delete process.env.PORTFOLIO_YF_CMD
    else process.env.PORTFOLIO_YF_CMD = oldCommand
    process.exitCode = oldExitCode
    await rm(out, { recursive: true, force: true })
  }
})

test('腾讯参数包含末尾逗号且不复权参数位留空', async () => {
  let param
  const fetchImpl = async url => {
    param = new URL(url).searchParams.get('param')
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { 'usQQQ.OQ': { day: [['2026-01-02', '1', '100']] } } }) }
  }
  await tencentRows('usQQQ.OQ', '2026-01-01', '2026-01-03', { fetchImpl, sleep: async () => {}, warn: () => {} })
  assert.equal(param, 'usQQQ.OQ,day,2026-01-01,2026-01-03,2000,')
})

test('假采集命令只写入三个代码文件和 index.json', async () => {
  const out = await mkdtemp(join(tmpdir(), 'portfolio-prices-'))
  try {
    const result = spawnSync(process.execPath, ['scripts/portfolio-prices.mjs', '--out', out], { env: { ...process.env, PORTFOLIO_YF_CMD: 'node scripts/fixtures/fake-yf.mjs' }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const index = JSON.parse(await readFile(join(out, 'index.json'), 'utf8'))
    assert.deepEqual(index.items.map(i => i.symbol), ['AVGO', 'META', 'MSFT'])
    for (const symbol of ['AVGO', 'META', 'MSFT']) {
      const body = JSON.parse(await readFile(join(out, `${symbol}.json`), 'utf8'))
      assert.equal(body.schemaVersion, 1)
      assert.equal(body.symbol, symbol)
      assert.equal(body.dates.length, body.adjClose.length)
    }
  } finally { await rm(out, { recursive: true, force: true }) }
})
