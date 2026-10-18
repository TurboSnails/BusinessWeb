import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { update } from './market-cycle-update.mjs'

const snapshot = (breadths, { eligible = 300, total = 300, issues = [], over = {} } = {}) => ({
  schemaVersion: 1, generatedAt: '2026-10-19T00:00:00Z',
  markets: Object.fromEntries(Object.entries(breadths).map(([m, b]) => [m, {
    universeId: `${m}-constituents`, eligible, total, breadth: b, priorBreadth: b === null ? null : 30.1,
    kind: 'observed', coverage: eligible / total, exclusions: { not_fetched: total - eligible }, ...over,
  }])),
  issues,
})

test('update: breadth fill stops as soon as all three markets are observed past the 95% threshold', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  const outFile = path.join(dir, 'breadth.json')
  const calls = []
  const run = async (name, opts) => {
    calls.push(name)
    if (name === 'market-cycle-breadth.mjs') await writeFile(outFile, JSON.stringify(snapshot({ csi300: 25.7, hsi: 31.6, hstech: 40.2 })))
    void opts
  }
  const result = await update(run, f => f, { outFile, deadlineMs: 60000 })
  assert.deepEqual(calls, ['market-cycle-snapshot.mjs', 'market-cycle-auto.mjs', 'market-cycle-breadth.mjs'])
  assert.deepEqual(result, [])
})

test('update: CSI alone qualifying is NOT done — HK still missing keeps the fill going until no progress', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  const outFile = path.join(dir, 'breadth.json')
  let breadthCalls = 0
  const run = async name => {
    if (name !== 'market-cycle-breadth.mjs') return
    breadthCalls++
    await writeFile(outFile, JSON.stringify(snapshot({ csi300: 25.7 }))) // hsi/hstech absent entirely
  }
  await update(run, f => f, { outFile, deadlineMs: 60000 })
  assert.equal(breadthCalls, 2)
})

test('update: proxy kind or sub-95% coverage is NOT done', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  const outFile = path.join(dir, 'breadth.json')
  let breadthCalls = 0
  const run = async name => {
    if (name !== 'market-cycle-breadth.mjs') return
    breadthCalls++
    // all three present but hsi is proxy: keep going until no progress
    await writeFile(outFile, JSON.stringify(snapshot({ csi300: 25.7, hsi: null, hstech: 40.2 }, { over: { kind: 'proxy' } })))
  }
  await update(run, f => f, { outFile, deadlineMs: 60000 })
  assert.equal(breadthCalls, 2)
})

test('update: stops after a no-progress round instead of burning the whole 480-request budget', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  const outFile = path.join(dir, 'breadth.json')
  let breadthCalls = 0
  const run = async name => {
    if (name !== 'market-cycle-breadth.mjs') return
    breadthCalls++
    await writeFile(outFile, JSON.stringify(snapshot({ csi300: null }, { eligible: 79 }))) // stuck at the same coverage
  }
  await update(run, f => f, { outFile, deadlineMs: 60000 })
  assert.equal(breadthCalls, 2) // second round confirms no progress, then stop
})

test('update: falling not_fetched counts as progress even when eligible is unchanged', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  const outFile = path.join(dir, 'breadth.json')
  let breadthCalls = 0
  const run = async name => {
    if (name !== 'market-cycle-breadth.mjs') return
    breadthCalls++
    const notFetched = [220, 180, 180][breadthCalls - 1] ?? 180
    await writeFile(outFile, JSON.stringify(snapshot({ csi300: null }, { eligible: 79, over: { exclusions: { not_fetched: notFetched } } })))
  }
  await update(run, f => f, { outFile, deadlineMs: 60000 })
  assert.equal(breadthCalls, 3) // round 3 repeats round 2's signature -> stop
})

test('update: a breaker trip ends the fill immediately', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  const outFile = path.join(dir, 'breadth.json')
  let breadthCalls = 0
  const run = async name => {
    if (name !== 'market-cycle-breadth.mjs') return
    breadthCalls++
    await writeFile(outFile, JSON.stringify({ ...snapshot({ hsi: null }, { eligible: 0, total: 95 }), issues: ['恒生指数日线连续失败5次，本轮熔断'] }))
  }
  await update(run, f => f, { outFile, deadlineMs: 60000 })
  assert.equal(breadthCalls, 1)
})

test('update: never crosses the clamped 12-round cap while breadth stays unreachable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  const outFile = path.join(dir, 'breadth.json')
  let breadthCalls = 0
  const run = async name => {
    if (name !== 'market-cycle-breadth.mjs') return
    breadthCalls++
    await writeFile(outFile, JSON.stringify(snapshot({ csi300: null }, { eligible: 100 + breadthCalls })))
  }
  await update(run, f => f, { outFile, deadlineMs: 60000, maxRounds: 500 }) // clamped to 12
  assert.equal(breadthCalls, 12)
})

test('update: each spawned round receives the remaining wall-clock budget as its hard timeout', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  const outFile = path.join(dir, 'breadth.json')
  const timeouts = []
  let breadthCalls = 0
  const run = async (name, opts = {}) => {
    if (name !== 'market-cycle-breadth.mjs') return
    timeouts.push(opts.timeoutMs)
    breadthCalls++
    await writeFile(outFile, JSON.stringify(snapshot({ csi300: null }, { eligible: 100 + breadthCalls })))
    await new Promise(r => setTimeout(r, 30))
  }
  await update(run, f => f, { outFile, deadlineMs: 1000 }) // clamped 8min ceiling irrelevant; real 1s budget
  assert.ok(breadthCalls >= 2)
  assert.ok(timeouts.every(t => t <= 1000 && t > 0))
  assert.ok(timeouts[0] > timeouts.at(-1)) // monotonically decreasing remaining budget
})

test('update: snapshot/auto failures are recorded and do not stop the breadth fill', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  const outFile = path.join(dir, 'breadth.json')
  const run = async name => {
    if (name === 'market-cycle-snapshot.mjs') throw new Error('超时')
    if (name === 'market-cycle-auto.mjs') throw new Error('退出 1')
    await writeFile(outFile, JSON.stringify(snapshot({ csi300: 25.7, hsi: 31.6, hstech: 40.2 })))
  }
  const result = await update(run, f => f, { outFile, deadlineMs: 60000 })
  assert.deepEqual(result, ['market-cycle-snapshot.mjs: 超时', 'market-cycle-auto.mjs: 退出 1'])
})

test('update: a breadth collector crash is recorded and ends the fill', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cycle-update-'))
  let breadthCalls = 0
  const run = async name => { if (name === 'market-cycle-breadth.mjs') { breadthCalls++; throw new Error('退出 1') } }
  const result = await update(run, f => f, { outFile: path.join(dir, 'breadth.json'), deadlineMs: 60000 })
  assert.equal(breadthCalls, 1)
  assert.ok(result.some(x => x.includes('market-cycle-breadth.mjs')))
})
