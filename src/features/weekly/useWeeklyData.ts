// 站内「本周变化」所需的静态 JSON：信号台账（本周与上一周涉及的年份）、牛熊周期自动周报、美国宏观快照、财报前瞻 earnings-calendar.json。
// 只读站点自己的文件，不需要服务端。单个来源失败时写进 failed；重新读取失败时沿用上次成功读到的数据（写进 retained），不清空已有内容。
import { useEffect, useState } from 'react'
import { loadEarningsCalendar } from '../earnings/loadCalendar'
import { asCycleReport, asLedger, asMacro, ledgerYears, mergeLedgers, type CycleReportLike, type EarningsCalendarLike, type LedgerLike, type MacroLike, type WeekRange } from './weeklySummary'

/** 参与周度比较的来源（财报日历只作背景，不在其中） */
export const WEEKLY_SOURCES = ['牛熊周期自动周报', '宏观快照', '信号台账'] as const

interface Sources {
  cycle: CycleReportLike | null
  macro: MacroLike | null
  ledgers: Record<string, LedgerLike | null>
  earnings: EarningsCalendarLike | null
  /** 本次财报前瞻读取失败（背景信息，不算比较来源） */ earningsFailed: boolean
  /** 本次读取失败的比较来源 */ failed: string[]
  /** 本次失败、但沿用了上次读取结果的来源 */ retained: string[]
}

export interface WeeklyData extends Sources {
  ledger: LedgerLike | null
  /** 首次读取或重新读取进行中 */ loading: boolean
  /** 已有一次读取结果、正在重新读取 */ refreshing: boolean
  retry: () => void
}

const initial: Sources = { cycle: null, macro: null, ledgers: {}, earnings: null, earningsFailed: false, failed: [], retained: [] }

export function useWeeklyData(week: WeekRange): WeeklyData {
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const years = ledgerYears(week).join(',')
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    const get = async <T,>(file: string, parse: (v: unknown) => T | null): Promise<T | null> => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache', signal: controller.signal })
        return res.ok ? parse(await res.json()) : null
      } catch { return null }
    }
    const yearList = years.split(',')
    // 财报前瞻与公司页、候选池「财报临近」共用一次请求（模块级缓存）
    void Promise.all([
      get('market-cycle-report.json', asCycleReport), get('macro-us.json', asMacro),
      Promise.all(yearList.map(year => get(`signal-ledger-${year}.json`, asLedger))),
      loadEarningsCalendar(controller.signal),
    ]).then(([cycle, macro, ledgers, earnings]) => {
      if (!active) return
      setData(previous => {
        const failed: string[] = [], retained: string[] = []
        const keep = <T,>(name: string, next: T | null, prior: T | null): T | null => {
          if (next !== null) return next
          failed.push(name)
          if (prior !== null) retained.push(name)
          return prior
        }
        const nextCycle = keep('牛熊周期自动周报', cycle, previous.cycle)
        const nextMacro = keep('宏观快照', macro, previous.macro)
        const nextLedgers: Record<string, LedgerLike | null> = Object.fromEntries(yearList.map((year, i) => [year, ledgers[i] ?? previous.ledgers[year] ?? null]))
        // 跨年时只缺上一年的台账文件属正常（新的一年才开始）：只有所有年份都读不到才算台账读取失败；
        // 本周一期或上一期确实缺失时，由摘要的比较说明写明。
        if (!ledgers.some(Boolean)) {
          failed.push('信号台账')
          if (Object.values(nextLedgers).some(Boolean)) retained.push('信号台账')
        }
        return {
          cycle: nextCycle,
          macro: nextMacro,
          ledgers: nextLedgers,
          // 财报前瞻只是背景信息：读不到时沿用上次结果，不计入 failed
          earnings: earnings ?? previous.earnings,
          earningsFailed: earnings === null,
          failed, retained,
        }
      })
      setLoading(false)
    })
    return () => { active = false; controller.abort() }
  }, [years, attempt])
  return { ...data, ledger: mergeLedgers(...Object.values(data.ledgers)), loading, refreshing: loading && attempt > 0, retry: () => setAttempt(n => n + 1) }
}
