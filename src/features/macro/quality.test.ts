// @ts-ignore 测试在 Node 中运行
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkQuality, checkSeries } from './quality'
import { buildDigest } from './digest'
import type { MacroSnapshot } from './indicators'
import type { CnKey } from './china'

const us = JSON.parse(readFileSync(resolve('public/data/macro-us.json'), 'utf8')) as MacroSnapshot
const cn = JSON.parse(readFileSync(resolve('public/data/macro-cn.json'), 'utf8')) as MacroSnapshot<CnKey>
const series = (date: string, value: number) => ({ unit: '', latest: { date, value }, history: [] as [string, number][] })
const today = new Date('2026-10-05')

describe('数据体检', () => {
  it('按各指标自己的更新周期判断过期', () => {
    expect(checkSeries('vix', series('2026-10-01', 16), { maxAge: 7, range: [5, 90] }, today).quality).toBe('ok')
    expect(checkSeries('vix', series('2026-09-01', 16), { maxAge: 7, range: [5, 90] }, today).quality).toBe('stale')
    // 核心 PCE 本来就滞后约两个月公布，8 月数据在 10 月初仍算新鲜
    expect(checkSeries('corePce', series('2026-08-01', 3), { maxAge: 95, range: [-3, 15] }, today).quality).toBe('ok')
  })

  it('超出合理范围判为异常，没拉到判为缺失', () => {
    expect(checkSeries('vix', series('2026-10-01', -3), { maxAge: 7, range: [5, 90] }, today).quality).toBe('invalid')
    expect(checkSeries('vix', undefined, { maxAge: 7, range: [5, 90] }, today).quality).toBe('missing')
  })

  it('阶段信号里有不可靠项时单独点名', () => {
    const bad = { ...us, series: { ...us.series, vix: { ...us.series.vix, latest: { date: '2026-10-01', value: 999 } } } }
    const r = checkQuality(bad, cn, today)
    expect(r.us.vix.quality).toBe('invalid')
    expect(r.stageAffected).toContain('vix')
  })

  it('异常读数不交给模型，过期读数带标记交给模型', () => {
    const bad = { ...us, series: { ...us.series, vix: { ...us.series.vix, latest: { date: '2026-10-01', value: 999 } }, hy: { ...us.series.hy, latest: { date: '2026-08-01', value: 330 } } } }
    const d = buildDigest(bad, cn, checkQuality(bad, cn, today))
    const vix = d.us.find(r => r.指标.startsWith('VIX'))!
    const hy = d.us.find(r => r.指标.startsWith('高收益债'))!
    expect(vix.读数).toBeNull()
    expect(vix.近一年).toEqual([])
    expect(vix.数据状态).toBe('异常')
    expect(hy.读数).toBe(330)
    expect(hy.数据状态).toBe('过期')
    expect(d.dataQuality.阶段信号受影响).toEqual(expect.arrayContaining(['vix', 'hy']))
  })
})
