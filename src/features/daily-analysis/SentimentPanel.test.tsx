import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SentimentPanel } from './SentimentPanel'
import { dailySnapshot } from './fixtures'
import example from '../../../scripts/fixtures/market-sentiment-example.json'
import type { MarketSentiment } from './types'

afterEach(cleanup)
const withSentiment = (sentiment: unknown) => ({ ...dailySnapshot(), sentiment: sentiment as MarketSentiment })

describe('SentimentPanel', () => {
  it('旧快照没有 sentiment 时明确说明而不编造', () => {
    render(<SentimentPanel data={dailySnapshot()} />)
    expect(screen.getByText(/没有市场情绪数据/)).toBeTruthy()
  })
  it('展示涨跌统计、量能、涨停表现、大幅回撤、权重表现五块', () => {
    render(<SentimentPanel data={withSentiment(example)} />)
    for (const name of ['涨跌统计', '市场量能', '涨停表现', '大幅回撤', '权重表现']) expect(screen.getByRole('region', { name })).toBeTruthy()
    expect(within(screen.getByRole('list', { name: '涨跌幅分布' })).getAllByRole('listitem')).toHaveLength(11)
  })
  it('单块失败只影响该块，历史缺失的对比显示为 —', () => {
    const data = withSentiment({ ...example, breadth: { status: 'error', reason: '新浪接口超时' }, turnover: { status: 'ready', amount: 100, vsPreviousPct: null, vsFiveDayAveragePct: null } })
    render(<SentimentPanel data={data} />)
    expect(screen.getByText('新浪接口超时')).toBeTruthy()
    expect(screen.getByRole('region', { name: '权重表现' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '市场量能' })).getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })
})
