import type { DailyReview } from '../../types'
import { PULSE_SYNC_CONFIG_KEY, loadReviews, loadTombstones, saveReviews, saveTombstones, backupReviews } from '../../utils/storage'
import type { ReviewTombstone } from '../../utils/storage'
import { validPulsePayload, validReviewItem, isTombstone } from './validation'
import type { ReviewRecord } from './validation'

export type SyncConfig = { endpoint: string; token: string }
export type SyncSummary = { added: string[]; updated: string[]; deleted: string[]; pulled: number }
export type SyncStatus = 'not-configured' | 'invalid-config' | 'cancelled' | 'synced' | 'error'
export type SyncResult = { status: SyncStatus; reviews?: DailyReview[]; summary?: SyncSummary; error?: string; domain?: string }
export type Confirms = {
  target: (domain: string, count: number) => boolean | Promise<boolean>
  // 上传包含删除或覆盖云端已有记录时，必须由用户确认；返回 false 则不上传
  changes: (summary: SyncSummary) => boolean | Promise<boolean>
  // 服务端拒绝“记录数骤减”时，是否仍要强制写入
  shrink: () => boolean | Promise<boolean>
}
type Item = ReviewRecord | ReviewTombstone
const EPOCH = '1970-01-01T00:00:00.000Z'
const TOMBSTONE_TTL = 180 * 24 * 60 * 60 * 1000

export function validConfig(config: SyncConfig | null | undefined): config is SyncConfig {
  if (!config || typeof config.endpoint !== 'string' || typeof config.token !== 'string' || config.token.trim().length < 32) return false
  try {
    const url = new URL(config.endpoint)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PULSE_SYNC_CONFIG_KEY) ?? 'null') as SyncConfig | null
    return validConfig(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function saveSyncConfig(config: SyncConfig, confirmTarget: Confirms['target']): Promise<boolean> {
  if (!validConfig(config)) return false
  if (!await confirmTarget(new URL(config.endpoint).origin, 0)) return false
  localStorage.setItem(PULSE_SYNC_CONFIG_KEY, JSON.stringify({ endpoint: config.endpoint.trim(), token: config.token.trim() }))
  return true
}

export function clearSyncConfig(): void {
  localStorage.removeItem(PULSE_SYNC_CONFIG_KEY)
}

// 本地复盘 → 严格字段（丢弃未知字段、补默认值）；legacy 无 updatedAt 的记录按最早时间参与合并
export function normalizeReview(review: DailyReview): ReviewRecord {
  const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  const str = (value: unknown): string => (typeof value === 'string' ? value : '')
  return {
    date: review.date, weekday: str(review.weekday),
    ztCount: num(review.ztCount), ztSealRate: str(review.ztSealRate), ztOpen: num(review.ztOpen),
    dtCount: num(review.dtCount), dtSealRate: str(review.dtSealRate), dtOpen: num(review.dtOpen),
    volume: num(review.volume), upDown: str(review.upDown), shszcy: str(review.shszcy),
    lbRate: str(review.lbRate), lbCount: num(review.lbCount), maxBoard: num(review.maxBoard),
    top5Amount: num(review.top5Amount), top5Turnover: num(review.top5Turnover),
    inflow: str(review.inflow), outflow: str(review.outflow),
    updatedAt: review.updatedAt && !Number.isNaN(Date.parse(review.updatedAt)) ? review.updatedAt : EPOCH,
  }
}

const stamp = (item: Item): number => Date.parse(item.updatedAt)
const canonical = (item: Item): string => JSON.stringify(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))

export function mergeReviews(local: Item[], cloud: Item[]): Item[] {
  const merged = new Map<string, Item>()
  for (const item of [...cloud, ...local]) {
    const previous = merged.get(item.date)
    if (!previous) { merged.set(item.date, item); continue }
    const a = stamp(item); const b = stamp(previous)
    if (a === b && !isTombstone(item) && !isTombstone(previous) && canonical(item) !== canonical(previous)) {
      // 同一时间戳但内容不同：不猜测，停止同步
      if (item.updatedAt === EPOCH) continue // legacy 本地无时间戳 → 云端优先
      throw new Error(`${item.date} 的本地与云端记录时间相同但内容不同；请先导出备份，修改该条后再同步`)
    }
    if (a > b || (a === b && isTombstone(item) && !isTombstone(previous))) merged.set(item.date, item)
  }
  return [...merged.values()]
}

export function summarize(cloud: Item[], merged: Item[]): SyncSummary {
  const before = new Map(cloud.map(item => [item.date, item]))
  const summary: SyncSummary = { added: [], updated: [], deleted: [], pulled: 0 }
  for (const item of merged) {
    const old = before.get(item.date)
    if (isTombstone(item)) { if (old && !isTombstone(old)) summary.deleted.push(item.date); continue }
    if (!old || isTombstone(old)) summary.added.push(item.date)
    else if (canonical(old) !== canonical(item)) summary.updated.push(item.date)
  }
  return summary
}

export async function syncReviews(config: SyncConfig | null | undefined, confirms: Confirms, fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  if (!config) return { status: 'not-configured' }
  if (!validConfig(config)) return { status: 'invalid-config', error: '同步地址必须是 HTTPS，token 至少 32 个字符' }
  const url = new URL(config.endpoint)
  const localReviews = loadReviews()
  if (!await confirms.target(url.origin, localReviews.length)) return { status: 'cancelled', domain: url.origin }

  // 校验本地数据；不合规就停止，绝不静默丢弃或截断
  const localItems: Item[] = []
  for (const review of localReviews) {
    const item = normalizeReview(review)
    if (!validReviewItem(item)) return { status: 'error', error: `本地 ${String(review.date)} 的复盘数据不合规（日期/数值/长度），请修正后再同步`, domain: url.origin }
    localItems.push(item)
  }
  const localTombstones = loadTombstones().filter(t => validReviewItem(t))
  const snapshot = JSON.stringify([localReviews, localTombstones])
  const headers = { authorization: `Bearer ${config.token.trim()}`, 'content-type': 'application/json' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const get = await fetchImpl(config.endpoint, { method: 'GET', headers, signal: controller.signal, redirect: 'error' })
    if (get.status === 401) throw new Error('同步 token 无效')
    if (!get.ok) throw new Error(`读取云端复盘失败（HTTP ${get.status}）`)
    const etag = get.headers.get('etag')
    const cloud: unknown = await get.json()
    if (!validPulsePayload(cloud) || !etag) throw new Error('云端数据结构无效，未执行上传')

    const merged = mergeReviews([...localItems, ...localTombstones], cloud.reviews)
    const now = Date.now()
    const kept = merged.filter(item => !isTombstone(item) || now - stamp(item) < TOMBSTONE_TTL)
    // 上传前给 legacy 记录补时间戳（仅当它在合并中胜出）
    const uploadTime = new Date().toISOString()
    const toUpload = kept.map(item => (stamp(item) === 0 && !isTombstone(item) ? { ...item, updatedAt: uploadTime } : item))
    const summary = summarize(cloud.reviews, toUpload)
    summary.pulled = toUpload.filter(item => !isTombstone(item) && !localItems.some(l => l.date === item.date && canonical(l) === canonical(item))).length
    const sig = (items: Item[]): string => JSON.stringify([...items].sort((a, b) => a.date.localeCompare(b.date)).map(canonical))
    const needUpload = sig(toUpload) !== sig(cloud.reviews)

    if (needUpload) {
      if ((summary.deleted.length > 0 || summary.updated.length > 0) && !await confirms.changes(summary)) {
        return { status: 'cancelled', summary, domain: url.origin }
      }
      const put = (allow: boolean) => fetchImpl(config.endpoint, {
        method: 'PUT', signal: controller.signal, redirect: 'error',
        headers: { ...headers, 'if-match': etag, ...(allow ? { 'x-allow-shrink': '1' } : {}) },
        body: JSON.stringify({ schemaVersion: 1, reviews: toUpload }),
      })
      let response = await put(false)
      if (response.status === 422) {
        if (!await confirms.shrink()) return { status: 'cancelled', summary, domain: url.origin }
        response = await put(true)
      }
      if (response.status === 409) throw new Error('其他设备已更新云端复盘；本地数据已保留，请重新同步')
      if (!response.ok) throw new Error(`写入云端复盘失败（HTTP ${response.status}）`)
    }

    // 同步期间本地被其他页面改过 → 不覆盖本地
    if (JSON.stringify([loadReviews(), loadTombstones()]) !== snapshot) throw new Error('同步期间本地复盘已被修改；云端已更新，本地保持不变，请重新同步')
    const active = toUpload.filter((item): item is ReviewRecord => !isTombstone(item)).sort((a, b) => b.date.localeCompare(a.date))
    backupReviews(localReviews)
    saveReviews(active)
    saveTombstones(toUpload.filter(isTombstone))
    return { status: 'synced', reviews: active, summary, domain: url.origin }
  } catch (error) {
    if (controller.signal.aborted) return { status: 'error', error: '同步请求超时', domain: url.origin }
    return { status: 'error', error: error instanceof Error ? error.message : '同步失败', domain: url.origin }
  } finally {
    clearTimeout(timeout)
  }
}
