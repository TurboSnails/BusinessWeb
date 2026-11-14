// 站内「本周变化」所需的静态 JSON：信号台账（本周与上一周涉及的年份）、牛熊周期自动周报、美国宏观快照。
// 只读站点自己的文件，不需要服务端；单个文件失败时该部分不比较，并在 failed 里写明。
import { useEffect, useState } from 'react'
import { asCycleReport, asLedger, asMacro, ledgerYears, mergeLedgers, type CycleReportLike, type LedgerLike, type MacroLike, type WeekRange } from './weeklySummary'

export interface WeeklyData { ledger: LedgerLike | null; cycle: CycleReportLike | null; macro: MacroLike | null; failed: string[]; loading: boolean }

export function useWeeklyData(week: WeekRange): WeeklyData {
  const [data, setData] = useState<WeeklyData>({ ledger: null, cycle: null, macro: null, failed: [], loading: true })
  const years = ledgerYears(week).join(',')
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const get = async (file: string): Promise<unknown> => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache', signal: controller.signal })
      if (!res.ok) throw new Error(file)
      return res.json()
    }
    const ledgerFiles = years.split(',').map(y => `signal-ledger-${y}.json`)
    const files = ['market-cycle-report.json', 'macro-us.json', ...ledgerFiles]
    void Promise.allSettled(files.map(get)).then(out => {
      if (!active) return
      const value = (i: number): unknown => (out[i].status === 'fulfilled' ? (out[i] as PromiseFulfilledResult<unknown>).value : null)
      const cycle = asCycleReport(value(0)), macro = asMacro(value(1))
      const ledgers = ledgerFiles.map((_, i) => asLedger(value(i + 2)))
      // 跨年时只缺上一年的台账文件属正常（新的一年才开始），不提示
      const failed = [...(cycle ? [] : ['牛熊周期自动周报']), ...(macro ? [] : ['宏观快照']), ...(ledgers.some(Boolean) ? [] : ['信号台账'])]
      setData({ ledger: mergeLedgers(...ledgers), cycle, macro, failed, loading: false })
    })
    return () => { active = false; controller.abort() }
  }, [years])
  return data
}
