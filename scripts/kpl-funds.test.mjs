// 虚构响应验证字段、日期与发布门禁，不把测试数据当公开快照。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildSnapshot, collectionWindow, numberOrNull, parseHistory, parseRanking, rankUrl, validDate } from './kpl-funds-lib.mjs'
const date = '2026-11-17'
const history = { rc: 0, data: { klines: ['2026-11-16,0,,,0,0,999', `${date},-300,100,200,-100,-200,999`] } }
const rank = (n, sign, industry = false) => ({ rc: 0, data: { total: 5000, diff: Array.from({ length: n }, (_, i) => ({ f12: industry ? `BK${String(i).padStart(4, '0')}` : String(i + 1).padStart(6, '0'), f14: '样本', f62: sign * (n - i) * 1e8, f3: '', f184: null, f66: '-100', f72: '200', f6: '-', f100: null })) } })
const raw = () => ({ history: structuredClone(history), stockIn: rank(30, 1), stockOut: rank(30, -1), industryIn: rank(15, 1, true), industryOut: rank(15, -1, true) })
test('缺值不是零，零仍保留', () => {
  for (const x of [null, undefined, '', ' ', '-', '--', false, [], Infinity]) assert.equal(numberOrNull(x), null)
  assert.equal(numberOrNull('0'), 0)
})
test('日期合法性与北京交易日 15:10 门禁', () => {
  for (const d of ['2026-02-30', '2026-13-01', '', null]) assert.equal(validDate(d), false)
  assert.equal(collectionWindow(new Date('2026-11-17T07:09:59Z')).ready, false)
  assert.equal(collectionWindow(new Date('2026-11-17T07:10:00Z')).ready, true)
  assert.equal(collectionWindow(new Date('2026-11-17T16:00:00Z')).date, date)
  assert.equal(collectionWindow(new Date('2026-11-21T08:00:00Z')).ready, false)
  assert.equal(collectionWindow(new Date('2026-10-01T08:00:00Z')).ready, false)
})
test('fflow 按字段顺序映射，金额为元，f57 不参与计算', () => {
  const rows = parseHistory(history, date)
  assert.deepEqual(rows[1], { date, main: -300, small: 100, medium: 200, large: -100, superLarge: -200 })
  assert.equal(rows[0].small, null)
  assert.throws(() => parseHistory(history, '2026-11-18'))
  assert.throws(() => parseHistory({ rc: 0, data: { klines: [`${date},-301,100,200,-1,-2`] } }, date))
  for (const d of ['2026-02-30', '2026-11-21', date]) {
    const body = structuredClone(history)
    body.data.klines.unshift(`${d},0,0,0,0,0`)
    assert.throws(() => parseHistory(body, date))
  }
})
test('clist 字段映射；方向、排序、重复、缺条、缺主力一律拒绝', () => {
  const body = rank(30, 1)
  const r = parseRanking(body, 'stock', 'inflow')[0]
  assert.deepEqual(r, { code: '000001', name: '样本', main: 30e8, pct: null, mainRatio: null, superLarge: -100, large: 200, amount: null, industry: null })
  for (const mutate of [b => b.data.diff.pop(), b => { b.data.diff[1].f12 = '000001' }, b => { b.data.diff[1].f62 = '' }, b => { b.data.diff[1].f62 = 99e8 }, b => { b.data.diff[0].f62 = -1 }]) {
    const b = structuredClone(body); mutate(b)
    assert.throws(() => parseRanking(b, 'stock', 'inflow'))
  }
  assert.equal(parseRanking(rank(15, -1, true), 'industry', 'outflow').length, 15)
  const url = new URL(rankUrl('stock', 'outflow'))
  assert.equal(url.searchParams.get('po'), '0')
  assert.equal(url.searchParams.get('fid'), 'f62')
  assert.ok(url.searchParams.get('fs').includes('m:0+t:81+s:2048'))
})
test('完整快照不可缺少任意一端排行', () => {
  assert.equal(buildSnapshot(raw(), date, '2026-11-17T08:00:00Z').history.length, 2)
  for (const key of Object.keys(raw())) {
    const r = raw(); delete r[key]
    assert.throws(() => buildSnapshot(r, date, '2026-11-17T08:00:00Z'))
  }
})

function runScript({ force = false, fail = false, midnight = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpl-funds-'))
  fs.mkdirSync(path.join(dir, 'public/data'), { recursive: true })
  const output = path.join(dir, 'public/data/kpl-funds.json')
  fs.writeFileSync(output, '上一份数据')
  const preload = `const NativeDate=Date;globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:['${midnight ? '2026-11-17T16:01:00Z' : '2026-11-17T08:00:00Z'}']))}};const raw=${JSON.stringify(raw())};globalThis.fetch=async url=>{const u=new URL(url);const key=u.hostname==='push2his.eastmoney.com'?'history':(u.searchParams.get('fs')==='m:90+t:2'?'industry':'stock')+(u.searchParams.get('po')==='1'?'In':'Out');return {ok:true,json:async()=>${fail ? "key==='industryOut'?{}:raw[key]" : 'raw[key]'}}}`
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, path.resolve('scripts/kpl-funds.mjs')], { cwd: dir, env: { ...process.env, FORCE: force ? '1' : '0' }, encoding: 'utf8' })
  return { dir, output, result }
}
test('发布：完整响应原子替换；一端失败或 FORCE 或午夜均不落盘', () => {
  for (const options of [{}, { fail: true }, { force: true }, { midnight: true }]) {
    const { dir, output, result } = runScript(options)
    try {
      if (Object.keys(options).length) {
        assert.equal(fs.readFileSync(output, 'utf8'), '上一份数据', result.stderr)
        assert.equal(fs.existsSync(path.join(dir, 'data-raw')), false)
        assert.equal(result.status, options.fail ? 1 : 0)
      } else {
        assert.equal(result.status, 0, result.stderr)
        assert.equal(JSON.parse(fs.readFileSync(output)).asOf, date)
        assert.ok(fs.existsSync(path.join(dir, `data-raw/kpl-funds/days/${date}.json`)))
        assert.ok(fs.existsSync(path.join(dir, 'data-raw/kpl-funds/history.json')))
      }
      assert.equal(fs.existsSync(`${output}.tmp`), false)
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  }
})
