// Official Hang Seng Indexes constituent lists (HSI / HSTECH), parsed from the public website's own API.
// The API only exposes a real-time snapshot: every constituent row carries the server's dateTime, which
// becomes the list's snapshot date (NOT an effective-change date). Anything inconsistent (count mismatch,
// mixed timestamps, wrong index identity, missing detail) is rejected outright; nothing is inferred.
const HSI_API = 'https://www.hsi.com.hk/api/wsit-hsi-ddoc-ea-public-website-proxy/v1/product-data/pub/constituent/metadata/v2'
export { HSI_API }

export const HK_INDEX_CODES = { hsi: '00001.00', hstech: '02083.00' }
const HK_INDEX_NAMES = { hsi: 'Hang Seng Index', hstech: 'Hang Seng TECH Index' }
const MIN_HK = 20, MAX_HK = 120

/** The only accepted source URL for an official HK list; anything else fails the whitelist. */
export const hkSourceUrl = market => `${HSI_API}?data=rt&seriesCode=${market}&language=en-hk`
export const isOfficialHkSource = (u, market) => !!u && u.source === hkSourceUrl(market)

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s

/**
 * metadata/v2 rt body -> { date, source, codes }. The full index bucket (e.g. 00001.00) is the
 * constituent list; the sub-index buckets (00001.01…) overlap and are ignored. Payload identity is
 * verified against the expected indexCode/indexName, every row must belong to that index with
 * isDummy=N, and `date` is the single snapshot timestamp shared by all rows — rows with differing
 * timestamps mean no confirmed date exists.
 */
export function parseHkUniverse(body, market, today) {
  if (!body || body.code !== '0') throw new Error(`恒生官方接口错误 ${body?.code ?? '无响应码'}`)
  const indexCode = HK_INDEX_CODES[market]
  const head = body.data?.numOfConsList?.[0]
  if (head?.indexCode !== indexCode || head?.indexName !== HK_INDEX_NAMES[market]) throw new Error(`指数身份不符 ${head?.indexCode}/${head?.indexName}`)
  if (!Number.isInteger(head?.count) || head.count <= 0) throw new Error('官方成分计数缺失或无效')
  const detail = body.data?.viewConsDetail?.[indexCode]
  if (!Array.isArray(detail) || !detail.length) throw new Error('缺少官方成分明细viewConsDetail')
  if (detail.length !== head.count) throw new Error(`成分数量与官方计数不符 ${detail.length}/${head.count}`)
  const dates = new Set()
  const codes = []
  const seen = new Set()
  for (const r of detail) {
    if (r?.indexCode !== indexCode || r?.stockType !== 'HK' || r?.isDummy !== 'N') throw new Error(`成分记录身份异常 ${String(r?.stockCode ?? '?')}`)
    const rawCode = String(r?.stockCode ?? '').trim()
    if (!/^\d{1,5}$/.test(rawCode) || Number(rawCode) === 0) throw new Error(`成分代码格式异常 ${rawCode || '?'}`)
    const code = rawCode.padStart(5, '0') // 1 and 00001 are the same stock
    if (seen.has(code)) throw new Error(`成分代码重复 ${code}`)
    seen.add(code)
    codes.push(code)
    const dt = String(r?.dateTime ?? '')
    const m = /^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}$/.exec(dt)
    if (!m || !isDate(m[1])) throw new Error(`成分dateTime无效 ${dt.slice(0, 30)}`)
    dates.add(m[1])
  }
  if (dates.size !== 1) throw new Error(`成分dateTime不一致：${[...dates].join('、')}`)
  const [date] = dates
  const universe = { date, source: hkSourceUrl(market), codes }
  if (!isDate(date) || date > today) throw new Error('名单日期无效')
  return universe
}

/** Download + validate one official HK list (counts as one request). Size bounds are enforced here, on top of the parser. */
export async function fetchHkUniverse({ market, fetchImpl = fetch, today }) {
  const res = await fetchImpl(hkSourceUrl(market), { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const u = parseHkUniverse(await res.json(), market, today)
  if (u.codes.length < MIN_HK || u.codes.length > MAX_HK) throw new Error(`名单规模或重复异常 ${u.codes.length}`)
  return u
}
