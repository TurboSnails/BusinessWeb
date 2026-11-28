import { describe, expect, it, vi } from 'vitest'
import {
  CHART_SETTINGS_KEY, DEFAULT_CHART_SETTINGS, loadChartSettings, normalizeSettings, saveChartSettings,
} from './settings'

describe('chart settings', () => {
  it('normalize 容错', () => {
    expect(normalizeSettings(null).ma).toEqual(DEFAULT_CHART_SETTINGS.ma)
    expect(normalizeSettings({ ma: [5, 999], volumeProfile: true }).ma).toEqual([5])
    expect(normalizeSettings({ ma: [20, 5, 20] }).ma).toEqual([5, 20])
  })

  it('读写 localStorage，异常时静默', () => {
    localStorage.removeItem(CHART_SETTINGS_KEY)
    saveChartSettings({ ...DEFAULT_CHART_SETTINGS, volumeProfile: true, ma: [10, 20] })
    expect(loadChartSettings().volumeProfile).toBe(true)
    expect(loadChartSettings().ma).toEqual([10, 20])

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveChartSettings(DEFAULT_CHART_SETTINGS)).not.toThrow()
    spy.mockRestore()

    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => '{')
    expect(loadChartSettings().macd).toBe(DEFAULT_CHART_SETTINGS.macd)
    getSpy.mockRestore()
  })
})
