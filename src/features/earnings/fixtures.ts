// 测试用的小样本：结构与 scripts/earnings-calendar.mjs 的输出一致（仅测试引用）
import type { EarningsCalendar, EarningsItem } from './model'

export const item = (over: Partial<EarningsItem> = {}): EarningsItem => ({
  market: 'us', code: 'NVDA', name: '英伟达', date: '2026-11-17', time: 'amc', confirmed: true, dateSource: 'yahoo', period: 'FY2027Q3',
  consensus: { eps: 2.4712, revenue: 108731903900, analysts: 43, revenueAnalysts: 45, currency: 'USD', asOf: '2026-11-14', source: 'yahoo' },
  lastYear: { eps: 1.3, revenue: 57006000000 },
  history: [{ date: '2026-08-26', epsActual: 2.22, epsEstimate: 2.09, surprisePct: 6.16 }, { date: '2026-05-20', epsActual: 1.87, epsEstimate: 1.77, surprisePct: -1.2 }],
  result: null, marketCap: { value: 3.9e12, currency: 'USD' },
  research: { rating: '条件关注', lynch: '快速增长型', lynchAttention: '高', scenarios: { bear: 150, base: 220, bull: 300, price: 190, priceDate: '2026-11-13', currency: 'USD' }, verify: ['Q3 业绩：数据中心收入与毛利率'], risk: '出口管制', auto: false, asOf: '2026-09-21' },
  asOf: '2026-11-14', ...over,
})

export const calendar = (over: Partial<EarningsCalendar> = {}): EarningsCalendar => ({
  schemaVersion: 1, generatedAt: '2026-11-14T08:00:00Z', today: '2026-11-14', window: { start: '2026-10-31', end: '2026-12-26' },
  sources: {
    yahoo: { label: 'Yahoo Finance（yfinance）', url: 'https://finance.yahoo.com/calendar/earnings', ok: true, fetchedAt: '2026-11-14T08:00:00Z', error: null },
    hkex: { label: '港交所披露易·董事会会议通告', url: 'https://www3.hkexnews.hk/reports/bmn/ebmn.htm', ok: false, fetchedAt: '2026-11-12T23:10:00Z', error: 'HTTP 503' },
    cnAppoint: { label: '东方财富·定期报告预约披露', url: 'https://datacenter-web.eastmoney.com/api/data/v1/get', ok: true, fetchedAt: '2026-11-14T08:00:00Z', error: null },
  },
  seasons: {
    cn: { next: { reportDate: '2026-12-31', period: 'FY2026', label: '2026 年年报', start: '2027-01-01', end: '2027-04-30' }, rule: '沪深定期报告法定披露期：年报次年 1–4 月。' },
    hk: { rule: '港股主板：全年业绩须在财年结束后 3 个月内公布。' },
  },
  items: [
    item(),
    item({ code: 'WMT', name: '沃尔玛', date: '2026-11-19', time: 'bmo', research: { ...item().research!, rating: '中性观察', scenarios: null }, marketCap: { value: 1.0e12, currency: 'USD' } }),
    item({ code: 'ZZZ', name: '小公司', date: '2026-11-18', time: 'unknown', confirmed: false, research: null, marketCap: { value: 5e9, currency: 'USD' }, consensus: null }),
    item({ market: 'hk', code: '00700', name: '腾讯控股', date: '2026-11-18', time: 'unknown', dateSource: 'hkex', period: '第三季度业绩', marketCap: { value: 3.4e12, currency: 'HKD' }, research: { ...item().research!, rating: '优先关注' }, carried: true }),
    item({ code: 'CSCO', name: '思科', date: '2026-11-12', time: 'amc', result: { epsActual: 1.4, epsEstimate: 1.33, surprisePct: 5.64, revenueActual: 15.1e9, revenueYoY: 7.5, currency: 'USD', asOf: '2026-11-14', source: 'yahoo' } }),
    item({ market: 'cn', code: '600519', name: '贵州茅台', date: '2026-11-03', time: 'offhours', dateSource: 'cnAppoint', consensus: null, marketCap: null, result: { epsActual: 51.53, epsEstimate: null, surprisePct: null, revenueActual: 133283652508, revenueYoY: 1.82, netProfitYoY: -0.25, currency: 'CNY', asOf: '2026-11-14', source: 'cnReport' } }),
  ],
  cnNotices: [
    { market: 'cn', code: '300750', name: '宁德时代', kind: 'forecast', noticeDate: '2026-11-10', period: 'FY2026', reportDate: '2026-12-31', metric: '归属于上市公司股东的净利润', type: '预增', lower: 5e10, upper: 6e10, changeLower: 20, changeUpper: 40, source: 'cnForecast', research: null },
  ],
  ...over,
})
