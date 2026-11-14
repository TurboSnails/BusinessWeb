// 检查日 .ics（RFC 5545；arch-r2 §5 + signoff-product #3 的 09:00 VALARM）。
// 全天事件 + 有限 RRULE；不含金额、答案、标的、额度或任何私人参数。
import { addDays, exportCount, occurrence } from './checks'
import type { Day, ReviewSchedule } from './types'

export const ICS_SUMMARY = '投资计划检查'
export const ICS_DESCRIPTION = '核对资金用途、产品与配置比例；达到事先定的调整条件才调整。本文件不含任何金额。'
export const ICS_FILENAME = 'invest-review.ics'

/** 界面上与下载按钮放在一起的说明（不宣称提醒一定会响） */
export const ICS_CAVEAT = '文件里带了检查日当天 09:00 的提醒设置，但部分日历（如 Google 日历导入时）可能忽略文件里的提醒，导入后请自己确认已开启通知。改期需要先在日历里删除旧的整个系列，再导入新文件。文件不含任何金额。'

/** TEXT 值转义：反斜杠、分号、逗号、换行 */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}

const enc = new TextEncoder()

/** 按 UTF-8 最多 75 字节折行，不切断多字节字符；续行以一个空格开头 */
export function foldLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = out.length === 0 ? 75 : 74 // 续行首个空格占 1 字节
    if (bytes + b > limit) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

const compactDate = (day: string): string => day.replace(/-/g, '')
const pad = (n: number): string => String(n).padStart(2, '0')
export const utcStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

/** 窗口每前移一期 SEQUENCE +1；改期（calendarSequence +1）一定大于任何窗口偏移 */
const SEQUENCE_STRIDE = 10000

/**
 * 导出窗口：与站内 occurrence() 同源，从原锚点数出第一个「今天及以后」的检查日；
 * 今天这一期已标记完成则从下一期开始。旧锚点或初始序列过期后重新导出，仍是未来约两年的检查日。
 */
export function exportWindow(r: Pick<ReviewSchedule, 'anchor' | 'intervalMonths' | 'completedDates'>, today: Day): { startIndex: number; start: Day } {
  let k = 0
  while (k < SEQUENCE_STRIDE - 1 && occurrence(r, k) < today) k++
  if (occurrence(r, k) === today && r.completedDates.includes(today)) k++
  return { startIndex: k, start: occurrence(r, k) }
}

export interface IcsInput {
  review: Pick<ReviewSchedule, 'id' | 'anchor' | 'intervalMonths' | 'calendarSequence' | 'completedDates'>
  /** 本地今天；决定导出窗口的起点 */
  today: Day
  now: Date
  /** 站点公开地址（来自受信配置，不接受用户输入） */
  pageUrl: string
}

export function buildIcs({ review, today, now, pageUrl }: IcsInput): string {
  const win = exportWindow(review, today)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Live//invest-start//ZH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${review.id}@invest-start.live`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;VALUE=DATE:${compactDate(win.start)}`,
    `DTEND;VALUE=DATE:${compactDate(addDays(win.start, 1))}`,
    `RRULE:FREQ=MONTHLY;INTERVAL=${review.intervalMonths};COUNT=${exportCount(review.intervalMonths)}`,
    // 同一 UID：窗口前移或改期都提高 SEQUENCE，支持的日历会用新文件替换旧系列
    `SEQUENCE:${review.calendarSequence * SEQUENCE_STRIDE + win.startIndex}`,
    `SUMMARY:${escapeText(ICS_SUMMARY)}`,
    `DESCRIPTION:${escapeText(ICS_DESCRIPTION)}`,
    `URL:${pageUrl}`,
    'TRANSP:TRANSPARENT',
    'CLASS:PRIVATE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(ICS_SUMMARY)}`,
    'TRIGGER;RELATED=START:PT9H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

export type PublicPagePath = 'invest/start' | 'invest/my-plan'

/**
 * 日历回链：当前部署的 origin + 构建时的 BASE_URL（GitHub Pages 为 /BusinessWeb/）+ path。
 * 只用受信来源（当前页面 origin 或配置的正式站），不接受用户输入、不带查询参数；
 * 本机开发地址不导出，改用正式站（它部署在根路径）。
 * 第四参数默认 'invest/start'，现有调用不变。
 */
export function publicPageUrl(
  locationOrigin: string,
  baseUrl: string,
  siteOrigin: string,
  path: PublicPagePath = 'invest/start',
): string {
  const trim = (s: string): string => s.replace(/\/+$/, '')
  let origin: string | null = null
  try {
    const u = new URL(locationOrigin)
    if ((u.protocol === 'https:' || u.protocol === 'http:') && !LOCAL_HOSTS.has(u.hostname)) origin = u.origin
  } catch { /* 非法 origin（如 "null"）走正式站 */ }
  if (!origin) return `${trim(siteOrigin)}/${path}`
  const base = baseUrl.split('/').filter(Boolean).join('/')
  return `${trim(origin)}/${base ? `${base}/` : ''}${path}`
}

/** 显式点击后生成并下载；下载后释放 ObjectURL。无网络请求 */
export function downloadIcs(text: string, doc: Document = document): void {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = doc.createElement('a')
  a.href = url
  a.download = ICS_FILENAME
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
