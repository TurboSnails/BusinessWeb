import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { buildPrompt, validateInterpretation } from './macro/interpret.mjs'
import { createJobStore } from './jobs.mjs'
import { createValuationServer } from './http.mjs'

const good = {
  summary: '当前为预警：KRE 连续 4 周跑输标普（2026-09-28）。',
  changes: [{ indicator: 'KRE', direction: '变坏', evidence: '9 月起连续跑输' }],
  analogs: [],
  watch: [{ item: 'HY 利差', trigger: '升破 400bp' }],
  caveats: '数据有滞后',
}

test('解读结果只做结构校验，方向必须是三选一', () => {
  assert.equal(validateInterpretation(good).summary, good.summary)
  assert.throws(() => validateInterpretation({ ...good, changes: [] }), /changes/)
  assert.throws(() => validateInterpretation({ ...good, changes: [{ indicator: 'x', direction: '大涨', evidence: 'y' }] }), /direction/)
})

test('提示词带上读数，并明确不改阶段、不给买卖建议', () => {
  const prompt = buildPrompt({ asOf: '2026-10-05', stage: { name: '预警' } })
  assert.match(prompt, /"asOf":"2026-10-05"/)
  assert.match(prompt, /不得改写/)
  assert.match(prompt, /不给买卖/)
})

function request(server, method, path, headers, body = '') {
  return new Promise(resolve => {
    const req = Readable.from([body])
    Object.assign(req, { method, url: path, headers: { host: 'localhost:8788', ...headers } })
    const res = { status: 200, setHeader() {}, writeHead(status) { this.status = status }, end(text) { resolve({ status: this.status, body: text ? JSON.parse(text) : null }) } }
    server.emit('request', req, res)
  })
}

test('/macro/jobs 走独立队列：估值任务运行时也能发起解读', async () => {
  const store = createJobStore({ execute: () => new Promise(() => {}) })
  const macroStore = createJobStore({ execute: async input => ({ interpretation: good, asOf: input.digest.asOf }) })
  const server = createValuationServer({ token: 't', store, macroStore })
  const auth = { 'x-valuation-token': 't' }
  store.start({ backend: 'codex', modelId: 'default' })
  assert.equal((await request(server, 'POST', '/macro/jobs', auth, JSON.stringify({ backend: 'codex', modelId: 'default' }))).status, 400)
  const started = await request(server, 'POST', '/macro/jobs', auth, JSON.stringify({ backend: 'codex', modelId: 'default', digest: { asOf: '2026-10-05' } }))
  assert.equal(started.status, 202)
  await new Promise(r => setTimeout(r, 0))
  const done = await request(server, 'GET', `/macro/jobs/${started.body.id}`, {})
  assert.equal(done.body.state, 'completed')
  assert.equal(done.body.report.asOf, '2026-10-05')
  store.close(); macroStore.close()
})
