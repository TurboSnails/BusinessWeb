import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHkUniverse, fetchHkUniverse, hkSourceUrl, HK_INDEX_CODES } from './market-cycle-hk-universe.mjs'

const TODAY = '2026-10-19'
const DATE_TIME = '2026-10-16 16:08:38'
const NAMES = { hsi: 'Hang Seng Index', hstech: 'Hang Seng TECH Index' }

/** Minimal shape of the official Hang Seng Indexes metadata/v2 rt payload. */
const row = (code, indexCode, over = {}) => ({ indexCode, indexName: NAMES.hsi, stockCode: code, stockName: `S${code}`, exchangeListed: 'Hong Kong Stock Exchange', dateTime: DATE_TIME, isDummy: 'N', stockType: 'HK', ...over })
const body = (market, codes, count, over = {}) => {
  const indexCode = HK_INDEX_CODES[market]
  return {
    code: '0',
    message: 'success',
    data: {
      numOfConsList: [{ indexName: NAMES[market], indexCode, subIndexes: null, count }],
      historicalChangeOfCons: [],
      viewConsDetail: {
        [indexCode]: codes.map(c => row(String(c), indexCode, over)),
        // sub-index buckets exist too; parser must ignore them
        [indexCode.slice(0, -2) + '01']: codes.slice(0, 2).map(c => row(String(c), indexCode.slice(0, -2) + '01')),
      },
    },
  }
}

test('parseHkUniverse reads the full index bucket only, verifies identity, and derives the snapshot date', () => {
  const u = parseHkUniverse(body('hsi', [1, 700, 1299, 9988], 4), 'hsi', TODAY)
  assert.equal(u.date, '2026-10-16')
  assert.equal(u.source, hkSourceUrl('hsi')) // full query URL, reviewable per market
  assert.deepEqual(u.codes, ['00001', '00700', '01299', '09988']) // padded to 5 digits
  const t = parseHkUniverse(body('hstech', [100, 700], 2), 'hstech', TODAY)
  assert.deepEqual(t.codes, ['00100', '00700'])
  assert.equal(t.source, hkSourceUrl('hstech'))
})

test('parseHkUniverse rejects payload identity mismatches: head/row indexCode, indexName, isDummy', () => {
  const good = body('hsi', [1, 700, 1299, 9988], 4)
  const headWrongCode = JSON.parse(JSON.stringify(good)); headWrongCode.data.numOfConsList[0].indexCode = '99999.00'
  assert.throws(() => parseHkUniverse(headWrongCode, 'hsi', TODAY), /身份不符/)
  const headWrongName = JSON.parse(JSON.stringify(good)); headWrongName.data.numOfConsList[0].indexName = 'Hang Seng China Enterprises Index'
  assert.throws(() => parseHkUniverse(headWrongName, 'hsi', TODAY), /身份不符/)
  const rowWrongCode = JSON.parse(JSON.stringify(good)); rowWrongCode.data.viewConsDetail[HK_INDEX_CODES.hsi][1].indexCode = '00001.01'
  assert.throws(() => parseHkUniverse(rowWrongCode, 'hsi', TODAY), /身份异常/)
  const dummy = JSON.parse(JSON.stringify(good)); dummy.data.viewConsDetail[HK_INDEX_CODES.hsi][0].isDummy = 'Y'
  assert.throws(() => parseHkUniverse(dummy, 'hsi', TODAY), /身份异常/)
  const notHk = JSON.parse(JSON.stringify(good)); notHk.data.viewConsDetail[HK_INDEX_CODES.hsi][0].stockType = 'A'
  assert.throws(() => parseHkUniverse(notHk, 'hsi', TODAY), /身份异常/)
})

test('parseHkUniverse rejects partial or inconsistent official payloads, never invents dates', () => {
  for (const invalidCode of ['', ' ', null, '00000']) {
    const invalid = body('hsi', [1, 700, 1299, 9988], 4)
    invalid.data.viewConsDetail[HK_INDEX_CODES.hsi][0].stockCode = invalidCode
    assert.throws(() => parseHkUniverse(invalid, 'hsi', TODAY), /代码/)
  }
  // count mismatch: official says 95, detail has 4 -> cannot trust the list
  assert.throws(() => parseHkUniverse(body('hsi', [1, 700, 1299, 9988], 95), 'hsi', TODAY), /数量/)
  // a partial payload without the official count can never prove completeness
  const noCount = body('hsi', [1, 700, 1299, 9988], 4); delete noCount.data.numOfConsList[0].count
  assert.throws(() => parseHkUniverse(noCount, 'hsi', TODAY), /计数/)
  const zeroCount = body('hsi', [1, 700, 1299, 9988], 0)
  assert.throws(() => parseHkUniverse(zeroCount, 'hsi', TODAY), /计数/)
  // 1 and 00001 are the same stock: padded dedupe must catch it
  const dup = body('hsi', [1, '00001', 700, 1299], 4)
  assert.throws(() => parseHkUniverse(dup, 'hsi', TODAY), /重复/)
  // empty detail
  assert.throws(() => parseHkUniverse({ code: '0', data: { numOfConsList: [{ indexCode: HK_INDEX_CODES.hsi, indexName: NAMES.hsi, count: 0 }], viewConsDetail: {} } }, 'hsi', TODAY))
  // api-level error envelope
  assert.throws(() => parseHkUniverse({ code: 'COMMON_0406', message: 'Bad Request' }, 'hsi', TODAY))
  // mixed snapshot timestamps: no single confirmed date
  const mixed = body('hsi', [1, 700, 1299, 9988], 4)
  mixed.data.viewConsDetail[HK_INDEX_CODES.hsi][2].dateTime = '2026-10-15 09:00:00'
  assert.throws(() => parseHkUniverse(mixed, 'hsi', TODAY), /dateTime/)
  // future-dated snapshot is not a valid current list
  const future = body('hsi', [1, 700, 1299, 9988], 4, { dateTime: '2026-10-20 16:08:38' })
  assert.throws(() => parseHkUniverse(future, 'hsi', TODAY), /日期/)
})

test('fetchHkUniverse requests the exact whitelisted URL and enforces size bounds', async () => {
  const calls = []
  const fetchImpl = async url => {
    calls.push(url)
    return { ok: true, json: async () => body('hstech', Array.from({ length: 30 }, (_, i) => i + 1), 30) }
  }
  const u = await fetchHkUniverse({ market: 'hstech', fetchImpl, today: TODAY })
  assert.deepEqual(calls, [hkSourceUrl('hstech')])
  assert.equal(u.codes.length, 30)
  // size bounds are real: a 19-stock HSTECH payload is not a complete list
  await assert.rejects(fetchHkUniverse({ market: 'hstech', fetchImpl: async () => ({ ok: true, json: async () => body('hstech', Array.from({ length: 19 }, (_, i) => i + 1), 19) }), today: TODAY }), /规模/)
  // http failure surfaces, no fabricated list
  await assert.rejects(fetchHkUniverse({ market: 'hsi', fetchImpl: async () => ({ ok: false, status: 503 }), today: TODAY }), /503/)
})
