// 开盘啦「互动问答」页签（/market-mood/irm）的纯计算。功能对照开盘啦 App「互动易」与「重点监控 / 问询函」。
// 数据来源（2026-11-18 实测，均为交易所公开页面，无需登录；robots.txt 均未禁止）：
//   深交所互动易  POST https://irm.cninfo.com.cn/newircs/index/search  表单 searchTypes=11（已回复问答）、pageNo、pageSize≤100、
//                 beginDate / endDate（按 updateDate 过滤，北京时间）。字段：indexId、stockCode、companyShortName、mainContent（提问）、
//                 attachedContent（回复）、pubDate（提问时间，毫秒）、attachedPubDate（回复时间，毫秒）、trade（证监会行业）。
//                 注意 updateDate 可能晚于回复时间（平台夜间批量更新），所以按回复日归档要用 attachedPubDate，并把查询窗口放宽到今天。
//   上证 e 互动   GET https://sns.sseinfo.com/ajax/feeds.do?type=11&pageSize=100&page=N  「最新答复」HTML 片段，按回复时间倒序。
//                 时间是相对写法（「N分钟前」「今天 HH:mm」「昨天 HH:mm」「MM月DD日 HH:mm」「YYYY年MM月DD日 HH:mm」），
//                 以响应头 Date 换算的北京时间为基准解析。
//   深交所 问询函件   https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=main_wxhj（主板 tab2 / 创业板 tab3，txtStart/txtEnd）
//   深交所 监管措施   CATALOGID=1800_jgxxgk（txtDate=年度）；纪律处分 CATALOGID=1759_cxda（txtStartDate/txtEndDate）
//                     函件 PDF 在 https://reportdocs.static.szse.cn + encode-open 路径
//   上交所 监管问询   https://query.sse.com.cn/commonSoaQuery.do?sqlId=BS_GGLL&channelId=10743,10744,10012（问询函）
//   上交所 监管措施   sqlId=BS_KCB_GGLL&channelId=10007（监管警示）,10008（通报批评）,10009（公开谴责 / 公开认定）,10010（监管工作函）
//   行情联动          东方财富数据中心 RPT_VALUEANALYSIS_DET（带 TRADE_DATE 的每日收盘、CHANGE_RATE 涨跌幅、BOARD_NAME 行业）
// 提问人昵称等个人信息一律不保存。分类是按关键词的机械匹配，不是判断。
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'

export const Q_MAX = 160 // 提问最多保留字数
export const A_MAX = 300 // 回复最多保留字数（实测回复中位数约 90 字，P90 约 260 字）
export const KEEP_DAYS = 7 // 按回复日保留最近 7 个自然日
export const HOT_N = 20

const str = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))
const isCode = (c) => /^\d{6}$/.test(str(c))
export const num = (x) => (x === null || x === undefined || str(x).trim() === '' || str(x).trim() === '-' || !Number.isFinite(Number(x)) ? null : Number(x))
export const round = (x, n = 2) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n)
export const addDays = (date, k) => new Date(Date.parse(`${date}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10)

/** 毫秒时间戳 → 北京时间 'YYYY-MM-DD HH:mm'（无效返回 null） */
export function bjTime(ms) {
  const t = num(ms)
  if (t === null || t <= 0) return null
  return new Date(t + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
}

/* ---------------- 文本清洗 ---------------- */
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—' }
export function cleanText(s) {
  return str(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, k) => ENT[k.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}
/** 截断到 n 字；返回 [文本, 是否截断] */
export function clip(s, n) {
  const chars = [...s]
  return chars.length > n ? [chars.slice(0, n).join('') + '…', true] : [s, false]
}

/* ---------------- 分类规则（机械关键词匹配，按优先级取第一条命中的） ---------------- */
// 回复开头的客套话先去掉，「澄清否认」只看去掉客套话后的前 80 字，避免把结尾的「不构成承诺」之类当成否认。
const GREETING = /^(?:(?:尊敬的)?投资者|(?:您|你)好|感谢(?:您|你)?(?:的)?(?:关注|提问|支持)|谢谢(?:您|你)?(?:的)?(?:关注|提问)?|董秘(?:您|你)?好)[，,。.!！：:、\s]*/
export function stripGreeting(a) {
  let s = str(a).trim()
  for (let i = 0; i < 6; i++) { const t = s.replace(GREETING, ''); if (t === s) break; s = t }
  return s
}
export const RULES = [
  { id: 'clarify', label: '澄清否认', scope: 'head', words: ['不涉及', '未涉及', '暂未涉及', '没有涉及', '暂不涉及', '不存在', '未开展', '暂未开展', '没有开展', '不属实', '并非', '未与', '暂未与', '没有与', '无相关', '暂无相关', '未从事', '不从事', '不生产', '没有生产', '未直接', '暂无此', '没有此', '未有'] },
  { id: 'risk', label: '风险提示', scope: 'all', words: ['风险提示', '存在不确定性', '存在较大不确定性', '存在重大不确定性', '减值', '亏损', '诉讼', '仲裁', '立案', '行政处罚', '退市', '风险警示', '停产', '违约'] },
  { id: 'dividend', label: '分红回购', scope: 'all', words: ['分红', '派息', '股息', '现金红利', '利润分配', '回购', '增持', '市值管理', '估值提升'] },
  { id: 'order', label: '订单合同', scope: 'all', words: ['订单', '合同', '中标', '签约', '签订', '框架协议', '定点', '供货', '在手'] },
  { id: 'capacity', label: '产能产品', scope: 'all', words: ['产能', '投产', '量产', '扩产', '产线', '生产线', '出货', '送样', '样品', '认证', '小批量', '批量'] },
  { id: 'progress', label: '业务进展', scope: 'all', words: ['进展', '推进', '合作', '布局', '研发', '开发', '拓展', '落地', '突破', '试点'] },
]
export const OTHER = { id: 'other', label: '其他' }
export const CATS = [...RULES.map(({ id, label }) => ({ id, label })), OTHER]
export const HEAD_CHARS = 80

/** 按回复全文（截断前）分类 */
export function classify(answer) {
  const full = str(answer)
  const head = [...stripGreeting(full)].slice(0, HEAD_CHARS).join('')
  for (const r of RULES) {
    const text = r.scope === 'head' ? head : full
    if (r.words.some((w) => text.includes(w))) return r.id
  }
  return OTHER.id
}

/* ---------------- 关键词热度（只数提问文本） ---------------- */
export const KEYWORDS = [
  ['人工智能', ['人工智能', 'AI', 'ai', '大模型']], ['算力', ['算力']], ['数据中心', ['数据中心', 'IDC']], ['液冷', ['液冷']],
  ['光模块 / CPO', ['光模块', 'CPO', '光通信']], ['服务器', ['服务器']], ['芯片 / 半导体', ['芯片', '半导体', '晶圆', '封装']], ['存储', ['存储']],
  ['机器人', ['机器人']], ['人形机器人', ['人形机器人']], ['具身智能', ['具身智能']], ['固态电池', ['固态电池']], ['锂电', ['锂电', '锂电池', '正极', '负极', '电解液']],
  ['储能', ['储能']], ['光伏', ['光伏']], ['氢能', ['氢能', '氢燃料']], ['核电 / 核聚变', ['核电', '核聚变', '可控核']], ['低空经济', ['低空', '无人机', 'eVTOL', '飞行汽车']],
  ['商业航天', ['商业航天', '卫星', '火箭']], ['军工', ['军工', '军品', '国防']], ['华为', ['华为', '鸿蒙', '昇腾']], ['英伟达', ['英伟达', 'NVIDIA']],
  ['脑机接口', ['脑机']], ['量子', ['量子']], ['创新药', ['创新药', '临床']], ['并购重组', ['并购', '重组', '收购']], ['分红回购', ['分红', '回购', '增持', '市值管理']],
  ['海外 / 出海', ['海外', '出海', '出口']], ['稀土', ['稀土']], ['智能驾驶', ['智能驾驶', '自动驾驶', '智驾']], ['消费电子', ['消费电子', '手机']],
  ['跨境支付 / 稳定币', ['跨境支付', '稳定币', '数字货币']], ['数据要素', ['数据要素', '数据资产']],
]
export function keywordHeat(items, top = HOT_N) {
  const out = []
  for (const [kw, words] of KEYWORDS) {
    const hit = items.filter((x) => words.some((w) => x.q.includes(w)))
    if (!hit.length) continue
    out.push({ kw, n: hit.length, companies: new Set(hit.map((x) => `${x.p}${x.code}`)).size })
  }
  return out.sort((a, b) => b.n - a.n || b.companies - a.companies || a.kw.localeCompare(b.kw)).slice(0, top)
}

/* ---------------- 深交所互动易 ---------------- */
/** 一条已回复问答 → 紧凑条目；缺代码 / 缺回复 / 缺回复时间返回 null */
export function parseSzItem(r) {
  const code = str(r?.stockCode)
  const at = bjTime(r?.attachedPubDate)
  const answer = cleanText(r?.attachedContent)
  if (!isCode(code) || !at || !answer || !r?.indexId) return null
  const [q, qCut] = clip(cleanText(r.mainContent), Q_MAX)
  const [a, aCut] = clip(answer, A_MAX)
  return {
    id: `sz${str(r.indexId)}`, p: 'sz', code, name: cleanText(r.companyShortName), q, a, ...(qCut || aCut ? { cut: 1 } : {}),
    at, qt: bjTime(r.pubDate), cat: classify(answer),
    url: `https://irm.cninfo.com.cn/ircs/question/questionDetail?questionId=${encodeURIComponent(str(r.indexId))}`,
  }
}
/** 互动易一页响应 → { total, pages, items }；结构不对时抛错 */
export function parseSzPage(body) {
  if (!body || !Array.isArray(body.results) || !Number.isFinite(Number(body.totalRecord))) throw new Error('互动易返回结构异常')
  return { total: Number(body.totalRecord), pages: Number(body.totalPage) || 0, items: body.results.map(parseSzItem).filter(Boolean) }
}

/* ---------------- 上证 e 互动 ---------------- */
/** 相对时间 → 'YYYY-MM-DD HH:mm'；now 为北京时间 'YYYY-MM-DD HH:mm'。认不出返回 null */
export function resolveSseTime(s, now) {
  const t = cleanText(s)
  const today = now.slice(0, 10)
  let m
  if ((m = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})$/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')} ${m[4].padStart(2, '0')}:${m[5]}`
  if ((m = t.match(/^(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})$/))) {
    const y = Number(today.slice(0, 4))
    let d = `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
    if (d > today) d = `${y - 1}${d.slice(4)}`
    return `${d} ${m[3].padStart(2, '0')}:${m[4]}`
  }
  if ((m = t.match(/^今天\s*(\d{1,2}):(\d{2})$/))) return `${today} ${m[1].padStart(2, '0')}:${m[2]}`
  if ((m = t.match(/^昨天\s*(\d{1,2}):(\d{2})$/))) return `${addDays(today, -1)} ${m[1].padStart(2, '0')}:${m[2]}`
  if ((m = t.match(/^(\d+)\s*(秒|分钟|小时)前$/))) {
    const k = Number(m[1]) * (m[2] === '秒' ? 1 : m[2] === '分钟' ? 60 : 3600) * 1000
    const base = Date.parse(`${now.replace(' ', 'T')}:00+08:00`)
    return bjTime(base - k)
  }
  if (t === '刚刚') return now
  return null
}
/** 「最新答复」HTML 片段 → 条目；now 为北京时间 */
export function parseSseFeed(html, now) {
  const out = []
  for (const block of str(html).split('class="m_feed_item"').slice(1)) {
    const idm = block.match(/^\s*id="item-(\d+)"/)
    const qa = block.split('class="m_feed_detail m_qa"')
    if (!idm || qa.length < 2) continue
    const qTxt = qa[0].match(/<div class="m_feed_txt"[^>]*>([\s\S]*?)<\/div>/)
    const aTxt = qa[1].match(/<div class="m_feed_txt"[^>]*>([\s\S]*?)<\/div>/)
    const firm = qTxt?.[1].match(/<a[^>]*href='user\.do\?uid=(\d+)'[^>]*>\s*:?([^<(（]*)[(（](\d{6})[)）]\s*<\/a>/)
    const qTime = qa[0].match(/<div class="m_feed_from"[^>]*>\s*<span>([^<]+)<\/span>/)
    const aTime = qa[1].match(/<div class="m_feed_from"[^>]*>\s*<span>([^<]+)<\/span>/)
    if (!firm || !aTxt || !aTime) continue
    const answer = cleanText(aTxt[1])
    const at = resolveSseTime(aTime[1], now)
    if (!answer || !at) continue
    const [q, qCut] = clip(cleanText(qTxt[1].replace(firm[0], '')), Q_MAX)
    const [a, aCut] = clip(answer, A_MAX)
    out.push({
      id: `sh${idm[1]}`, p: 'sh', code: firm[3], name: cleanText(firm[2]), q, a, ...(qCut || aCut ? { cut: 1 } : {}),
      at, qt: qTime ? resolveSseTime(qTime[1], now) : null, cat: classify(answer),
      url: `https://sns.sseinfo.com/company.do?uid=${firm[1]}`,
    })
  }
  return out
}
/** HTTP Date 头 → 北京时间 'YYYY-MM-DD HH:mm' */
export const bjFromHttpDate = (h) => { const t = Date.parse(str(h)); return Number.isFinite(t) ? bjTime(t) : null }

/* ---------------- 按回复日归档 ---------------- */
/** 需要刷新的回复日：从上一交易日的前一交易日到 today（含周末、节假日）。更早的日子沿用已存的文件 */
export function refreshDays(today) {
  const last = isTradingDay(today) ? today : prevTradingDay(today)
  const from = prevTradingDay(last)
  const out = []
  for (let d = from; d <= today; d = addDays(d, 1)) out.push(d)
  return out
}
/** 合并：同 id 以新抓到的为准；按回复时间倒序 */
export function mergeItems(oldItems, fresh) {
  const m = new Map((oldItems ?? []).map((x) => [x.id, x]))
  for (const x of fresh) m.set(x.id, x)
  return [...m.values()].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
}
/** 文件名按星期轮换，7 个文件自然只保留最近 7 天（不用删文件） */
const SLOTS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const slotOf = (date) => SLOTS[new Date(`${date}T00:00:00Z`).getUTCDay()]
export const dayFile = (date) => `kpl-irm-${slotOf(date)}.json`

/** 行情：RPT_VALUEANALYSIS_DET 行 → Map(code → { chg, ind })；日期必须一致 */
export function parseQuotes(rows, date) {
  const m = new Map()
  for (const r of rows ?? []) {
    if (str(r?.TRADE_DATE).slice(0, 10) !== date) throw new Error(`行情日期不符（${r?.TRADE_DATE} ≠ ${date}）`)
    if (!isCode(r.SECURITY_CODE)) continue
    m.set(str(r.SECURITY_CODE), { chg: round(num(r.CHANGE_RATE)), ind: str(r.BOARD_NAME).trim() || null })
  }
  return m
}
/** 回复对应的观察交易日：交易日 15:00 前回复 → 当日；收盘后或非交易日 → 下一交易日 */
export function nextTradingDay(date) {
  let d = date
  for (let i = 0; i < 30; i++) { d = addDays(d, 1); if (isTradingDay(d)) return d }
  return null
}

/** 汇总一天：分类计数、热门公司、关键词热度。quotes = { day, next, d: {code: [涨跌幅, 行业]}, n: {...} } */
export function summarize(date, items, quotes) {
  const cats = Object.fromEntries(CATS.map((c) => [c.id, 0]))
  for (const x of items) cats[x.cat] = (cats[x.cat] ?? 0) + 1
  const byCo = new Map()
  for (const x of items) {
    const k = `${x.p}${x.code}`
    const c = byCo.get(k) ?? { code: x.code, name: x.name, p: x.p, n: 0, cats: {} }
    c.n++
    c.cats[x.cat] = (c.cats[x.cat] ?? 0) + 1
    if (x.name) c.name = x.name
    byCo.set(k, c)
  }
  const hot = [...byCo.values()].sort((a, b) => b.n - a.n || a.code.localeCompare(b.code)).slice(0, HOT_N)
    .map((c) => ({ ...c, chg: quotes?.d?.[c.code]?.[0] ?? null, next: quotes?.n?.[c.code]?.[0] ?? null, ind: quotes?.d?.[c.code]?.[1] ?? quotes?.n?.[c.code]?.[1] ?? null }))
  return {
    date, total: items.length, sz: items.filter((x) => x.p === 'sz').length, sh: items.filter((x) => x.p === 'sh').length,
    companies: byCo.size, cats, hot, keywords: keywordHeat(items),
  }
}

/* ---------------- 问询函 / 监管函 ---------------- */
/** 函件类型 → 分组 */
export function letterGroup(type, source) {
  const t = str(type)
  if (source === 'discipline' || /谴责|批评|处分|认定|不适合担任/.test(t)) return 'discipline'
  if (/关注/.test(t)) return 'attention'
  if (/问询/.test(t)) return 'inquiry'
  return 'supervision'
}
export const LETTER_GROUPS = [
  { id: 'inquiry', label: '问询函' }, { id: 'attention', label: '关注函' }, { id: 'supervision', label: '监管函 / 监管措施' }, { id: 'discipline', label: '纪律处分' },
]
const SZ_DOC = 'https://reportdocs.static.szse.cn'
const szLink = (html) => { const m = str(html).match(/encode-open='([^']+)'/); return m ? SZ_DOC + m[1] : null }
const linkText = (html) => cleanText(html)
const ymd = (v) => (/^\d{4}-\d{2}-\d{2}/.test(str(v)) ? str(v).slice(0, 10) : null)

/** 深交所问询函件（main_wxhj） */
export function parseSzseInquiry(rows) {
  return (rows ?? []).map((r) => {
    const date = ymd(r.fhrq)
    if (!date) return null
    const type = cleanText(r.hjlb)
    const reply = szLink(r.hfck)
    return { ex: 'sz', code: isCode(r.gsdm) ? str(r.gsdm) : null, name: cleanText(r.gsjc), date, type, group: letterGroup(type), title: `${cleanText(r.gsjc)} ${type}`, url: szLink(r.ck), ...(reply ? { reply, replyTitle: linkText(r.hfck) } : {}) }
  }).filter(Boolean)
}
/** 深交所监管措施（1800_jgxxgk） */
export function parseSzseMeasures(rows) {
  return (rows ?? []).map((r) => {
    const date = ymd(r.gkxx_gdrq)
    if (!date) return null
    const type = cleanText(r.gkxx_jgcs)
    const name = cleanText(r.gkxx_gsjc)
    const target = cleanText(str(r.gkxx_sjdx).replace(/<br\s*\/?>/gi, '、'))
    return { ex: 'sz', code: isCode(r.gkxx_gsdm) ? str(r.gkxx_gsdm) : null, name, date, type, group: letterGroup(type), title: `${name || '（未列公司）'} ${type}${target ? `（涉及：${target}）` : ''}`, url: szLink(r.hjnr) }
  }).filter(Boolean)
}
/** 深交所纪律处分（1759_cxda） */
export function parseSzseDiscipline(rows) {
  return (rows ?? []).map((r) => {
    const date = ymd(r.fhrq)
    if (!date) return null
    const type = cleanText(r.cflb)
    return { ex: 'sz', code: isCode(r.gsdm) ? str(r.gsdm) : null, name: cleanText(r.jc_gsjc), date, type, group: letterGroup(type, 'discipline'), title: cleanText(r.hjbt), url: szLink(r.ck) }
  }).filter(Boolean)
}
/** 上交所（BS_GGLL 监管问询 / BS_KCB_GGLL 监管措施与纪律处分） */
export function parseSseLetters(rows) {
  return (rows ?? []).map((r) => {
    const date = ymd(r.createTime)
    if (!date) return null
    const type = cleanText(r.extTYPE || r.extWTFL) || '函件'
    const code = isCode(r.stockcode) ? str(r.stockcode) : isCode(r.extSECURITY_CODE) ? str(r.extSECURITY_CODE) : null
    const url = str(r.docURL) ? (/^https?:/.test(r.docURL) ? str(r.docURL) : `https://${str(r.docURL).replace(/^\/+/, '')}`) : null
    return { ex: 'sh', code, name: cleanText(r.extGSJC), date, type, group: letterGroup(type, ['10008', '10009'].includes(str(r.channelId)) ? 'discipline' : undefined), title: cleanText(r.docTitle), url }
  }).filter(Boolean)
}
/** 去重（同交易所、同日、同标题、同链接）并按日期倒序 */
export function mergeLetters(list) {
  const m = new Map()
  for (const x of list) m.set([x.ex, x.date, x.title, x.url].join('|'), x)
  return [...m.values()].sort((a, b) => b.date.localeCompare(a.date) || a.ex.localeCompare(b.ex) || str(a.code).localeCompare(str(b.code)))
}

export const sameContent = (a, b) => { if (!a || !b) return false; const { generatedAt: _x, ...x } = a; const { generatedAt: _y, ...y } = b; return JSON.stringify(x) === JSON.stringify(y) }
