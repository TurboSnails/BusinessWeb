import { test } from 'node:test'
import assert from 'node:assert/strict'
import { update } from './market-cycle-update.mjs'

test('任何单个采集器失败仍执行后续采集器，并把失败交给周报留档', async () => {
  const ran = []
  const report = await update(async name => { ran.push(name); if (name.includes('-auto.')) throw new Error('upstream down') }, async issues => ({ issues }))
  assert.equal(ran.length, 3)
  assert.match(report.issues[0], /market-cycle-auto.*upstream down/)
})
