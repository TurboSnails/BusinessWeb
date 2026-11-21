// @ts-ignore 测试环境在 Node 中运行，项目未安装 @types/node
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 公司详情：补全 JSON 失败的降级、同页重试、无效地址；两套估值（综合估值 / 原研究情景）逐处标来源与方向分歧。
// 用仓库真实数据（public/data），只把 data/us.json 换成可控故障。

type UsMode = 'ok' | '503' | 'html'
let usMode: UsMode = 'ok'

const fileResponse = (rel: string): Response => {
  try {
    const text = readFileSync(resolve('public/data', rel), 'utf8')
    return { ok: true, status: 200, json: async () => JSON.parse(text) } as Response
  } catch {
    return { ok: false, status: 404, json: async () => ({}) } as Response
  }
}

beforeEach(() => {
  usMode = 'ok'
  vi.resetModules() // 公司库缓存在模块级，每个用例重新加载
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', async (url: string) => {
    const rel = String(url).replace(/^.*?data\//, '')
    if (rel === 'us.json' && usMode === '503') return { ok: false, status: 503, json: async () => ({}) } as Response
    if (rel === 'us.json' && usMode === 'html') return { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token '<'") } } as unknown as Response
    return fileResponse(rel)
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

let nav: NavigateFunction | undefined
function NavProbe(): null { nav = useNavigate(); return null }

async function renderAt(path: string): Promise<void> {
  const { default: CompanyDetail } = await import('./CompanyDetail')
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavProbe />
      <Routes>
        <Route path="/research-notes/:market/:code" element={<CompanyDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}
const h1 = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name }, { timeout: 15_000 })
const text = (sel: string): string => Array.from(document.querySelectorAll(sel)).map(e => e.textContent ?? '').join(' | ')

describe('补全 JSON 失败：部分数据而非「未找到」', () => {
  it.each<UsMode>(['503', 'html'])('us.json %s：手工 AAPL 仍可打开', async mode => {
    usMode = mode
    await renderAt('/research-notes/us/AAPL')
    expect(await h1('苹果')).toBeTruthy()
  }, 20_000)

  it.each<UsMode>(['503', 'html'])('us.json %s：WEC 显示暂不可用与重试；恢复后同页重试找回', async mode => {
    usMode = mode
    await renderAt('/research-notes/us/WEC')
    expect(await screen.findByText('部分公司数据暂不可用', {}, { timeout: 15_000 })).toBeTruthy()
    expect(screen.queryByText('未找到该公司')).toBeNull()
    expect(screen.getByText(/不代表公司库中没有它/)).toBeTruthy()
    usMode = 'ok'
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await h1('WEC能源')).toBeTruthy()
  }, 20_000)

  it('恢复后在同一 SPA 里切到苹果再切回 WEC 能找回（不刷新页面）', async () => {
    usMode = '503'
    await renderAt('/research-notes/us/WEC')
    await screen.findByText('部分公司数据暂不可用', {}, { timeout: 15_000 })
    usMode = 'ok'
    act(() => nav!('/research-notes/us/AAPL'))
    expect(await h1('苹果')).toBeTruthy()
    act(() => nav!('/research-notes/us/WEC'))
    expect(await h1('WEC能源')).toBeTruthy()
  }, 20_000)

  it('有效数据下真正无匹配才显示未找到', async () => {
    await renderAt('/research-notes/us/INVALIDCODE')
    expect(await h1('未找到该公司')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  }, 20_000)
})

describe('无效地址', () => {
  it('未知市场不回退美股，不打开苹果', async () => {
    await renderAt('/research-notes/invalid/AAPL')
    expect(await h1('无效的公司地址')).toBeTruthy()
    expect(screen.queryByText('苹果')).toBeNull()
  })

  it('/us/%25 不重复解码、不崩溃，显示未找到', async () => {
    await renderAt('/research-notes/us/%25')
    expect(await h1('未找到该公司')).toBeTruthy()
  }, 20_000)
})

describe('两套估值逐处标来源', () => {
  const srcVal = /综合估值 · \d{4}-\d{2}-\d{2}/
  const expectResearchLabels = (date: string) => {
    const label = `原研究情景 · ${date}`
    expect(text('.cd-rating-src')).toBe(`评级依据：${label}`)
    expect(text('.sig-source')).toContain(label) // 信号表「研究评级」「三情景」行
    expect(text('.cc-levels__caption')).toContain(`三情景：${label}`)
  }

  it('MSFT（双模型）：头部偏离与刻度标综合估值；悲观/低档方向相反进信号分歧', async () => {
    await renderAt('/research-notes/us/MSFT')
    await h1('微软')
    await waitFor(() => expect(document.querySelector('.cc-levels__caption')).toBeTruthy())
    expect(text('.cd-premium')).toMatch(/现价低于基准情景价 \d+\.\d%（综合估值 · \d{4}-\d{2}-\d{2}）/)
    expect(text('.cd-scenarios__title')).toMatch(/综合估值/)
    expect(text('.cd-scenarios__outside')).toContain('低于低档价') // 不再与原研究「悲观价」混称
    expect(text('.cd-scenarios__other')).toContain('原研究情景 · 2026-09-30')
    expectResearchLabels('2026-09-30')
    const conflicts = text('.sig-callout')
    expect(conflicts).toMatch(srcVal)
    expect(conflicts).toMatch(/现价低于低档 \$532\.48.*原研究情景 · 2026-09-30：悲观 \$385 距现价 −20\.5%（现价高于悲观）/)
  }, 20_000)

  it('AAPL（双模型）：基准方向相反（+ 对 −）复用信号分歧，评级旁标原研究来源', async () => {
    await renderAt('/research-notes/us/AAPL')
    await h1('苹果')
    await waitFor(() => expect(document.querySelector('.cc-levels__caption')).toBeTruthy())
    expect(text('.cd-premium')).toMatch(/现价低于基准情景价 1\.8%（综合估值 · /)
    expectResearchLabels('2026-09-21')
    const conflicts = text('.sig-callout')
    expect(conflicts).toContain('现价低于基准 $348.9 1.8%')
    expect(conflicts).toContain('原研究情景 · 2026-09-21：基准 $317 距现价 −7.5%（现价高于基准）')
    // 追加分歧后，不再保留「没有发现分歧」的说明
    expect(screen.queryByText(/没有发现分歧/)).toBeNull()
  }, 20_000)

  it('NVDA（综合估值待核）：不显示偏离、不判断方向分歧，但下方仍标原研究来源', async () => {
    await renderAt('/research-notes/us/NVDA')
    await h1('英伟达')
    await waitFor(() => expect(document.querySelector('.cc-levels__caption')).toBeTruthy())
    expect(document.querySelector('.cd-premium')).toBeNull()
    expect(text('.cd-scenarios__other')).toContain('原研究情景 · 2026-09-30')
    expectResearchLabels('2026-09-30')
    expect(text('.sig-callout')).not.toContain('两套情景')
  }, 20_000)

  it('GOOGL（单模型）：头部即原研究，不出现双模型提示与分歧', async () => {
    await renderAt('/research-notes/us/GOOGL')
    await h1('谷歌-A')
    expect(text('.cd-premium')).toContain('（原研究情景 · 2026-10-05）')
    expect(document.querySelector('.cd-scenarios__other')).toBeNull()
    expect(text('.sig-source')).toContain('原研究情景 · 2026-10-05')
    expect(text('.sig-callout')).not.toContain('两套情景')
  }, 20_000)

  it('cn/600519：来源标签同样出现，缺日期时写日期缺失而不编日期', async () => {
    await renderAt('/research-notes/cn/600519')
    await h1('贵州茅台')
    const rating = text('.cd-rating-src')
    expect(rating).toMatch(/^评级依据：原研究情景 · (\d{4}-\d{2}-\d{2}|日期缺失)$/)
    expect(text('.sig-source')).toContain(rating.replace('评级依据：', ''))
  }, 20_000)
})
