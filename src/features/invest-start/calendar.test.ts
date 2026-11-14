import { describe, expect, it } from 'vitest'
import { ICS_CAVEAT, buildIcs, escapeText, foldLine } from './calendar'

const review = { id: 'abc-123', anchor: '2027-01-15', intervalMonths: 6 as const, calendarSequence: 2, completedDates: [] as string[] }
const ics = buildIcs({ review, today: '2026-11-14', now: new Date(Date.UTC(2026, 10, 14, 8, 5, 9)), pageUrl: 'https://example.test/invest/start' })
const unfold = (s: string): string => s.replace(/\r\n /g, '')

describe('buildIcs', () => {
  it('CRLF 行尾、必需封装、全天事件与排他结束日', () => {
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.split('\r\n').every(l => !l.includes('\n'))).toBe(true)
    const u = unfold(ics)
    for (const line of [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:abc-123@invest-start.live',
      'DTSTAMP:20261114T080509Z', 'DTSTART;VALUE=DATE:20270115', 'DTEND;VALUE=DATE:20270116',
      'RRULE:FREQ=MONTHLY;INTERVAL=6;COUNT=4', 'SEQUENCE:20000', 'TRANSP:TRANSPARENT', 'CLASS:PRIVATE', 'END:VCALENDAR',
    ]) expect(u).toContain(line)
    expect(u).not.toMatch(/METHOD:|ORGANIZER|ATTENDEE|TZID/)
  })

  it('季度导出 8 次', () => {
    const q = buildIcs({ review: { ...review, intervalMonths: 3 }, today: '2026-11-14', now: new Date(0), pageUrl: 'https://e.test/' })
    expect(unfold(q)).toContain('RRULE:FREQ=MONTHLY;INTERVAL=3;COUNT=8')
  })

  it('含当天 09:00 的 VALARM', () => {
    const u = unfold(ics)
    expect(u).toMatch(/BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:[^\r]+\r\nTRIGGER;RELATED=START:PT9H\r\nEND:VALARM/)
  })

  it('不含金额、百分比或答案', () => {
    const body = unfold(ics).replace(/DTSTAMP:\S+|DTSTART[^\r]+|DTEND[^\r]+|RRULE:[^\r]+|SEQUENCE:\d+|PT9H|VERSION:2\.0/g, '')
    expect(body).not.toMatch(/\d+\s*(元|万|%)/)
    expect(body).not.toMatch(/q[1-9]|answers|route/)
  })

  it('按 UTF-8 75 字节折行，不切断中文，展开后可还原', () => {
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    const long = 'DESCRIPTION:' + '核对资金用途'.repeat(20)
    expect(unfold(foldLine(long))).toBe(long)
    expect(foldLine(long)).not.toContain('�')
  })

  it('TEXT 转义防属性注入', () => {
    expect(escapeText('a;b,c\\d\nEND:VEVENT')).toBe('a\\;b\\,c\\\\d\\nEND:VEVENT')
  })

  it('界面说明写清提醒可能被忽略、改期要删旧系列、文件不含金额', () => {
    expect(ICS_CAVEAT).toMatch(/09:00/)
    expect(ICS_CAVEAT).toMatch(/Google 日历/)
    expect(ICS_CAVEAT).toMatch(/删除旧的整个系列/)
    expect(ICS_CAVEAT).toMatch(/不含任何金额/)
  })
})

// ───── 回归：code-review #2（旧锚点重新导出不能是零个未来提醒）、#6（回链带部署子路径） ─────
import { exportWindow, publicPageUrl } from './calendar'
import { completeReview, occurrence, addMonths } from './checks'

/** 按 RRULE 展开导出的日期（FREQ=MONTHLY;INTERVAL;COUNT，日号 ≤ 28 无需夹值） */
function expand(text: string): string[] {
  const u = text.replace(/\r\n /g, '')
  const start = u.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/)!
  const [, interval, count] = u.match(/RRULE:FREQ=MONTHLY;INTERVAL=(\d+);COUNT=(\d+)/)!
  const first = `${start[1]}-${start[2]}-${start[3]}`
  return Array.from({ length: Number(count) }, (_, k) => addMonths(first, k * Number(interval)))
}

describe('导出窗口：从今天往后滚动', () => {
  const old = { id: 'abc-1', anchor: '2024-01-15', intervalMonths: 6 as const, calendarSequence: 0, completedDates: [] as string[] }

  it('2024 年的旧锚点在 2026-11-14 导出：全部是今天之后的检查日，且与站内 occurrence() 一致', () => {
    const text = buildIcs({ review: old, today: '2026-11-14', now: new Date(0), pageUrl: 'https://e.test/invest/start' })
    const dates = expand(text)
    expect(dates).toEqual([6, 7, 8, 9].map(k => occurrence(old, k)))
    expect(dates[0]).toBe('2027-01-15')
    for (const d of dates) expect(d > '2026-11-14').toBe(true)
  })

  it('初始序列过期后再导出：仍给出未来两年的检查日', () => {
    const first = expand(buildIcs({ review: old, today: '2024-01-01', now: new Date(0), pageUrl: 'https://e.test/' }))
    expect(first.at(-1)).toBe('2025-07-15')
    const later = expand(buildIcs({ review: old, today: '2025-08-01', now: new Date(0), pageUrl: 'https://e.test/' }))
    expect(later[0]).toBe('2026-01-15')
    expect(later).toHaveLength(4)
  })

  it('今天就是检查日：未完成则包含今天；已完成则从下一次开始', () => {
    const r = { ...old, anchor: '2026-11-14' }
    expect(exportWindow(r, '2026-11-14').start).toBe('2026-11-14')
    expect(exportWindow(completeReview(r, '2026-11-14'), '2026-11-14').start).toBe('2027-05-14')
  })

  it('UID 稳定；窗口前移或改期时 SEQUENCE 递增', () => {
    const a = buildIcs({ review: old, today: '2026-11-14', now: new Date(0), pageUrl: 'https://e.test/' })
    const b = buildIcs({ review: old, today: '2027-02-01', now: new Date(0), pageUrl: 'https://e.test/' })
    const c = buildIcs({ review: { ...old, calendarSequence: 1, anchor: '2027-03-01' }, today: '2027-02-01', now: new Date(0), pageUrl: 'https://e.test/' })
    const seq = (t: string) => Number(t.match(/SEQUENCE:(\d+)/)![1])
    const uid = (t: string) => t.match(/UID:([^\r]+)/)![1]
    expect(uid(a)).toBe(uid(b))
    expect(uid(b)).toBe(uid(c))
    expect(seq(b)).toBeGreaterThan(seq(a))
    expect(seq(c)).toBeGreaterThan(seq(b))
  })
})

describe('publicPageUrl', () => {
  it('根路径部署：origin + /invest/start', () => {
    expect(publicPageUrl('https://business-web-black.vercel.app', '/', 'https://business-web-black.vercel.app')).toBe('https://business-web-black.vercel.app/invest/start')
  })
  it('子路径部署：带上 BASE_URL，斜杠只规范一次', () => {
    expect(publicPageUrl('https://someone.github.io', '/BusinessWeb/', 'https://canon.test')).toBe('https://someone.github.io/BusinessWeb/invest/start')
    expect(publicPageUrl('https://someone.github.io/', 'BusinessWeb', 'https://canon.test')).toBe('https://someone.github.io/BusinessWeb/invest/start')
  })
  it('本机开发地址不导出，改用受信的正式站（根路径）', () => {
    expect(publicPageUrl('http://localhost:5173', '/BusinessWeb/', 'https://canon.test/')).toBe('https://canon.test/invest/start')
    expect(publicPageUrl('http://127.0.0.1:5191', '/', 'https://canon.test')).toBe('https://canon.test/invest/start')
    expect(publicPageUrl('null', '/', 'https://canon.test')).toBe('https://canon.test/invest/start')
  })
  it('第四参数可切到 invest/my-plan；默认仍是 invest/start', () => {
    expect(publicPageUrl('https://canon.test', '/', 'https://canon.test', 'invest/my-plan')).toBe('https://canon.test/invest/my-plan')
    expect(publicPageUrl('https://canon.test', '/', 'https://canon.test')).toBe('https://canon.test/invest/start')
  })
})
