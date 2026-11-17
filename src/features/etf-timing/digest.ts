// ETF 择时每日观察邮件（server/timing-digest.ts 调用）：读 public/data/etf-timing.json，
// 列出上一份快照之后「沪深300择时＋只认金叉」新出现的信号与择时状态变化。
// 规则仍在验证（docs/TODO-投资工具优化.md ①②），邮件只陈述规则的机械状态，不是买卖指令。
import type { EtfTiming, ShadowItem } from './model'

export const TIMING_SITE_PATH = '/lab/etf-timing'
const MAX_LIST = 30

export type SignalLine = { code: string; name: string; close: number; side: 'buy' | 'sell'; nextOpen: boolean; date: string }
export type TimingDigest = {
  asOf: string
  key: string
  bull: boolean | null
  prevBull: boolean | null
  /** 上一份快照的数据日期（翻转与新信号都相对它判断） */
  prevAsOf: string | null
  /** 上一份快照不完整时，那一天的信号也算新信号 */
  prevComplete: boolean
  flipped: boolean
  buys: SignalLine[]
  sells: SignalLine[]
  holding: number
  n: number
  complete: boolean
  missing: number
  empty: boolean
}
export type TimingSkip = 'no-data' | 'stale'

export const timingKey = (asOf: string): string => `timing|${asOf}`

/** day（YYYY-MM-DD）之前最近的周一至周五 */
export function previousWeekday(day: string): string {
  let t = Date.parse(`${day}T00:00:00Z`)
  do t -= 864e5; while ([0, 6].includes(new Date(t).getUTCDay()))
  return new Date(t).toISOString().slice(0, 10)
}

const line = (i: ShadowItem): SignalLine => ({
  code: i.code, name: i.name, close: i.close, side: i.hs.lastSignal!.side, date: i.hs.lastSignal!.date,
  // 买入信号总是下一交易日开盘进场；卖出通常按当日收盘离场，买入当天就死叉的才挪到下一交易日开盘
  nextOpen: i.hs.lastSignal!.side === 'buy' || i.hs.pending === 'sell',
})

/**
 * today：北京日期（邮件在北京周二至周六早上发，看前一个工作日收盘后的快照）。
 * 快照早于前一个工作日（节假日或采集失败）时跳过，不拿旧信号当新信号发。
 */
export function buildTimingDigest(data: EtfTiming | null, today: string): { digest: TimingDigest } | { skip: TimingSkip } {
  const latest = data?.latest
  if (!data || !latest || !latest.items.length) return { skip: 'no-data' }
  if (latest.asOf < previousWeekday(today)) return { skip: 'stale' }
  const prev = [...data.history].filter(h => h.asOf < latest.asOf).sort((a, b) => a.asOf.localeCompare(b.asOf)).at(-1)
  const bull = latest.timing.hs300Bull
  const prevBull = prev?.hs300Bull ?? null
  const flipped = bull !== null && prevBull !== null && bull !== prevBull
  // 新信号：上一份快照之后出现的（上一份缺数据时，那天的信号也算进来，避免取数失败那天的信号永远不出现）；没有上一份时只看当天
  const isNew = (date: string) => !prev ? date === latest.asOf : date <= latest.asOf && (prev.complete ? date > prev.asOf : date >= prev.asOf)
  const fresh = latest.items.filter(i => i.hs.lastSignal && isNew(i.hs.lastSignal.date))
    .sort((a, b) => b.hs.lastSignal!.date.localeCompare(a.hs.lastSignal!.date) || a.code.localeCompare(b.code)).map(line)
  const buys = fresh.filter(l => l.side === 'buy'), sells = fresh.filter(l => l.side === 'sell')
  return {
    digest: {
      asOf: latest.asOf, key: timingKey(latest.asOf), bull, prevBull, prevAsOf: prev?.asOf ?? null, prevComplete: prev?.complete ?? true, flipped, buys, sells,
      holding: latest.summary.hsHolding, n: latest.summary.n, complete: latest.complete, missing: latest.summary.missing,
      empty: !flipped && !buys.length && !sells.length,
    },
  }
}

const state = (b: boolean | null) => (b === null ? '无数据' : b ? '偏进攻' : '偏防守')
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const fmtLine = (asOf: string) => (l: SignalLine) => `${l.code} ${l.name}　收盘 ${Number.isFinite(l.close) ? l.close : '—'}${l.side === 'sell' ? (l.nextOpen ? '（下一交易日开盘离场）' : '（已按当日收盘离场）') : ''}${l.date !== asOf ? `　信号日 ${l.date}` : ''}`

export const TIMING_FOOTER = '观察中、未通过验证（影子运行需连续 6～12 个月对照回测），不是买卖指令。'
export const TIMING_CAVEAT = '长历史检验：这条规则对中小盘、周期与成长类回撤保护较好，对大盘蓝筹和红利的收益代价大于好处。'

export function composeTimingEmail(d: TimingDigest, site: string): { subject: string; text: string; html: string } {
  const parts = [d.buys.length && `买入信号 ${d.buys.length}`, d.sells.length && `卖出信号 ${d.sells.length}`, d.flipped && `择时转${state(d.bull)}`].filter(Boolean)
  const subject = `ETF 择时观察 · ${d.asOf.slice(5)} · ${parts.join('、')}`
  const sections: Array<{ title: string; lines: string[] }> = []
  const timingLine = `${state(d.bull)}（沪深300÷红利 比值${d.bull === null ? '无数据' : d.bull ? '在 20 日线上方' : '在 20 日线下方'}）${d.flipped ? `，与 ${d.prevAsOf} 相比由${state(d.prevBull)}转为${state(d.bull)}` : ''}`
  sections.push({ title: '择时状态', lines: [timingLine, ...(d.bull === false ? ['偏防守时规则不开新仓，已持有的等死叉离场。'] : [])] })
  const list = (xs: SignalLine[]) => [...xs.slice(0, MAX_LIST).map(fmtLine(d.asOf)), ...(xs.length > MAX_LIST ? [`另有 ${xs.length - MAX_LIST} 只，见实验页`] : [])]
  const since = d.prevAsOf ? `（${d.prevAsOf} ${d.prevComplete ? '之后' : '起'}）` : ''
  if (d.buys.length) sections.push({ title: `新出现的买入信号${since}（规则在信号次日开盘进场）`, lines: list(d.buys) })
  if (d.sells.length) sections.push({ title: `新出现的卖出信号${since}（MACD 死叉）`, lines: list(d.sells) })
  const scope = d.missing ? `冻结名单 ${d.n + d.missing} 只（本次取到 ${d.n} 只）` : `冻结名单 ${d.n} 只`
  const head = `数据日期 ${d.asOf}（收盘），${scope}，规则「沪深300择时＋只认金叉」；取到的标的中规则持有 ${d.holding} / ${d.n} 只。`
  const notes = [...(d.complete ? [] : [`数据不完整：缺 ${d.missing} 只，本封只按已取到的判断。`]), TIMING_CAVEAT, TIMING_FOOTER]
  const url = `${site}${TIMING_SITE_PATH}`
  const text = [head, ...sections.map(s => `${s.title}：\n${s.lines.map(l => `- ${l}`).join('\n')}`), notes.join('\n'), `实验页：${url}`].join('\n\n')
  const html = [
    `<p>${esc(head)}</p>`,
    ...sections.map(s => `<h3 style="margin:16px 0 6px;font-size:15px">${esc(s.title)}</h3><ul style="margin:0;padding-left:20px">${s.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`),
    `<p style="margin-top:16px;color:#666;font-size:13px">${notes.map(esc).join('<br>')}</p>`,
    `<p><a href="${esc(url)}">打开实验页</a></p>`,
  ].join('\n')
  return { subject, text, html }
}

/** 影子运行断更提醒：快照之后、today 之前漏掉的工作日数（不含两端） */
export function missedWeekdays(asOf: string, today: string): number {
  let n = 0
  for (let d = previousWeekday(today); d > asOf; d = previousWeekday(d)) n++
  return n
}

/** 连续漏掉 STALE_ALERT_DAYS 个以上工作日才提醒：单日失败或单日休市不打扰，下一次成功时信号会补列 */
export const STALE_ALERT_DAYS = 2
export const staleKey = (asOf: string): string => `timing-stale|${asOf}`

/**
 * 快照断更时的提醒邮件（同一个快照日期只提醒一次，由调用方按 staleKey 去重）。
 * 长假休市也会触发一次，正文说明；不需要处理。
 */
export function staleTimingAlert(data: EtfTiming | null, today: string, site: string): { key: string; asOf: string; missed: number; subject: string; text: string; html: string } | null {
  const asOf = data?.latest?.asOf
  if (!asOf) return null
  const missed = missedWeekdays(asOf, today)
  if (missed < STALE_ALERT_DAYS) return null
  const subject = `ETF 择时观察 · 影子运行已 ${missed} 个工作日没有更新`
  const lines = [
    `最近一份快照的数据日期是 ${asOf}，之后已有 ${missed} 个工作日没有新快照，择时观察邮件这几天都不会发。`,
    '如果这几天是 A 股休市（长假），可以忽略。',
    '否则请到 GitHub Actions 查看「ETF timing shadow run」的运行记录：腾讯和东财都失败、任务没被触发、或提交失败都会导致断更。',
    '恢复后第一封邮件会补列断更期间出现的信号。同一个快照日期只提醒这一次。',
  ]
  const url = `${site}${TIMING_SITE_PATH}`
  return {
    key: staleKey(asOf), asOf, missed, subject,
    text: [...lines, `实验页：${url}`].join('\n\n'),
    html: [...lines.map(l => `<p>${esc(l)}</p>`), `<p><a href="${esc(url)}">打开实验页</a></p>`].join('\n'),
  }
}
