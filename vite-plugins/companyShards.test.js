import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCompanyShard,
  codesForMarket,
  defaultPublicDataDir,
  indexCompanySources,
  matchShardRequest,
  shardRelativePath,
} from './companyShards.mjs'

describe('companyShards 生成与源 JSON 一致', () => {
  const index = indexCompanySources(defaultPublicDataDir)

  it.each([
    ['cn', '600519'],
    ['cn', '601318'],
    ['us', 'AAPL'],
    ['hk', '00700'],
  ])('%s/%s 分片字段与源记录逐字段一致', (market, code) => {
    const shard = buildCompanyShard(index, market, code)
    expect(shard.market).toBe(market)
    expect(shard.code).toBe(code)

    const srcCompany = index.companies.get(`${market}:${code}`) ?? null
    expect(shard.company).toEqual(srcCompany)

    const srcRec = index.valuationByCode.get(`${market}:${code}`) ?? null
    if (srcRec) {
      expect(shard.valuationDoc).toBeTruthy()
      expect(shard.valuationDoc.schemaVersion).toBe(index.valuationDocs.get(market).schemaVersion)
      expect(shard.valuationDoc.asOf).toBe(index.valuationDocs.get(market).asOf)
      expect(shard.valuationDoc.records).toHaveLength(1)
      expect(shard.valuationDoc.records[0]).toEqual(srcRec)
    } else {
      expect(shard.valuationDoc).toBeNull()
    }

    const lynchKey = `${market}:${code}`
    const srcLynch = Object.prototype.hasOwnProperty.call(index.lynch, lynchKey) ? index.lynch[lynchKey] : null
    expect(shard.lynch).toEqual(srcLynch)
  })

  it('codesForMarket 覆盖公司 / 估值 / 林奇并集', () => {
    const codes = new Set(codesForMarket(index, 'cn'))
    expect(codes.has('600519')).toBe(true)
    expect(codes.size).toBeGreaterThan(800)
  })

  it('matchShardRequest 识别路径并忽略 SPA 前缀', () => {
    expect(matchShardRequest('/data/company/cn/600519.json')).toEqual({ market: 'cn', code: '600519' })
    expect(matchShardRequest('/BusinessWeb/data/company/us/AAPL.json')).toEqual({ market: 'us', code: 'AAPL' })
    expect(matchShardRequest('/data/cn.json')).toBeNull()
  })
})

describe('分片落盘', () => {
  let tmp
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('写出后再读与 buildCompanyShard 一致', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'company-shards-'))
    const index = indexCompanySources(defaultPublicDataDir)
    const sample = buildCompanyShard(index, 'cn', '600519')
    const dest = path.join(tmp, shardRelativePath('cn', '600519'))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, JSON.stringify(sample))
    expect(JSON.parse(fs.readFileSync(dest, 'utf8'))).toEqual(sample)
  })
})
