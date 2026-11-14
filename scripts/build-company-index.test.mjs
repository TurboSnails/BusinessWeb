import { test } from 'node:test'
import assert from 'node:assert/strict'
import { namePinyin, toIndex, serialize } from './build-company-index.mjs'

test('namePinyin：首字母与无声调全拼', () => {
  assert.deepEqual(namePinyin('腾讯控股'), { p: 'txkg', q: 'tengxunkonggu' })
  assert.deepEqual(namePinyin('贵州茅台'), { p: 'gzmt', q: 'guizhoumaotai' })
})

test('namePinyin：常见金融公司名的多音字', () => {
  assert.deepEqual(namePinyin('招商银行'), { p: 'zsyh', q: 'zhaoshangyinhang' })
  assert.deepEqual(namePinyin('重庆啤酒'), { p: 'cqpj', q: 'chongqingpijiu' })
  assert.deepEqual(namePinyin('长江电力'), { p: 'cjdl', q: 'changjiangdianli' })
  assert.deepEqual(namePinyin('中国平安'), { p: 'zgpa', q: 'zhongguopingan' })
  assert.equal(namePinyin('三一重工').q, 'sanyizhonggong')
  assert.equal(namePinyin('成都银行').p, 'cdyh')
  assert.equal(namePinyin('都福').q, 'dufu')
  assert.equal(namePinyin('厦钨新能').p, 'xwxn')
  assert.equal(namePinyin('藏格矿业').p, 'zgky')
})

test('namePinyin：保留英文字母数字，去掉 *ST 与符号；无汉字返回 null', () => {
  assert.deepEqual(namePinyin('万科A'), { p: 'wka', q: 'wankea' })
  assert.deepEqual(namePinyin('阿里巴巴-W'), { p: 'albbw', q: 'alibabaw' })
  assert.deepEqual(namePinyin('*ST华微'), { p: 'hw', q: 'huawei' })
  assert.equal(namePinyin('Arista Networks'), null)
  assert.equal(namePinyin(''), null)
})

test('toIndex 只给含汉字的名称加 p/q，输出字节稳定', () => {
  const rows = [
    { c: '00700', n: '腾讯控股', m: 'hk', s: '软件服务' },
    { c: 'ANET', n: 'Arista Networks', m: 'us', s: '信息技术' },
  ]
  const items = toIndex(rows)
  assert.deepEqual(items, [
    { c: '00700', n: '腾讯控股', m: 'hk', s: '软件服务', p: 'txkg', q: 'tengxunkonggu' },
    { c: 'ANET', n: 'Arista Networks', m: 'us', s: '信息技术' },
  ])
  assert.equal(serialize(items), serialize(toIndex(rows)))
})
