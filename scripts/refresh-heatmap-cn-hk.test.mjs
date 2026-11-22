import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HK_SECTOR, buildTables } from './refresh-heatmap-cn-hk.mjs'
import { hkYahoo } from '../server/usMaps.mjs'
import { memberExtra } from '../server/indexes.mjs'

describe('估值热力图：沪深 300 / 恒生指数行业表', () => {
  it('只取沪深 300 与恒生指数成分；港股行业组归并成大类，未知组记为其他，去掉「(五百)」后缀', () => {
    const { cn, hk } = buildTables([
      { m: 'cn', c: '600519', n: '贵州茅台', g: ['沪深300'], ind: '食品饮料' },
      { m: 'cn', c: '688001', n: '某公司', g: ['研究公司'], ind: '电子设备' },
      { m: 'hk', c: '00700', n: '腾讯控股', g: ['恒生指数', '恒生科技'], ind: '媒体与娱乐' },
      { m: 'hk', c: '02899', n: '紫金矿业(五百)', g: ['恒生指数'], ind: '原材料' },
      { m: 'hk', c: '09999', n: '新行业', g: ['恒生指数'], ind: '没见过的组' },
    ])
    assert.deepEqual(cn, { 600519: ['贵州茅台', '食品饮料'] })
    assert.deepEqual(hk, { '00700': ['腾讯控股', '通信与互联网'], '02899': ['紫金矿业', '原材料'], '09999': ['新行业', '其他'] })
    assert.equal(HK_SECTOR['银行'], '金融')
  })

  it('港股代码转雅虎代码；沪深 300 成员带上中文名和行业，美股只带行业', () => {
    assert.equal(hkYahoo('00700'), '0700.HK')
    assert.equal(hkYahoo('09988'), '9988.HK')
    assert.deepEqual(memberExtra('csi300', '600519.SS'), { name: '贵州茅台', sector: '食品饮料' })
    assert.deepEqual(memberExtra('spx', 'AAPL'), { sector: 'Information Technology' })
    assert.deepEqual(memberExtra('csi500', '688235.SS'), {})
  })
})
