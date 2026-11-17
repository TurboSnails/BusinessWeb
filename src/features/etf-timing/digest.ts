// ETF 择时每日观察邮件（server/timing-digest.ts 调用）：读 public/data/etf-timing.json，
// 列出最新交易日「沪深300择时＋只认金叉」新出现的信号与择时状态变化。
// 规则仍在验证（docs/TODO-投资工具优化.md ①②），邮件只陈述规则的机械状态，不是买卖指令。
import type { EtfTiming, ShadowItem } from './model'

export const TIMING_SITE_PATH = '/lab/etf-timing'
const MAX_LIST = 30

export type SignalLine = { code: string; name: string; close: number; side: 'buy' | 'sell'; nextOpen: boolean }
export type TimingDigest = {
  asOf: string
  key: string
  bull: boolean | null
  prevBull: boolean | null
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
  code: i.code, name: i.name, close: i.close, side: i.hs.lastSignal!.side,
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
  const today_ = latest.items.filter(i => i.hs.lastSignal?.date === latest.asOf).sort((a, b) => a.code.localeCompare(b.code)).map(line)
  const buys = today_.filter(l => l.side === 'buy'), sells = today_.filter(l => l.side === 'sell')
  return {
    digest: {
      asOf: latest.asOf, key: timingKey(latest.asOf), bull, prevBull, flipped, buys, sells,
      holding: latest.summary.hsHolding, n: latest.summary.n, complete: latest.complete, missing: latest.summary.missing,
      empty: !flipped && !buys.length && !sells.length,
    },
  }
}

const state = (b: boolean | null) => (b === null ? '无数据' : b ? '偏进攻' : '偏防守')
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const fmtLine = (l: SignalLine) => `${l.code} ${l.name}　收盘 ${Number.isFinite(l.close) ? l.close : '—'}${l.side === 'sell' ? (l.nextOpen ? '（下一交易日开盘离场）' : '（已按当日收盘离场）') : ''}`

export const TIMING_FOOTER = '观察中、未通过验证（影子运行需连续 6～12 个月对照回测），不是买卖指令。'
export const TIMING_CAVEAT = '长历史检验：这条规则对中小盘、周期与成长类回撤保护较好，对大盘蓝筹和红利的收益代价大于好处。'

export function composeTimingEmail(d: TimingDigest, site: string): { subject: string; text: string; html: string } {
  const parts = [d.buys.length && `买入信号 ${d.buys.length}`, d.sells.length && `卖出信号 ${d.sells.length}`, d.flipped && `择时转${state(d.bull)}`].filter(Boolean)
  const subject = `ETF 择时观察 · ${d.asOf.slice(5)} · ${parts.join('、')}`
  const sections: Array<{ title: string; lines: string[] }> = []
  const timingLine = `${state(d.bull)}（沪深300÷红利 比值${d.bull === null ? '无数据' : d.bull ? '在 20 日线上方' : '在 20 日线下方'}）${d.flipped ? `，由${state(d.prevBull)}转为${state(d.bull)}` : ''}`
  sections.push({ title: '择时状态', lines: [timingLine, ...(d.bull === false ? ['偏防守时规则不开新仓，已持有的等死叉离场。'] : [])] })
  const list = (xs: SignalLine[]) => [...xs.slice(0, MAX_LIST).map(fmtLine), ...(xs.length > MAX_LIST ? [`另有 ${xs.length - MAX_LIST} 只，见实验页`] : [])]
  if (d.buys.length) sections.push({ title: '新出现的买入信号（规则在下一交易日开盘进场）', lines: list(d.buys) })
  if (d.sells.length) sections.push({ title: '新出现的卖出信号（MACD 死叉）', lines: list(d.sells) })
  const head = `数据日期 ${d.asOf}（收盘），冻结名单 ${d.n} 只，规则「沪深300择时＋只认金叉」；规则持有中 ${d.holding} / ${d.n} 只。`
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
