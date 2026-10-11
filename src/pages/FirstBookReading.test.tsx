import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FirstBook from './FirstBook'

const opening = '开篇-美好的愿望.md'
const guide = '导读-把注意力还给生活.md'
const href = (file: string) => `/first-book/read/${encodeURIComponent(file)}`
const response = (text: string) => ({ ok: true, text: async () => text }) as Response
const renderBook = (path = '/first-book/slow-is-fast') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/first-book/slow-is-fast" element={<FirstBook />} />
      <Route path="/first-book/read/:file" element={<FirstBook />} />
    </Routes>
  </MemoryRouter>
)

function installSpeech() {
  const spoken: SpeechSynthesisUtterance[] = []
  const synth = Object.assign(new EventTarget(), {
    paused: false,
    cancel: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => spoken.push(utterance)),
    getVoices: () => [
      { voiceURI: 'zh', name: '中文语音', lang: 'zh-CN' },
      { voiceURI: 'en', name: 'English', lang: 'en-US' },
    ],
  })
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} })
  return { synth, spoken }
}

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('正念投资阅读体验', () => {
  it('搜索过滤完整目录，清除后恢复章节，空结果提供方向', () => {
    const { container } = renderBook()
    const contents = within(container.querySelector('#book-contents') as HTMLElement)
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索章节' }), { target: { value: '估值' } })
    expect(contents.getAllByRole('link')).toHaveLength(1)
    expect(contents.getByRole('link').getAttribute('href')).toBe(href('第28章-估值.md'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '不存在的章节' } })
    expect(contents.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toContain('找到 0 篇')
    fireEvent.click(screen.getByRole('button', { name: '清除章节搜索' }))
    expect(contents.getAllByRole('link').length).toBeGreaterThan(50)
    expect(contents.queryByText('初稿完成')).toBeNull()
  })

  it('按问题选择路线，并能进入研究实战', () => {
    const { container } = renderBook()
    expect(container.querySelectorAll('.book-paths__steps li')).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: '研究一家公司' }))
    expect(screen.getByRole('button', { name: '研究一家公司' }).getAttribute('aria-pressed')).toBe('true')
    const links = within(container.querySelector('.book-paths') as HTMLElement)
    expect(links.getByRole('link', { name: /一家公司，从看懂到决定/ }).getAttribute('href')).toBe(href('专题-一家公司从研究到决定.md'))
  })

  it('来源和章节引用可以点击，危险协议不生成链接，正文目录指向对应小节', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('# 标题\n\n## 查证\n\n[官方资料](https://www.investor.gov/)\n\n[第7章](第7章-配置优先.md)\n\n[危险链接](javascript:alert)')))
    const { container } = renderBook(href(opening))
    await screen.findByRole('link', { name: '官方资料' })
    expect(screen.getByRole('link', { name: '官方资料' }).getAttribute('rel')).toContain('noopener')
    expect(screen.getByRole('link', { name: '第7章' }).getAttribute('href')).toBe(href('第7章-配置优先.md'))
    expect(screen.queryByRole('link', { name: '危险链接' })).toBeNull()
    fireEvent.click(screen.getByText('本篇内容', { selector: 'summary' }))
    expect(within(screen.getByRole('navigation', { name: '本篇内容' })).getByRole('link').getAttribute('href')).toBe('#chapter-section-0')
    expect(container.querySelector('#chapter-section-0')?.textContent).toBe('查证')
  })

  it('字号设置和上次阅读在重新进入时保留', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('# 章节\n\n阅读正文。')))
    let view = renderBook(href(opening))
    await screen.findByText('阅读正文。')
    fireEvent.click(screen.getByRole('button', { name: '放大正文字号' }))
    expect(screen.getByLabelText('正文字号').textContent).toBe('20')
    view.unmount()
    view = renderBook()
    expect(screen.getByRole('link', { name: '继续阅读' }).getAttribute('href')).toBe(href(opening))
    fireEvent.click(screen.getByRole('link', { name: '继续阅读' }))
    await screen.findByText('阅读正文。')
    expect(screen.getByLabelText('正文字号').textContent).toBe('20')
    expect((view.container.querySelector('.book-reader') as HTMLElement).style.getPropertyValue('--book-font-size')).toBe('20px')
  })

  it('快速换章后，迟到的旧响应不能覆盖新正文或上次阅读', async () => {
    let resolveOld!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith(encodeURIComponent(opening))
      ? new Promise<Response>(resolve => { resolveOld = resolve })
      : Promise.resolve(response('# 导读\n\n当前的新正文。'))))
    renderBook(href(opening))
    fireEvent.click(within(screen.getByRole('navigation', { name: '章节目录' })).getByRole('link', { name: /把注意力还给生活/ }))
    await screen.findByText('当前的新正文。')
    await act(async () => resolveOld(response('# 旧章节\n\n迟到的旧正文。')))
    await waitFor(() => expect(screen.queryByText('迟到的旧正文。')).toBeNull())
    expect(localStorage.getItem('mindful-book:last-chapter')).toBe(guide)
  })

  it('普通章节没有评论，只在全书末篇之后显示统一书评', async () => {
    const fetcher = vi.fn(async (url: string) => url.startsWith('/api/comments')
      ? { ok: true, json: async () => ({ comments: [] }) } as Response
      : response('# 正文\n\n书稿内容。'))
    vi.stubGlobal('fetch', fetcher)
    const view = renderBook(href(opening))
    await screen.findByText('书稿内容。')
    expect(screen.queryByLabelText('评论内容')).toBeNull()
    expect(fetcher.mock.calls.some(([url]) => url.startsWith('/api/comments'))).toBe(false)
    const navigation = within(screen.getByRole('navigation', { name: '章节目录' }))
    fireEvent.click(navigation.getByRole('button', { name: '附录：读者工具与延伸阅读' }))
    fireEvent.click(navigation.getByRole('link', { name: /术语表/ }))
    await screen.findByRole('heading', { name: '全书书评' })
    expect(view.container.querySelector('.reader-main')?.lastElementChild?.id).toBe('book-comments')
    expect(fetcher.mock.calls.some(([url]) => url === `/api/comments?slug=${encodeURIComponent('正念投资.md')}`)).toBe(true)
  })

  it('全书播放可跨目录和阅读页保留，小节入口只听本节，语速可设置', async () => {
    const audio = installSpeech()
    vi.stubGlobal('fetch', vi.fn(async () => response('# 导读\n\n## 先安排生活\n为眼前的生活保留现金。\n\n## 再谈投资\n这是另外一节。')))
    const view = renderBook()
    fireEvent.click(screen.getByRole('button', { name: '听全书' }))
    const player = await screen.findByRole('complementary', { name: '听书播放器' })
    await waitFor(() => expect(audio.spoken).toHaveLength(1))
    fireEvent.click(within(player).getByRole('link'))
    await screen.findByRole('heading', { name: '先安排生活' })
    expect(screen.getByRole('complementary', { name: '听书播放器' })).toBe(player)
    expect(audio.synth.cancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '听本节：先安排生活' }))
    expect(audio.spoken[1].text).toBe('先安排生活。为眼前的生活保留现金。')
    expect(audio.spoken[1].text).not.toContain('另外一节')
    fireEvent.click(within(player).getByRole('button', { name: '暂停' }))
    fireEvent.click(within(player).getByRole('button', { name: '继续' }))
    fireEvent.change(within(player).getByRole('combobox', { name: '听书语速' }), { target: { value: '1.5' } })
    expect(audio.spoken[audio.spoken.length - 1].rate).toBe(1.5)
    expect(localStorage.getItem('mindful-book:audio-rate')).toBe('1.5')
    view.unmount()
    expect(audio.synth.cancel).toHaveBeenCalledTimes(4)
  })

  it('静态镜像在书末链接正式站书评，不渲染无法提交的表单', async () => {
    vi.stubEnv('BASE_URL', '/BusinessWeb/')
    const fetcher = vi.fn(async () => response('书稿末篇。'))
    vi.stubGlobal('fetch', fetcher)
    renderBook(href('附录I-术语表.md'))
    const link = await screen.findByRole('link', { name: '前往正式站查看和提交书评' })
    expect(link.getAttribute('href')).toBe(`https://business-web-black.vercel.app${href('附录I-术语表.md')}#book-comments`)
    expect(screen.queryByLabelText('评论内容')).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('全书队列不包含大纲和审校资料，停止后关闭播放器', async () => {
    installSpeech()
    vi.stubGlobal('fetch', vi.fn(async () => response('一段正文。')))
    renderBook()
    fireEvent.click(screen.getByRole('button', { name: '听全书' }))
    const player = await screen.findByRole('complementary', { name: '听书播放器' })
    fireEvent.click(within(player).getByText('更多设置'))
    const options = within(player).getByRole('combobox', { name: '切换听书篇章' }).textContent
    expect(options).toContain('术语表')
    expect(options).not.toMatch(/大纲|修订|审稿/)
    expect(within(player).getByRole('combobox', { name: '听书音色' }).textContent).not.toContain('English')
    fireEvent.click(within(player).getByRole('button', { name: '停止听书' }))
    expect(screen.queryByRole('complementary', { name: '听书播放器' })).toBeNull()
  })

  it('不支持设备语音的浏览器仍能阅读，并明确标注听书不可用', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('可以阅读的正文。')))
    renderBook(href(opening))
    await screen.findByText('可以阅读的正文。')
    expect((screen.getByRole('button', { name: '听本章' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/当前浏览器不支持听书/)).toBeTruthy()
  })
})
