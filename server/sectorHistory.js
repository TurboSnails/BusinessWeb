// Server-only Supabase cache; credentials never reach the browser.
export function databaseConfig() {
  const key = process.env.SUPABASE_SECRET_KEY
  try {
    const url = new URL(process.env.SUPABASE_URL || '')
    if (!key || url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) return null
    const headers = { apikey: key, 'Content-Type': 'application/json' }
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`
    return { url: `${url.origin}/rest/v1/businessweb_sector_history`, headers }
  } catch { return null }
}
export function validPayload(payload, date) {
  if (payload?.code !== 200 || !Array.isArray(payload?.data?.plate_stock)) return false
  return payload.data.plate_stock.every(plate => plate && typeof plate === 'object' && Array.isArray(plate.stock_list) && plate.stock_list.every(stock => {
    const time = String(stock?.time || '')
    return !/^\d{4}-\d{2}-\d{2}/.test(time) || time.slice(0, 10) === date
  }))
}
export function isFresh(record, date, now = Date.now()) {
  if (!validPayload(record?.payload, date)) return false
  const fetchedAt = Date.parse(record.fetched_at)
  if (!Number.isFinite(fetchedAt) || fetchedAt > now) return false
  // Only a nonempty snapshot captured after the trading day's close is immutable.
  const finalized = fetchedAt >= Date.parse(`${date}T07:15:00Z`) && record.payload.data.plate_stock.length > 0
  return finalized || now - fetchedAt < 30_000
}
async function databaseRequest(config, query, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2_000)
  try {
    const response = await fetch(config.url + query, { ...options, headers: { ...config.headers, ...options.headers }, signal: controller.signal, redirect: 'error' })
    if (!response.ok) throw new Error('Database unavailable')
    return options.method === 'POST' ? null : await response.json()
  } finally { clearTimeout(timer) }
}
export async function readHistory(config, date, mode) {
  const rows = await databaseRequest(config, `?trade_date=eq.${date}&up_limit=eq.${mode}&select=payload,fetched_at&limit=1`)
  return Array.isArray(rows) ? rows[0] : null
}
export async function writeHistory(config, date, mode, payload) {
  await databaseRequest(config, '?on_conflict=trade_date,up_limit', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ trade_date: date, up_limit: Number(mode), payload, fetched_at: new Date().toISOString() }),
  })
}
