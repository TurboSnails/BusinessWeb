// Vercel Cron → GitHub workflow_dispatch。GitHub 自带的 schedule 常迟到 6–10 小时，
// 这里由 Vercel Cron（vercel.json `crons`，UTC）按时调用，再用 PAT 触发对应工作流。
// GitHub 的 schedule 仍保留作兜底；重复运行的处理见 docs/data-maintenance.md「Vercel Cron 准点触发」。
//
// 环境变量（Production）：
//   CRON_SECRET            Vercel 调用 cron 时自动带 `Authorization: Bearer <CRON_SECRET>`
//   GITHUB_DISPATCH_TOKEN  细粒度 PAT，仅限本仓库，Actions: Read and write
import { requireCron } from './cron-auth.js'

export const REPO = 'TurboSnails/BusinessWeb'
export const REF = 'main'

/**
 * 允许触发的工作流（白名单）。skipIfSucceededWithinMinutes：最近这么多分钟内已有成功运行就不再派发；
 * 0 表示只在已有排队/运行中的同一工作流时跳过（每日分析一天两次核验，第二次不能因第一次成功而跳过）。
 */
export const WORKFLOWS = Object.freeze({
  'daily-analysis-snapshot.yml': { skipIfSucceededWithinMinutes: 0 },
  'company-refresh.yml': { skipIfSucceededWithinMinutes: 360 },
  'spread-snapshot.yml': { skipIfSucceededWithinMinutes: 360 },
  'etf-technical.yml': { skipIfSucceededWithinMinutes: 360 },
})

const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending'])
const GITHUB_TIMEOUT_MS = 10_000

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'businessweb-cron-dispatch',
  }
}

/** 已在排队/运行的同一工作流，或窗口内已成功的运行 → 返回跳过原因；查询失败返回 null（宁可重复也不漏跑） */
export async function findDuplicate({ fetchImpl, token, workflow, now, skipIfSucceededWithinMinutes }) {
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${REF}&per_page=10`
  const response = await fetchImpl(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS) })
  if (!response.ok) return { error: `GitHub 查询运行记录 HTTP ${response.status}` }
  const runs = (await response.json())?.workflow_runs ?? []
  const active = runs.find(run => ACTIVE.has(run.status))
  if (active) return { reason: `已有${active.status === 'in_progress' ? '运行中' : '排队中'}的运行`, run: summarize(active) }
  if (skipIfSucceededWithinMinutes > 0) {
    const since = now.getTime() - skipIfSucceededWithinMinutes * 60_000
    const recent = runs.find(run => run.status === 'completed' && run.conclusion === 'success' && Date.parse(run.created_at) >= since)
    if (recent) return { reason: `${skipIfSucceededWithinMinutes} 分钟内已有成功运行`, run: summarize(recent) }
  }
  return null
}

const summarize = run => ({ id: run.id, event: run.event, status: run.status, conclusion: run.conclusion ?? null, createdAt: run.created_at, url: run.html_url })

export function createCronDispatch({ fetchImpl = globalThis.fetch, env = process.env, now = () => new Date(), log = console } = {}) {
  return async function cronDispatch(req, res) {
    if (!requireCron(req, res, { env, log, tag: 'cron-dispatch' })) return

    const workflow = req.query?.workflow
    const config = typeof workflow === 'string' && Object.hasOwn(WORKFLOWS, workflow) ? WORKFLOWS[workflow] : null
    if (!config) return res.status(400).json({ ok: false, error: '工作流不在白名单内', allowed: Object.keys(WORKFLOWS) })

    const token = env.GITHUB_DISPATCH_TOKEN
    if (!token) {
      log.error(`[cron-dispatch] GITHUB_DISPATCH_TOKEN 未配置，${workflow} 未触发`)
      return res.status(503).json({ ok: false, workflow, error: 'GITHUB_DISPATCH_TOKEN 未配置' })
    }

    const at = now()
    let duplicateCheck = 'ok'
    try {
      const duplicate = await findDuplicate({ fetchImpl, token, workflow, now: at, ...config })
      if (duplicate?.reason) {
        log.info(`[cron-dispatch] ${workflow} 跳过：${duplicate.reason}`)
        return res.status(200).json({ ok: true, workflow, dispatched: false, skipped: duplicate.reason, run: duplicate.run })
      }
      if (duplicate?.error) duplicateCheck = duplicate.error
    } catch (error) {
      duplicateCheck = `GitHub 查询运行记录失败：${error?.name === 'TimeoutError' ? '超时' : 'network'}`
    }
    if (duplicateCheck !== 'ok') log.warn(`[cron-dispatch] ${workflow} 去重检查不可用（${duplicateCheck}），照常派发`)

    let response
    try {
      response = await fetchImpl(`https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
        method: 'POST',
        headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: REF }),
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      })
    } catch (error) {
      log.error(`[cron-dispatch] ${workflow} 派发请求失败：${error?.name === 'TimeoutError' ? '超时' : 'network'}`)
      return res.status(502).json({ ok: false, workflow, error: 'GitHub 派发请求失败' })
    }
    if (response.status !== 204 && response.status !== 200) {
      let message = ''
      try { message = String((await response.json())?.message ?? '').slice(0, 200) } catch { /* 非 JSON 响应 */ }
      log.error(`[cron-dispatch] ${workflow} 派发失败 HTTP ${response.status} ${message}`)
      return res.status(502).json({ ok: false, workflow, error: `GitHub 派发失败 HTTP ${response.status}`, githubMessage: message || undefined })
    }
    log.info(`[cron-dispatch] ${workflow} 已派发（${at.toISOString()}）`)
    return res.status(200).json({ ok: true, workflow, dispatched: true, ref: REF, at: at.toISOString(), duplicateCheck })
  }
}

export default createCronDispatch()
