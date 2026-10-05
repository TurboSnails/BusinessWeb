// @ts-ignore 测试在 Node 中运行
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AiInterpretation from './AiInterpretation'
import { buildDigest } from './digest'
import type { MacroSnapshot } from './indicators'
import type { CnKey } from './china'

const us = JSON.parse(readFileSync(resolve('public/data/macro-us.json'), 'utf8')) as MacroSnapshot
const cn = JSON.parse(readFileSync(resolve('public/data/macro-cn.json'), 'utf8')) as MacroSnapshot<CnKey>
const result = {
  interpretation: {
    summary: '当前为预警，主要来自区域银行连续跑输。',
    changes: [{ indicator: 'KRE', direction: '变坏', evidence: '9 月起连续 4 周跑输' }],
    analogs: [{ period: '2023 年 3 月', similar: '区域银行承压', different: '信用利差未走阔' }],
    watch: [{ item: 'HY 利差', trigger: '升破 400bp' }],
    caveats: '单项信号噪音大',
  },
  asOf: us.generatedAt, stage: '预警',
  execution: { backend: 'codex', requestedModelId: 'default', resolvedModelId: 'gpt-x' },
  createdAt: '2026-10-05T12:00:00Z',
}

class FakeEventSource {
  static last: FakeEventSource | null = null
  onmessage: ((m: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) { FakeEventSource.last = this }
  send(e: object) { this.onmessage?.({ data: JSON.stringify(e) }) }
  close() {}
}
const posted: unknown[] = []
const service = vi.fn(async (url: string, init?: RequestInit) => {
  if (init?.body) posted.push(JSON.parse(String(init.body)))
  return {
    ok: true, status: 200,
    json: async () => url.endsWith('/health') ? { ok: true, token: 't', features: ['macro-interpret'] }
      : url.includes('/backends') ? [{ id: 'codex', installed: true, cliVersion: '1', canListModels: true }]
      : url.includes('/models') ? [{ backend: 'codex', modelId: 'gpt-x', displayName: 'GPT X', availability: 'verified', isDefault: false }]
      : { id: 'm1', state: 'queued' },
  } as Response
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })

describe('宏观 AI 解读', () => {
  it('交给模型的输入包含阶段规则、信号和中美指标的近一年走势', () => {
    const d = buildDigest(us, cn)
    expect(d.stage.rule).toMatch(/≥2 预警/)
    expect(d.stage.signals.length).toBe(6)
    expect(d.us.length).toBeGreaterThan(10)
    expect(d.cn.length).toBeGreaterThan(5)
    expect(d.us[0].近一年.length).toBeLessThanOrEqual(12)
  })

  it('选择本地模型生成解读：显示进度，完成后展示结果并保留', async () => {
    vi.stubGlobal('fetch', service)
    vi.stubGlobal('EventSource', FakeEventSource)
    render(<AiInterpretation us={us} cn={cn} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /GPT X · 已验证/ })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('模型版本'), { target: { value: 'gpt-x' } })
    fireEvent.click(screen.getByRole('button', { name: '生成解读' }))
    await waitFor(() => expect(FakeEventSource.last?.url).toContain('/macro/jobs/m1/events'))
    expect((posted[posted.length - 1] as { modelId: string; digest: { stage: object } }).modelId).toBe('gpt-x')
    act(() => FakeEventSource.last!.send({ id: 1, jobId: 'm1', type: 'activity', stage: 'analyzing', payload: { message: '模型正在推理', chars: 320, preview: 'KRE 连续跑输' } }))
    expect(screen.getByText(/模型已输出 320 字/)).toBeTruthy()
    act(() => FakeEventSource.last!.send({ id: 2, jobId: 'm1', type: 'completed', stage: 'completed', payload: { report: result } }))
    expect(screen.getByText(/当前为预警，主要来自区域银行连续跑输/)).toBeTruthy()
    expect(screen.getByText(/AI 解读仅供参考，阶段以规则为准/)).toBeTruthy()
    expect(JSON.parse(sessionStorage.getItem('macro-ai-last')!).stage).toBe('预警')
  })

  it('离开再回来仍显示上次的解读；数据更新后提示重新解读', () => {
    sessionStorage.setItem('macro-ai-last', JSON.stringify({ ...result, asOf: '2026-09-01' }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('离线')))
    render(<AiInterpretation us={us} cn={cn} />)
    expect(screen.getByText(/当前为预警/)).toBeTruthy()
    expect(screen.getByText(/基于 2026-09-01 的数据/)).toBeTruthy()
  })

  it('本地服务是旧版本时，直接提示重启而不是报“接口不存在”', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.endsWith('/health') ? { ok: true, token: 't', version: 1 } : url.includes('/backends') ? [{ id: 'codex', installed: true }] : []) }) as Response))
    render(<AiInterpretation us={us} cn={cn} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/旧版本.*npm run valuation:server/)
    expect(screen.queryByRole('button', { name: '生成解读' })).toBeNull()
  })

  it('快照不是实时数据时，生成解读前先刷新，并把体检结果随解读保存', async () => {
    vi.stubGlobal('fetch', service)
    vi.stubGlobal('EventSource', FakeEventSource)
    const fresh = { us: { ...us, fetchedAt: new Date().toISOString() }, cn }
    const onRefresh = vi.fn(async () => fresh)
    render(<AiInterpretation us={us} cn={cn} onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '生成解读' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '生成解读' }))
    await waitFor(() => expect(FakeEventSource.last?.url).toContain('/macro/jobs/'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    const sent = posted[posted.length - 1] as { digest: { asOf: string; dataQuality: object } }
    expect(sent.digest.asOf).toBe(fresh.us.fetchedAt.slice(0, 10))
    expect(sent.digest.dataQuality).toBeTruthy()
    act(() => FakeEventSource.last!.send({ id: 9, jobId: 'm1', type: 'completed', stage: 'completed', payload: { report: result } }))
    expect(screen.getByText(/解读时的数据：已先刷新为最新/)).toBeTruthy()
  })
})
