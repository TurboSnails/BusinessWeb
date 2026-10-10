// @ts-ignore 测试在 Node 中运行
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import IndustryLandscape from './IndustryLandscape'

const fetcher = vi.fn(async (url: string) => {
  const file = String(url).includes('semiconductor') ? 'semiconductor.json' : 'solid-state.json'
  const text = readFileSync(resolve('public/industry', file), 'utf8')
  return { json: async () => JSON.parse(text) } as Response
})
beforeAll(() => {
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => cleanup())

describe('产业格局', () => {
  it('半导体产业链和固态电池一样以可展开、可搜索的树展示，不再是图片', async () => {
    render(<IndustryLandscape />)
    fireEvent.click(screen.getByRole('tab', { name: '半导体产业链' }))
    expect(await screen.findByRole('heading', { name: '上游：基础与工具' })).toBeTruthy()
    expect(document.querySelector('img[alt="半导体产业链脑图"]')).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: '安集科技' } })
    expect(screen.getAllByText('安集科技', { selector: 'mark' }).length).toBeGreaterThan(0)
  })

  it('切回已看过的页签不重复请求', async () => {
    fetcher.mockClear()
    render(<IndustryLandscape />)
    expect(await screen.findByRole('heading', { name: '解决痛点' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '半导体产业链' }))
    await screen.findByRole('heading', { name: '上游：基础与工具' })
    fireEvent.click(screen.getByRole('tab', { name: '固态电池' }))
    fireEvent.click(screen.getByRole('tab', { name: '半导体产业链' }))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('页面声明不构成投资建议，数据里没有荐股、目标价和配置建议', async () => {
    render(<IndustryLandscape />)
    expect(screen.getByRole('note').textContent).toContain('不构成投资建议')
    for (const file of ['solid-state.json', 'semiconductor.json']) {
      const text = readFileSync(resolve('public/industry', file), 'utf8')
      expect(text).not.toMatch(/先买|目标¥|优先配置|机会型配置|公司推荐|投资建议|确定性排序|唯一确定性/)
    }
  })

  it('新增产业都有页签，数据能加载并在树上展示，且不含荐股措辞', async () => {
    const files: Record<string, [string, string]> = {
      AI算力: ['ai-compute.json', '产业全景'],
      机器人: ['robots.json', '产业全景'],
      新能源车与智驾: ['ev-adas.json', '产业全景'],
      光伏与储能: ['pv-storage.json', '产业全景'],
      创新药: ['innovative-drug.json', '产业全景'],
      低空经济: ['low-altitude.json', '产业全景'],
      商业航天: ['commercial-space.json', '产业全景'],
      军工: ['military.json', '产业特点'],
      核电与电网: ['nuclear-grid.json', '产业全景'],
      消费电子: ['consumer-electronics.json', '产业全景'],
      白酒: ['baijiu.json', '产业全景'],
      银行: ['banks.json', '产业全景'],
      新材料: ['new-materials.json', '产业全景'],
      前沿科技: ['frontier-tech.json', '产业全景'],
    }
    fetcher.mockImplementation(async (url: string) => {
      const name = Object.values(files).find(([f]) => String(url).includes(f))?.[0]
      const file = name || (String(url).includes('semiconductor') ? 'semiconductor.json' : 'solid-state.json')
      return { json: async () => JSON.parse(readFileSync(resolve('public/industry', file), 'utf8')) } as Response
    })
    render(<IndustryLandscape />)
    for (const [label, [file, chapter]] of Object.entries(files)) {
      fireEvent.click(screen.getByRole('tab', { name: label }))
      expect(await screen.findByRole('heading', { name: chapter })).toBeTruthy()
      expect(readFileSync(resolve('public/industry', file), 'utf8')).not.toMatch(
        /先买|目标¥|优先配置|机会型配置|公司推荐|投资建议|确定性排序|唯一确定性/,
      )
    }
  })

  it('每个产业的主要章节末尾有「受益公司」，含技术壁垒与技术前景两类', () => {
    for (const file of ['ai-compute', 'robots', 'ev-adas', 'military', 'semiconductor', 'solid-state', 'banks']) {
      const tree = JSON.parse(readFileSync(resolve('public/industry', `${file}.json`), 'utf8'))
      const benefit = tree.c.map((c: any) => c.c?.[c.c.length - 1]).filter((n: any) => n?.t === '受益公司')
      expect(benefit.length, file).toBeGreaterThan(0)
      for (const n of benefit) expect(n.c.slice(0, 2).map((x: any) => x.t)).toEqual(['技术壁垒高的公司', '有技术前景的公司'])
    }
  })

  it('章节目录末尾有「受益公司」汇总，按章节分组', async () => {
    render(<IndustryLandscape />)
    await screen.findByRole('heading', { name: '解决痛点' })
    const directory = screen.getByRole('navigation', { name: '固态电池章节目录' })
    const items = within(directory).getAllByRole('button')
    expect(items[items.length - 1].textContent).toContain('受益公司')
    fireEvent.click(items[items.length - 1])
    expect(screen.getByRole('heading', { name: '受益公司' })).toBeTruthy()
    expect(screen.getAllByText('技术壁垒高的公司').length).toBeGreaterThan(1)
  })

  it('节点里的公司名链接到站内公司分析页', async () => {
    fetcher.mockImplementation(async (url: string) => {
      const file = String(url).includes('ai-compute')
        ? 'ai-compute.json'
        : String(url).includes('semiconductor')
          ? 'semiconductor.json'
          : 'solid-state.json'
      return { json: async () => JSON.parse(readFileSync(resolve('public/industry', file), 'utf8')) } as Response
    })
    render(
      <MemoryRouter>
        <IndustryLandscape />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'AI算力' }))
    fireEvent.click(await screen.findByRole('button', { name: /网络与光互连/ }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: '中际旭创' } })
    const links = await screen.findAllByRole('link', { name: '中际旭创的公司分析' })
    expect(links[0].getAttribute('href')).toContain('/future-trends/company/')
  })

  it('有「主题研究卡」页签，切过去不请求产业数据', async () => {
    fetcher.mockClear()
    render(<IndustryLandscape />)
    fireEvent.click(screen.getByRole('tab', { name: '主题研究卡' }))
    expect(screen.getByRole('textbox', { name: '主题名称' })).toBeTruthy()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('章节导航切换阅读内容，并记住两个产业各自的阅读位置', async () => {
    render(<IndustryLandscape />)
    await screen.findByRole('heading', { name: '解决痛点' })
    const directory = screen.getByRole('navigation', { name: '固态电池章节目录' })
    fireEvent.click(within(directory).getByRole('button', { name: /^技术路线/ }))
    expect(screen.getByRole('heading', { name: '技术路线' })).toBeTruthy()
    expect(
      within(directory)
        .getByRole('button', { name: /^技术路线/ })
        .getAttribute('aria-current'),
    ).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: '半导体产业链' }))
    await screen.findByRole('heading', { name: '上游：基础与工具' })
    fireEvent.click(screen.getByRole('tab', { name: '固态电池' }))
    expect(screen.getByRole('heading', { name: '技术路线' })).toBeTruthy()
  })

  it('全局搜索跨章节保留路径、高亮命中，支持空结果及清空恢复', async () => {
    render(<IndustryLandscape />)
    fireEvent.click(screen.getByRole('tab', { name: '半导体产业链' }))
    await screen.findByRole('heading', { name: '上游：基础与工具' })
    const search = screen.getByRole('textbox', { name: '搜索节点' })
    fireEvent.change(search, { target: { value: '寒武纪' } })
    const reader = screen.getByRole('region', { name: '产业资料阅读区' })
    expect(within(reader).getByText('中游：核心制造环节')).toBeTruthy()
    expect(reader.querySelector('mark')?.textContent).toBe('寒武纪')
    expect(within(reader).getByRole('status').textContent).toMatch(/找到 \d+ 个匹配节点/)
    fireEvent.change(search, { target: { value: '半导体' } })
    expect(reader.querySelectorAll('mark').length).toBeGreaterThan(1)
    expect(within(reader).getByText('光刻设备')).toBeTruthy()
    fireEvent.change(search, { target: { value: '不存在的资料关键词' } })
    expect(screen.getByText('没有找到相关资料')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }))
    expect(screen.getByRole('heading', { name: '上游：基础与工具' })).toBeTruthy()
  })

  it('展开与收起控制所有层级，折叠条目使用可访问按钮', async () => {
    render(<IndustryLandscape />)
    await screen.findByRole('heading', { name: '解决痛点' })
    const reader = screen.getByRole('region', { name: '产业资料阅读区' })
    fireEvent.click(screen.getByRole('button', { name: '全部展开' }))
    expect(within(reader).getByText(/传统液态锂电池在高温/)).toBeTruthy()
    expect(
      [...reader.querySelectorAll('[aria-expanded]')].every(
        (node) => node.getAttribute('aria-expanded') === 'true',
      ),
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '全部收起' }))
    expect(within(reader).queryByText(/传统液态锂电池在高温/)).toBeNull()
    const root = within(reader).getByRole('button', { name: /^解决痛点/ })
    expect(root.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(root)
    expect(root.getAttribute('aria-expanded')).toBe('true')
  })
  it('成本与技术资料表格保留表头语义和横向阅读容器', async () => {
    render(<IndustryLandscape />)
    await screen.findByRole('heading', { name: '解决痛点' })
    const directory = screen.getByRole('navigation', { name: '固态电池章节目录' })
    fireEvent.click(within(directory).getByRole('button', { name: /^固态电池预测/ }))
    fireEvent.click(screen.getByRole('button', { name: '全部展开' }))
    const reader = screen.getByRole('region', { name: '产业资料阅读区' })
    expect(within(reader).getAllByRole('table').length).toBeGreaterThan(0)
    expect(within(reader).getByRole('columnheader', { name: '材料' }).getAttribute('scope')).toBe('col')
    expect(within(reader).getAllByRole('region', { name: '资料对照表' })[0].getAttribute('tabindex')).toBe(
      '0',
    )
  })
})
