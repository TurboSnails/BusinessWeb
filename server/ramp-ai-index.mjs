// 解析 Ramp AI Index 页面的 Tokenomics 表（服务端渲染的 HTML），得到一期快照。
// 页面结构变了就抛错，不返回残缺数据；调用方保留旧快照。
export const RAMP_URL = 'https://ramp.com/data/ai-index'

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
const VENDORS = { Anthropic: 'anthropic', OpenAI: 'openai', xAI: 'xai', Google: 'google', Cursor: 'cursor' }

const decode = text => text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').trim()

function isoDate(text) {
  const m = /([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(text)
  if (!m || !MONTHS[m[1]]) throw new Error(`无法识别日期：${text}`)
  return `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

const ratio = n => Number((n / 100).toFixed(6))
const percent = text => {
  const m = /([+-]?\d+(?:\.\d+)?)\s*%/.exec(text)
  if (!m) throw new Error(`无法识别百分比：${text}`)
  return ratio(Number(m[1]))
}
const dollars = text => {
  const m = /\$(\d+(?:\.\d+)?)/.exec(text)
  if (!m) throw new Error(`无法识别价格：${text}`)
  return Number(m[1])
}

/** @returns 一期快照；字段口径见 docs/ai-token-economics.md */
export function parseRampAiIndex(html) {
  const start = html.indexOf('Tokenomics</h3>')
  if (start < 0) throw new Error('页面缺少 Tokenomics 部分')
  const end = html.indexOf('</table>', start)
  if (end < 0) throw new Error('Tokenomics 表格不完整')
  const section = html.slice(start, end)

  const intro = /Total token spending (rose|fell|declined|increased|decreased) ([\d.]+)%\.\s*Total token volume (rose|fell|declined|increased|decreased) ([\d.]+)%/.exec(decode(section))
  if (!intro) throw new Error('无法读取总支出与总用量变化')
  const sign = word => (['fell', 'declined', 'decreased'].includes(word) ? -1 : 1)
  const tokenSpend = sign(intro[1]) * ratio(Number(intro[2]))
  const tokenUsage = sign(intro[3]) * ratio(Number(intro[4]))

  const rows = [...section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => decode(c[1])))
  const header = rows.find(r => r[0] === 'Metric')
  if (!header || header.length < 4) throw new Error('缺少表头')
  const weekEnding = isoDate(header[1])
  const comparedWeekEnding = isoDate(header[2])

  const spendShare = {}, volumeShare = {}
  const price = {}
  for (const r of rows) {
    const [label, now, prev] = r
    let m = /^Share of token (spend|volume): (.+)$/.exec(label)
    if (m && VENDORS[m[2]]) {
      ;(m[1] === 'spend' ? spendShare : volumeShare)[VENDORS[m[2]]] = { now: percent(now), prev: percent(prev) }
      continue
    }
    m = /^Blended price per million tokens: (.+)$/.exec(label)
    if (m) {
      const key = m[1] === 'OpenAI & Anthropic' ? 'combined' : VENDORS[m[1]]
      if (key) price[key] = { now: dollars(now), prev: dollars(prev), change: percent(r[3]) }
    }
  }
  for (const key of ['combined', 'openai', 'anthropic']) if (!price[key]) throw new Error(`缺少综合价格：${key}`)
  if (!spendShare.anthropic || !spendShare.openai) throw new Error('缺少 Token 支出份额')

  return { weekEnding, comparedWeekEnding, tokenUsage, tokenSpend, price, spendShare, volumeShare, source: RAMP_URL }
}

export async function fetchRampAiIndex(fetchImpl = fetch) {
  const res = await fetchImpl(RAMP_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (BusinessWeb data refresh)' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`Ramp 返回 HTTP ${res.status}`)
  return parseRampAiIndex(await res.text())
}

/** 按 weekEnding 去重、升序；同一周重复抓取以新值覆盖 */
export function mergeSnapshot(history, snapshot) {
  const rest = (history ?? []).filter(s => s.weekEnding !== snapshot.weekEnding)
  return [...rest, snapshot].sort((a, b) => a.weekEnding.localeCompare(b.weekEnding))
}

/** 本地开发（npm run dev）：/api/ai-token-economics 由本机直接抓取 */
export async function rampMiddleware(req, res, next) {
  if (!req.url?.startsWith('/api/ai-token-economics')) return next()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  try {
    res.end(JSON.stringify(await fetchRampAiIndex()))
  } catch (error) {
    res.statusCode = 502
    res.end(JSON.stringify({ error: '数据源暂时不可用' }))
  }
}
