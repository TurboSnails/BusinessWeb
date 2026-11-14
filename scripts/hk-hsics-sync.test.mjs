import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readHkFixes, upsertHkFix } from './hk-hsics-sync.mjs'

const TS = `export const SECTOR_FIXES: Record<string, string> = {
  'us:GRMN': '可选消费', // x
  'hk:02269': '药品及生物科技', // y
}
const other = { 'hk:00001': '不应读到' }
`

test('readHkFixes only reads hk entries inside SECTOR_FIXES', () => {
  assert.deepEqual(readHkFixes(TS), { '02269': '药品及生物科技' })
})

test('upsertHkFix replaces existing entry and appends new ones inside the block', () => {
  const replaced = upsertHkFix(TS, '02269', '医疗保健设备和服务', 'note')
  assert.match(replaced, /'hk:02269': '医疗保健设备和服务', \/\/ note/)
  assert.equal(readHkFixes(replaced)['02269'], '医疗保健设备和服务')
  const added = upsertHkFix(TS, '00066', '工用运输', 'n2')
  assert.deepEqual(readHkFixes(added), { '02269': '药品及生物科技', '00066': '工用运输' })
  assert.match(added, /'hk:00066': '工用运输', \/\/ n2\n\}/)
})
