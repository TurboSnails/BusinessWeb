import test from 'node:test'
import assert from 'node:assert/strict'
import { HK_INDEX_CODES } from './market-cycle-hk-universe.mjs'
import {
  officialHkConstituentCodes,
  researchHkCodes,
  diffHkResearchVsOfficial,
  diffFromOfficialBodies,
  checkHkResearchConstituents,
} from './check-hk-research-constituents.mjs'

const TODAY = '2026-11-27'
const DATE_TIME = '2026-11-27 16:08:38'
const NAMES = { hsi: 'Hang Seng Index', hstech: 'Hang Seng TECH Index' }

/** 固定官方响应样例（不联网）：形状对齐 metadata/v2 rt。 */
const row = (code, indexCode) => ({
  indexCode, indexName: NAMES.hsi, stockCode: code, stockName: `S${code}`,
  exchangeListed: 'Hong Kong Stock Exchange', dateTime: DATE_TIME, isDummy: 'N', stockType: 'HK',
})
const body = (market, codes) => {
  const indexCode = HK_INDEX_CODES[market]
  return {
    code: '0',
    message: 'success',
    data: {
      numOfConsList: [{ indexName: NAMES[market], indexCode, subIndexes: null, count: codes.length }],
      historicalChangeOfCons: [],
      viewConsDetail: { [indexCode]: codes.map(c => row(String(c), indexCode)) },
    },
  }
}

test('officialHkConstituentCodes 合并恒指∪恒科并去重补零', () => {
  const codes = officialHkConstituentCodes({
    hsi: { status: 'ok', codes: ['00001', '00700', '01519'] },
    hstech: { status: 'ok', codes: ['00700', '00020', '00100'] },
  })
  assert.deepEqual(codes, ['00001', '00020', '00100', '00700', '01519'])
})

test('diffHkResearchVsOfficial 以清单形式报出缺漏，池内多余成分不算缺失', () => {
  const result = diffHkResearchVsOfficial({
    officialCodes: ['00001', '00020', '01519'],
    researchCodes: ['00001', '09999'], // 09999 = H 股补充，应保留；00020/01519 缺
    dates: { hsi: TODAY, hstech: TODAY },
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['00020', '01519'])
  assert.equal(result.officialCount, 3)
  assert.equal(result.researchCount, 2)
})

test('diffFromOfficialBodies 用固定官方样例比对研究池（不联网）', () => {
  const hsiBody = body('hsi', [1, 1519, 700])
  const hstechBody = body('hstech', [20, 100, 700])
  const research = [{ code: '00001' }, { code: '00700' }, { code: '09999' }]
  const result = diffFromOfficialBodies({
    hsiBody, hstechBody, researchCompanies: research, today: TODAY,
  })
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['00020', '00100', '01519'])
  assert.equal(result.dates.hsi, '2026-11-27')
  assert.equal(result.dates.hstech, '2026-11-27')
})

test('研究池已齐时 missing 为空', () => {
  const hsiBody = body('hsi', [1, 700])
  const hstechBody = body('hstech', [20, 700])
  const research = [{ code: '1' }, { code: '00020' }, { code: '00700' }, { code: '08888' }]
  const result = diffFromOfficialBodies({
    hsiBody, hstechBody, researchCompanies: research, today: TODAY,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
  assert.equal(researchHkCodes(research).includes('00001'), true)
})

test('checkHkResearchConstituents 读落盘文件只告警不抛错', () => {
  const lines = []
  const log = { log: m => lines.push(['log', m]), warn: m => lines.push(['warn', m]) }
  const result = checkHkResearchConstituents({ log })
  assert.equal(typeof result.ok, 'boolean')
  assert.ok(Array.isArray(result.missing))
  assert.ok(lines.length >= 1)
  // 当前仓库已补齐 13 只后，缺漏应为 0（若 universes 可用）
  if (!result.skipped) assert.deepEqual(result.missing, [])
})
