import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InvestmentPlan2026 from './InvestmentPlan2026'
import { resetMacroSnapshotCache } from '../features/macro/useMacroSnapshot'

beforeEach(() => { resetMacroSnapshotCache(); localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 }))) })
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

const openAllocation = () => {
  render(<MemoryRouter><InvestmentPlan2026 /></MemoryRouter>)
  fireEvent.click(screen.getByRole('tab', { name: /配置与纪律/ }))
}
const openSection = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const names = () => (screen.getAllByRole('textbox', { name: /资产名称/ }) as HTMLInputElement[]).map(i => i.value)
const targets = () => (screen.getAllByRole('textbox', { name: /目标占比/ }) as HTMLInputElement[]).map(i => Number(i.value))

describe('再平衡检查器的示例与书第9章9.10一致', () => {
  it('默认是宽基均衡档：权益50%以A股宽基为主，不含主题指数', () => {
    openAllocation()
    expect(names()).toEqual(['A股宽基', '标普500', '红利低波', '中短债/纯债'])
    expect(targets()).toEqual([30, 15, 5, 50])
    expect(names()).not.toContain('恒生科技')
  })

  it('可切换保守、积极档与作者案例；每档目标合计100%', () => {
    openAllocation()
    fireEvent.click(screen.getByRole('button', { name: '保守档' }))
    expect(targets()).toEqual([18, 9, 3, 70])
    fireEvent.click(screen.getByRole('button', { name: '积极档' }))
    expect(targets()).toEqual([42, 21, 7, 30])
    fireEvent.click(screen.getByRole('button', { name: '作者案例' }))
    expect(names()).toContain('恒生科技')
    expect(targets().reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('情绪工具：打开即并行获取全部读数', () => {
  it('一次请求 /api/sentiment 填入六项读数，并显示数据日期与来源', async () => {
    const snapshot = { equityPC: 0.58, spxPC: 1.15, pcDate: '2026-10-02', vix: 15.59, vix3m: 18.07, vixDate: '2026-10-05', gexBn: 7.69, gexDate: '2026-10-02', goldSilver: 67.73, goldSilverDate: '2026-10-05', warnings: [] }
    const fetcher = vi.fn(async (url: string) => (String(url).includes('/api/sentiment') ? new Response(JSON.stringify(snapshot)) : new Response('{}', { status: 500 })))
    vi.stubGlobal('fetch', fetcher)
    render(<MemoryRouter><InvestmentPlan2026 /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: /情绪工具/ }))
    const value = (label: RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value
    await screen.findByText(/P\/C 2026-10-02/)
    expect([value(/Equity P\/C/), value(/SPX P\/C/), value(/VIX（30天）/), value(/VIX3M/), value(/Net GEX/), value(/金银比/)]).toEqual(['0.58', '1.15', '15.59', '18.07', '7.69', '67.73'])
    expect(fetcher.mock.calls.filter(([u]) => String(u).includes('/api/sentiment'))).toHaveLength(1)
    expect(screen.getByText(/VIX 期限结构正常/)).toBeTruthy()
  })
})

describe('再平衡检查器：风险贡献', () => {
  it('作者案例里恒生科技只占 20% 的钱，却承担约一半以上的风险，并给出提示', () => {
    openAllocation()
    fireEvent.click(screen.getByRole('button', { name: '作者案例' }))
    openSection('风险透视')
    expect(screen.getByText(/权重 vs 风险贡献（按目标占比）/)).toBeTruthy()
    expect(screen.getByText(/只占钱的 20%（占风险资产的 25%），却承担约 55%/)).toBeTruthy()
  })

  it('均衡档没有单项风险畸高，不出现提示；个股名称标为未识别', () => {
    openAllocation()
    openSection('风险透视')
    expect(screen.queryByText(/却承担约/)).toBeNull()
    expect(screen.getByText(/风险资产合计占钱的 50%，承担约 (9\d|10\d)%/)).toBeTruthy()
    openSection('修改持仓与目标')
    fireEvent.click(screen.getByRole('button', { name: /添加/ }))
    fireEvent.change(screen.getByLabelText('资产名称 新资产'), { target: { value: '某只个股' } })
    fireEvent.change(screen.getByLabelText('目标占比 某只个股'), { target: { value: '10' } })
    openSection('风险透视')
    expect(screen.getByText(/未识别并排除：某只个股/)).toBeTruthy()
  })
})

describe('交易前检查单与冷静期', () => {
  const register = (name: string) => {
    if (!screen.queryByLabelText('登记标的或操作')) openSection('纪律与交易前检查')
    fireEvent.change(screen.getByLabelText('登记标的或操作'), { target: { value: name } })
    fireEvent.click(screen.getByRole('button', { name: /登记这个想法/ }))
  }

  it('登记后处于「检查单未通过」，勾全并写证伪条件后进入冷静期而不是直接可执行', () => {
    openAllocation()
    register('腾讯控股')
    expect(screen.getByText('检查单未通过')).toBeTruthy()
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.change(screen.getByLabelText('证伪条件 腾讯控股'), { target: { value: '云业务毛利率连续两季下滑' } })
    expect(screen.getByText('冷静期中')).toBeTruthy()
    expect(screen.getByText(/还剩 (47|48) 小时|还剩 1 天 2\d 小时|还剩 2 天/)).toBeTruthy()
  })

  it('写下提前执行理由后留痕，状态变为「已提前执行」；记录刷新后仍在', () => {
    openAllocation()
    register('英伟达')
    fireEvent.change(screen.getByLabelText('提前执行理由 英伟达'), { target: { value: '财报后大幅跳空' } })
    expect(screen.getByText('已提前执行（留痕）')).toBeTruthy()
    cleanup()
    openAllocation()
    openSection('纪律与交易前检查')
    expect(screen.getByText('英伟达')).toBeTruthy()
    expect(screen.getByText('已提前执行（留痕）')).toBeTruthy()
  })

  it('空名称不登记，可删除记录', () => {
    openAllocation()
    openSection('纪律与交易前检查')
    fireEvent.click(screen.getByRole('button', { name: /登记这个想法/ }))
    expect(screen.queryByText('检查单未通过')).toBeNull()
    register('美团')
    fireEvent.click(screen.getByRole('button', { name: '删除 美团' }))
    expect(screen.queryByText('美团')).toBeNull()
  })
})

describe('历史情景压力测试', () => {
  it('作者案例列出五个情景；2008 年黄金与恒生科技当时无数据而不被替代', () => {
    openAllocation()
    fireEvent.click(screen.getByRole('button', { name: '作者案例' }))
    openSection('风险透视')
    for (const name of ['2008 全球金融危机', '2015 年夏 A 股股灾', '2020 年 3 月流动性踩踏', '2022 美联储加息：股债双杀', '2021–2022 恒生科技深跌']) {
      expect(screen.getByText(name)).toBeTruthy()
    }
    expect(screen.getAllByText(/黄金、恒生科技当时无数据|恒生科技、黄金当时无数据/).length).toBeGreaterThan(0)
  })

  it('没有任何可识别资产时不显示压力测试', () => {
    openAllocation()
    for (const input of screen.getAllByRole('textbox', { name: /资产名称/ })) fireEvent.change(input, { target: { value: '某只个股' } })
    openSection('风险透视')
    expect(screen.queryByText(/如果历史重演/)).toBeNull()
  })
})

describe('币种敞口', () => {
  it('作者案例：非人民币定价合计 60%', () => {
    openAllocation()
    fireEvent.click(screen.getByRole('button', { name: '作者案例' }))
    openSection('风险透视')
    expect(screen.getByText('币种敞口：资产的价格由哪种货币决定')).toBeTruthy()
    expect(screen.getByText(/非人民币定价的资产合计约 60%/)).toBeTruthy()
  })
})

describe('自由生活覆盖率', () => {
  it('填入金额、股息率与开支后，给出两把尺子的覆盖率与备用金月数', () => {
    openAllocation()
    fireEvent.click(screen.getByRole('button', { name: '作者案例' }))
    const amounts = screen.getAllByPlaceholderText('万元')
    amounts.forEach(a => fireEvent.change(a, { target: { value: '20' } })) // 五项各 20，共 100
    openSection('现金流')
    fireEvent.change(screen.getByLabelText('股息率 红利低波'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('股息率 纯债基金'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/年必要生活开支/), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText(/备用金/), { target: { value: '4' } })
    // 年现金流 20*5%+20*3% = 1.6；覆盖率 1.6/8 = 20%；4% 提款 4/8 = 50%；备用金 4/(8/12) = 6 个月
    const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent
    expect(valueOf('股息利息覆盖率')).toBe('20%')
    expect(valueOf('4% 提款覆盖率')).toBe('50%')
    expect(valueOf('备用金可撑')).toBe('6.0 个月')
    expect(screen.getByText(/还差约 100 万元/)).toBeTruthy()
  })

  it('没填开支时不给覆盖率', () => {
    openAllocation()
    openSection('现金流')
    expect(screen.queryByText('股息利息覆盖率')).toBeNull()
  })
})

describe('配置与纪律的小节导航', () => {
  it('默认显示再平衡检查；切换小节只显示对应内容，并写入 URL', () => {
    render(<MemoryRouter><InvestmentPlan2026 /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: /配置与纪律/ }))
    expect(screen.getByText('再平衡检查器')).toBeTruthy()
    expect(screen.queryByText('风险透视', { selector: 'h3' })).toBeNull()
    openSection('纪律与交易前检查')
    expect(screen.queryByText('再平衡检查器')).toBeNull()
    expect(screen.getByText('交易前检查单与冷静期')).toBeTruthy()
    expect(screen.getByText('不可越过的红线')).toBeTruthy()
    expect(screen.getByRole('button', { name: '纪律与交易前检查' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('URL 带 sec 参数时直接打开对应小节', () => {
    render(<MemoryRouter initialEntries={['/?tab=allocation&sec=cashflow']}><InvestmentPlan2026 /></MemoryRouter>)
    expect(screen.getByText(/自由生活覆盖率/)).toBeTruthy()
  })
})

describe('投资计划 · 产业趋势', () => {
  it('第二个页签是产业趋势：主线、三个判断、存储复盘、产业链对照、Palantir、联动下跌纪律与待核清单', () => {
    render(<MemoryRouter initialEntries={['/?tab=industry']}><InvestmentPlan2026 /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: '投资计划' })).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs[1].textContent).toBe('产业趋势')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { name: /AI 算力链/ })).toBeTruthy()
    for (const name of [/三个判断/, /存储股为什么会在需求很好时大跌/, /产业链对照/, /重点公司排序/, /联动下跌|连带博通/]) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
    const table = screen.getByRole('table', { name: 'AI 算力链各环节对照' })
    expect(table.querySelectorAll('tbody tr')).toHaveLength(6)
    expect(table.textContent).toContain('Palantir')
    expect(screen.getByText(/卖出看跌期权属于衍生品操作/)).toBeTruthy()
    expect(screen.getByText(/待核实，不作为依据/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /去候选池写条件/ }).getAttribute('href')).toBe('/candidates')
  })

  it('重点公司按星级从高到低排序，每家都有推荐理由、风险、跟踪指标和结论，Palantir 在列', () => {
    render(<MemoryRouter initialEntries={['/?tab=industry']}><InvestmentPlan2026 /></MemoryRouter>)
    expect(screen.getByText(/星级只评业务/)).toBeTruthy()
    const rank = screen.getByRole('table', { name: '重点公司排序' })
    const rows = Array.from(rank.querySelectorAll('tbody tr'))
    const stars = rows.map(r => Number(r.querySelector('[role="img"]')!.getAttribute('aria-label')!.replace(' 星', '')))
    expect(stars).toEqual([...stars].sort((a, b) => b - a))
    expect(rows[0].textContent).toContain('台积电')
    expect(rows[1].textContent).toContain('博通')
    expect(rows.some(r => r.textContent!.includes('Palantir'))).toBe(true)
    const cards = document.querySelectorAll('details.trend-co')
    expect(cards).toHaveLength(rows.length)
    expect((cards[0] as HTMLDetailsElement).open).toBe(true)
    expect((cards[2] as HTMLDetailsElement).open).toBe(false)
    for (const card of Array.from(cards)) {
      expect(card.textContent).toContain('推荐理由')
      expect(card.textContent).toContain('主要风险')
      expect(card.textContent).toContain('跟踪指标')
    }
  })
})

describe('风险仪表盘：全自动读数与解读', () => {
  const series = (value: number, date = '2026-10-08') => ({ unit: '', latest: { date, value }, history: [] })
  const snap = { generatedAt: '2026-10-13', source: 't', series: { sahm: series(0), claims: series(19.8), hy: series(315), vix: series(14.84), dd: series(0.15), kre: series(5) } }
  const live = { ...snap, generatedAt: '2026-10-14', series: { ...snap.series, vix: series(32, '2026-10-14') } }

  it('没有输入框；先显示快照，再被实时数据覆盖，并给出自动解读', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (String(u).includes('macro-us.json')) return new Response(JSON.stringify(snap))
      if (String(u).includes('/api/macro')) return new Response(JSON.stringify({ us: live, warnings: [] }))
      return new Response('{}', { status: 500 })
    }))
    render(<MemoryRouter initialEntries={['/?tab=dashboard']}><InvestmentPlan2026 /></MemoryRouter>)
    expect(await screen.findByText('自动解读')).toBeTruthy()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(await screen.findByText(/VIX：32，已越过危险线 30/)).toBeTruthy()
    expect(screen.getByText(/实时数据/)).toBeTruthy()
    const calls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) => String(u).includes('/api/macro')).length
    const before = calls()
    fireEvent.click(await screen.findByRole('button', { name: /刷新全部/ }))
    await waitFor(() => expect(calls()).toBe(before + 1))
    expect(screen.getByText(/区域银行 KRE 连续跑输标普：5 周，已越过危险线 4/)).toBeTruthy()
  })
})

describe('选股流程页签', () => {
  it('显示八道关与四条纪律，入口链接指向站内页面', () => {
    render(<MemoryRouter initialEntries={['/?tab=screening']}><InvestmentPlan2026 /></MemoryRouter>)
    expect(screen.getAllByRole('listitem', { name: '' }).length).toBeGreaterThan(0)
    expect(screen.getByText('产业格局：先划能力圈')).toBeTruthy()
    expect(screen.getByRole('link', { name: /候选池 · 研究筛出/ }).getAttribute('href')).toBe('/candidates?tab=research')
    expect(screen.getByText('四条纪律')).toBeTruthy()
  })

  it('周期定位读取宏观快照，自动给出象限并高亮当前行', async () => {
    const ser = (h: number[]) => ({ unit: '', latest: { date: '2026-10-01', value: h[h.length - 1] }, history: h.map((v, i) => [`2026-${String(i + 1).padStart(2, '0')}-01`, v]) })
    const snap = { generatedAt: '2026-10-13', source: 't', series: { gdp: ser([1.5, 2.5]), unrate: ser([4.5, 4.4, 4.3, 4.2]), corePce: ser([3.2, 3.1, 3.0, 2.8]), ccDelinq: ser([2, 2, 2, 2, 2.5]) } }
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('macro-us.json') ? new Response(JSON.stringify(snap)) : new Response('{}', { status: 500 }))))
    render(<MemoryRouter initialEntries={['/?tab=screening']}><InvestmentPlan2026 /></MemoryRouter>)
    expect(await screen.findByText(/当前象限：增长回升 · 通胀回落（最友好）/)).toBeTruthy()
    expect(screen.getByText('周期定位：先看风向，再选类型')).toBeTruthy()
  })
})
