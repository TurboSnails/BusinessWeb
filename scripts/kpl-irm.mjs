// 开盘啦「互动问答」页签数据：盘后运行（.github/workflows/kpl-tabs.yml），可重复运行。
// 产出：public/data/kpl-irm.json（索引：近 7 天每日汇总、热门公司、关键词、问询函 / 监管函）
//       public/data/kpl-irm-<星期>.json（某一回复日的问答明细，按星期轮换文件名，只保留最近 7 天）
//       data-raw/kpl-irm/history.json（每日回复条数的长期记录）
// 问答按「回复时间」所在的北京日期归档；每次运行刷新「上一交易日的前一交易日 → 今天」这几天，更早的日子沿用已存文件。
// 来源与字段说明见 scripts/kpl-irm-lib.mjs。请求节奏：每页间隔 1.2 秒以上，每个平台每次最多 40 页（4000 条）。
// 用法：node scripts/kpl-irm.mjs
import fs from 'node:fs'
import path from 'node:path'
import { isTradingDay } from './market-mood-lib.mjs'
import {
  CATS, HEAD_CHARS, KEEP_DAYS, KEYWORDS, LETTER_GROUPS, RULES, addDays, bjFromHttpDate, bjTime, dayFile, mergeItems, mergeLetters, nextTradingDay,
  parseQuotes, parseSseFeed, parseSseLetters, parseSzPage, parseSzseDiscipline, parseSzseInquiry, parseSzseMeasures, refreshDays, sameContent, summarize,
} from './kpl-irm-lib.mjs'

const PUB = 'public/data'
const OUT = path.join(PUB, 'kpl-irm.json')
const RAW = 'data-raw/kpl-irm'
const HISTORY = path.join(RAW, 'history.json')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const MAX_PAGES = 40
const GAP = 1200
const LETTER_DAYS = 30

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)) }
async function req(url, init = {}, kind = 'json') {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { body: kind === 'json' ? await res.json() : await res.text(), date: res.headers.get('date') }
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(3000 * (attempt + 1))
    }
  }
}

const today = bjTime(Date.now()).slice(0, 10)
const days = refreshDays(today)
const minDay = days[0]
const inWindow = (x) => x.at.slice(0, 10) >= minDay && x.at.slice(0, 10) <= today
console.log(`今天（北京）${today}，刷新回复日 ${days.join(', ')}`)

/* ---------- 1. 深交所互动易 ---------- */
async function fetchSz() {
  const items = []
  let total = null, got = 0, pages = 0
  for (let p = 1; p <= MAX_PAGES; p++) {
    const body = new URLSearchParams({ pageNo: String(p), pageSize: '100', searchTypes: '11', highLight: 'false', beginDate: `${minDay} 00:00:00`, endDate: `${today} 23:59:59` })
    const { body: j } = await req('https://irm.cninfo.com.cn/newircs/index/search', {
      method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest', referer: 'https://irm.cninfo.com.cn/views/interactiveAnswer' },
    })
    const page = parseSzPage(j)
    total ??= page.total
    pages = page.pages
    got += j.results.length
    items.push(...page.items.filter(inWindow))
    if (p >= page.pages || !j.results.length) break
    await sleep(GAP)
  }
  const capped = pages > MAX_PAGES
  if (!capped && got < total) throw new Error(`互动易条数不完整（${got}/${total}）`)
  return { items, total, capped }
}
/* ---------- 2. 上证 e 互动 ---------- */
async function fetchSh() {
  const items = []
  let capped = true
  for (let p = 1; p <= MAX_PAGES; p++) {
    const { body: html, date } = await req(`https://sns.sseinfo.com/ajax/feeds.do?type=11&pageSize=100&lastid=-1&show=1&page=${p}`, { headers: { 'x-requested-with': 'XMLHttpRequest', referer: 'https://sns.sseinfo.com/' } }, 'text')
    const now = bjFromHttpDate(date) ?? bjTime(Date.now())
    const page = parseSseFeed(html, now)
    const blocks = html.split('class="m_feed_item"').length - 1
    if (blocks && !page.length) throw new Error('e 互动页面结构变化，解析不到条目')
    items.push(...page.filter(inWindow))
    // 按回复时间倒序：整页都早于窗口起点就停
    if (!page.length || page.every((x) => x.at.slice(0, 10) < minDay)) { capped = false; break }
    await sleep(GAP)
  }
  return { items, capped }
}

const platforms = {}
const fresh = []
for (const [p, fn] of [['sz', fetchSz], ['sh', fetchSh]]) {
  try {
    const r = await fn()
    platforms[p] = { ok: true, capped: r.capped }
    fresh.push(...r.items)
    console.log(`${p}: ${r.items.length} 条（窗口内）${r.capped ? '，达到页数上限' : ''}`)
  } catch (e) {
    platforms[p] = { ok: false, error: e.message }
    console.log(`${p} 抓取失败：${e.message}（该平台沿用已存数据）`)
  }
}
if (!fresh.length && !Object.values(platforms).some((x) => x.ok)) { console.log('两个平台都抓取失败，不写文件'); process.exit(0) }

/* ---------- 3. 按回复日合并 ---------- */
const dayData = new Map()
for (const d of days) {
  const prev = readJson(path.join(PUB, dayFile(d)))
  const old = prev?.version === 1 && prev.date === d ? prev : null
  const mine = fresh.filter((x) => x.at.slice(0, 10) === d)
  const items = mergeItems(old?.items, mine)
  if (!items.length) continue
  dayData.set(d, { old, items })
}

/* ---------- 4. 行情联动（带日期的东财估值报表） ---------- */
const need = new Map() // 交易日 → Set(code)
const plan = new Map()
for (const [d, { items }] of dayData) {
  const day = isTradingDay(d) ? d : null
  const next = nextTradingDay(d)
  plan.set(d, { day, next: next && next <= today ? next : null })
  for (const t of [day, next && next <= today ? next : null]) {
    if (!t) continue
    const s = need.get(t) ?? new Set()
    for (const x of items) s.add(x.code)
    need.set(t, s)
  }
}
const quoteMaps = new Map()
for (const [t, codes] of need) {
  try {
    const list = [...codes]
    const m = new Map()
    for (let i = 0; i < list.length; i += 100) {
      const part = list.slice(i, i + 100)
      const q = new URLSearchParams({ reportName: 'RPT_VALUEANALYSIS_DET', columns: 'SECURITY_CODE,TRADE_DATE,CHANGE_RATE,BOARD_NAME', pageSize: '500', pageNumber: '1', filter: `(TRADE_DATE='${t}')(SECURITY_CODE in (${part.map((c) => `"${c}"`).join(',')}))`, source: 'WEB', client: 'WEB' })
      const { body } = await req(`https://datacenter-web.eastmoney.com/api/data/v1/get?${q}`, { headers: { referer: 'https://data.eastmoney.com/' } })
      if (body?.code === 9201 || !body?.result?.data?.length) { if (i === 0) throw new Error('当日行情尚未发布'); continue }
      for (const [k, v] of parseQuotes(body.result.data, t)) m.set(k, v)
      await sleep(300)
    }
    quoteMaps.set(t, m)
  } catch (e) { console.log(`${t} 行情不可用：${e.message}`) }
}
const pack = (m) => (m ? Object.fromEntries([...m].map(([k, v]) => [k, [v.chg, v.ind]])) : null)

/* ---------- 5. 写每日明细 ---------- */
for (const [d, { old, items }] of dayData) {
  const pl = plan.get(d)
  const dm = pl.day ? quoteMaps.get(pl.day) : null
  const nm = pl.next ? quoteMaps.get(pl.next) : null
  const codes = new Set(items.map((x) => x.code))
  const pick = (m) => (m ? new Map([...m].filter(([k]) => codes.has(k))) : null)
  const quotes = {
    day: dm ? pl.day : old?.quotes?.day ?? null, next: nm ? pl.next : old?.quotes?.next ?? null,
    d: dm ? pack(pick(dm)) : old?.quotes?.d ?? null, n: nm ? pack(pick(nm)) : old?.quotes?.n ?? null,
  }
  const file = {
    version: 1, generatedAt: new Date().toISOString(), date: d,
    platforms: { sz: platforms.sz?.ok ? { ok: true, capped: !!platforms.sz.capped } : old?.platforms?.sz ?? { ok: false }, sh: platforms.sh?.ok ? { ok: true, capped: !!platforms.sh.capped } : old?.platforms?.sh ?? { ok: false } },
    quotes, items,
  }
  if (old && sameContent(file, old)) continue
  write(path.join(PUB, dayFile(d)), file)
  console.log(`${d} → ${dayFile(d)}：${items.length} 条（深 ${items.filter((x) => x.p === 'sz').length} / 沪 ${items.filter((x) => x.p === 'sh').length}）`)
}

/* ---------- 6. 问询函 / 监管函（近 30 日） ---------- */
const prevOut = readJson(OUT)
const from = addDays(today, -LETTER_DAYS)
async function szse(qs) {
  const rows = []
  for (let p = 1; p <= 20; p++) {
    const { body } = await req(`https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&${qs}&PAGENO=${p}`, { headers: { referer: 'https://www.szse.cn/' } })
    if (!Array.isArray(body)) throw new Error('深交所返回结构异常')
    const tab = body.find((t) => Array.isArray(t?.data) && t.data.length) ?? body[0]
    rows.push(...(tab?.data ?? []))
    if (p >= (tab?.metadata?.pagecount ?? 0)) break
    await sleep(GAP)
  }
  return rows
}
async function sse(sqlId, channelId) {
  const rows = []
  for (let p = 1; p <= 20; p++) {
    const q = new URLSearchParams({ siteId: '28', sqlId, channelId, order: 'createTime|desc,stockcode|asc', isPagination: 'true', 'pageHelp.pageSize': '100', 'pageHelp.pageNo': String(p), createTime: `${from} 00:00:00`, createTimeEnd: `${today} 23:59:59` })
    const { body } = await req(`https://query.sse.com.cn/commonSoaQuery.do?${q}`, { headers: { referer: 'https://www.sse.com.cn/' } })
    if (!Array.isArray(body?.result)) throw new Error('上交所返回结构异常')
    rows.push(...body.result)
    if (p >= (body.pageHelp?.pageCount ?? 0) || !body.result.length) break
    await sleep(GAP)
  }
  return rows
}
const letterParts = [
  ['szInquiryMain', async () => parseSzseInquiry(await szse(`CATALOGID=main_wxhj&TABKEY=tab2&txtStart=${from}&txtEnd=${today}`))],
  ['szInquiryGem', async () => parseSzseInquiry(await szse(`CATALOGID=main_wxhj&TABKEY=tab3&txtStart=${from}&txtEnd=${today}`))],
  ['szMeasures', async () => {
    const years = [...new Set([from.slice(0, 4), today.slice(0, 4)])]
    const out = []
    for (const y of years) { out.push(...parseSzseMeasures(await szse(`CATALOGID=1800_jgxxgk&TABKEY=tab1&txtDate=${y}`))); await sleep(GAP) }
    return out
  }],
  ['szDiscipline', async () => parseSzseDiscipline(await szse(`CATALOGID=1759_cxda&TABKEY=tab1&txtStartDate=${from}&txtEndDate=${today}`))],
  ['shInquiry', async () => parseSseLetters(await sse('BS_GGLL', '10743,10744,10012'))],
  ['shMeasures', async () => parseSseLetters(await sse('BS_KCB_GGLL', '10007,10008,10009,10010'))],
]
const letterList = []
const letterErrors = []
for (const [key, fn] of letterParts) {
  try { letterList.push(...(await fn()).map((x) => ({ ...x, src: key }))) } catch (e) { letterErrors.push(key); console.log(`${key} 失败：${e.message}`) }
  await sleep(GAP)
}
let letters
if (letterErrors.length === letterParts.length && prevOut?.letters) letters = prevOut.letters
else {
  // 某一部分失败时，沿用上一份文件里同一来源的条目（用 src 字段区分）
  const kept = (prevOut?.letters?.items ?? []).filter((x) => letterErrors.includes(x.src))
  const items = mergeLetters([...letterList, ...kept].filter((x) => x.date >= from && x.date <= today))
  letters = { from, to: today, items, errors: letterErrors, counts: Object.fromEntries(LETTER_GROUPS.map((g) => [g.id, items.filter((x) => x.group === g.id).length])) }
}

/* ---------- 7. 索引 ---------- */
const summaries = []
for (let i = 0; i < KEEP_DAYS; i++) {
  const d = addDays(today, -i)
  const f = readJson(path.join(PUB, dayFile(d)))
  if (f?.version !== 1 || f.date !== d || !Array.isArray(f.items) || !f.items.length) continue
  summaries.push({ ...summarize(d, f.items, f.quotes), file: dayFile(d), quoteDay: f.quotes?.day ?? null, quoteNext: f.quotes?.next ?? null, platforms: f.platforms })
}
if (!summaries.length) { console.log('近 7 天没有任何问答数据，不写索引'); process.exit(0) }
const hist = new Map((readJson(HISTORY) ?? []).map((h) => [h.date, h]))
for (const s of summaries) hist.set(s.date, { date: s.date, total: s.total, sz: s.sz, sh: s.sh })
const history = [...hist.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-250)
write(HISTORY, history)

const out = {
  version: 1, generatedAt: new Date().toISOString(), asOf: summaries[0].date,
  note: '问答原文来自交易所互动平台，公司回复不等于公告；分类与关键词是机械匹配，不是判断；不构成投资建议。',
  days: summaries, history, letters,
  rules: { headChars: HEAD_CHARS, cats: CATS, list: RULES, keywords: KEYWORDS.map(([kw, words]) => ({ kw, words })) },
  sources: [
    { id: 'irm', label: '深交所互动易（已回复问答）', url: 'https://irm.cninfo.com.cn/views/interactiveAnswer' },
    { id: 'sns', label: '上证 e 互动（最新答复）', url: 'https://sns.sseinfo.com/' },
    { id: 'szse', label: '深交所 监管信息公开（问询函件、监管措施、纪律处分）', url: 'https://www.szse.cn/disclosure/supervision/inquire/index.html' },
    { id: 'sse', label: '上交所 监管信息公开（监管问询、监管措施、纪律处分）', url: 'https://www.sse.com.cn/disclosure/credibility/supervision/inquiries/' },
    { id: 'quote', label: '东方财富数据中心 · 估值分析（每日涨跌幅、行业）', url: 'https://data.eastmoney.com/gzfx/list.html' },
  ],
}
if (sameContent(out, prevOut)) { console.log('索引内容无变化，不写文件'); process.exit(0) }
write(OUT, out)
console.log(JSON.stringify({ asOf: out.asOf, days: summaries.map((s) => [s.date, s.total, s.sz, s.sh, s.quoteDay, s.quoteNext]), letters: letters.items.length, letterErrors }))
