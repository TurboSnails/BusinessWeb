import React from 'react'
import type { IndexData } from '../macro/valuation'
import { hasHistory, monthlySeries, validDate } from './catalog'

export default function IndexQuality({ ix }: { ix: IndexData }): JSX.Element {
  const prices = [...monthlySeries(ix.monthly).values()].filter(p => !validDate(ix.latest.date) || p[0] <= ix.latest.date)
  const p = prices.at(-1)
  const latestMonth = ix.latest.date.slice(0, 7)
  const [year, month] = latestMonth.split('-').map(Number)
  const ten = prices.filter(p => p[0].slice(0, 7) >= `${year - 10}-${String(month).padStart(2, '0')}` && p[0].slice(0, 7) < latestMonth)
  const f = [...monthlySeries(ix.ref?.points.length ? ix.ref.points : ix.fpe).values()]
  const latest = f.at(-1)
  return <details className="index-quality"><summary>数据来源、观测日期与覆盖</summary><dl>
    <dt>价格</dt><dd>{ix.priceSource ?? (ix.symbol.endsWith('.SS') || ix.symbol.endsWith('.SZ') ? '指数行情历史快照，具体来源见下方数据说明' : 'Yahoo Finance 指数行情')} · 最新 {ix.latest.date}；月线 {prices.length} 个月{p ? `（月线标签 ${prices[0][0]} 至 ${p[0]}）` : '；历史缺失'}。Yahoo 部分序列以月初作标签，具体月收盘不能视为标签当天价格。{hasHistory(ten, 120) ? '' : '最近十个完整日历年缺月或不足 120 个真实月份，不显示价格十年分位。'}</dd>
    <dt>PE 历史</dt><dd>{latest ? `${ix.ref?.source ?? '本站月度记录（手动或成分股汇总）'} · ${ix.ref?.kind === 'trailing' ? '滚动PE（TTM）' : 'Forward PE'} · ${f.length} 个真实月份（每月最后观测），${f[0][0]} 至 ${latest[0]}。缺月不插值。${hasHistory(f) ? '' : '真实月份或跨度不足，不显示长期分位；估算插值不增加真实样本。'}` : '暂无可用 PE 历史；不从价格反推或补零。'}</dd>
    <dt>成分股估值</dt><dd>{ix.agg ? `${ix.agg.date}；${ix.agg.got}/${ix.agg.total} 只，Forward PE有效市值覆盖 ${(ix.agg.fwdCovered * 100).toFixed(0)}%；代理名单与官方权重可能不同。` : '未采集成分股估值；不代表指数整体亏损。'}</dd>
  </dl></details>
}
