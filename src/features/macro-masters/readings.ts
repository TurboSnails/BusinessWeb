// 宏观大师板块的实时读数（manager 定接口，实现由数据/总览任务完成）
// 接口稳定：useReadings() 与 READING_LABELS 的签名不要改；实现可替换。
import { useEffect, useState } from 'react'
import type { Reading, ReadingKey } from './types'

export type ReadingsState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ok'; readings: Partial<Record<ReadingKey, Reading | null>>; asOf: string }

/** 读取本站已有数据文件，计算各指标最新读数。占位实现：全部返回 null，待实现任务替换。 */
export async function loadReadings(_fetcher: typeof fetch = fetch): Promise<{ readings: Partial<Record<ReadingKey, Reading | null>>; asOf: string }> {
  return { readings: {}, asOf: '' }
}

export function useReadings(): ReadingsState {
  const [state, setState] = useState<ReadingsState>({ state: 'loading' })
  useEffect(() => {
    let alive = true
    loadReadings()
      .then(result => { if (alive) setState({ state: 'ok', ...result }) })
      .catch(error => { if (alive) setState({ state: 'error', message: error instanceof Error ? error.message : '数据加载失败' }) })
    return () => { alive = false }
  }, [])
  return state
}
