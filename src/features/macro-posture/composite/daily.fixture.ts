// 每日档位的类型化样例（真实文件由生成脚本输出前，用于开发与测试）。
import type { DailyFile, TierCode } from './types'

type Options = {
  start?: string
  end?: string
  recessions?: [string, string][]
  /** 最终档位每多少个交易日换一档 */
  finalEvery?: number
  /** 周期档位每多少个交易日换一档 */
  regimeEvery?: number
}

const TIER_NAMES = ['进攻', '偏进攻', '中性', '偏防守', '防守']

function isoDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** 工作日序列（不排除节假日），收盘价指数增长并带一点起伏，便于检验对数轴与抽稀。 */
export function makeDailyFixture(options: Options = {}): DailyFile {
  const {
    start = '1976-01-02',
    end = '2026-11-20',
    recessions = [['2008-01-01', '2009-06-30'], ['2020-02-03', '2020-04-30']],
    finalEvery = 23,
    regimeEvery = 97,
  } = options
  const dates: string[] = []
  const endTime = Date.parse(`${end}T00:00:00Z`)
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= endTime; time += 86_400_000) {
    const weekday = new Date(time).getUTCDay()
    if (weekday !== 0 && weekday !== 6) dates.push(isoDay(time))
  }
  const rows: DailyFile['rows'] = dates.map((d, index) => {
    const close = Math.round(90 * Math.pow(1.00032, index) * (1 + 0.06 * Math.sin(index / 37)) * 100) / 100
    const regime = (index < 5 ? -1 : Math.floor(index / regimeEvery) % 5) as TierCode
    const final = (index < 5 ? -1 : Math.floor(index / finalEvery) % 5) as TierCode
    const next = dates[index + 1]
    const official: 0 | 1 = next !== undefined && next.slice(0, 7) !== d.slice(0, 7) ? 1 : 0
    const rec: 0 | 1 = recessions.some(([from, to]) => d >= from && d <= to) ? 1 : 0
    return [d, close, regime, final, official, rec]
  })
  const changes: DailyFile['changes'] = []
  for (let index = 1; index < rows.length; index += 1) {
    const [d, , regime, final] = rows[index]
    const [, , prevRegime, prevFinal] = rows[index - 1]
    if (regime !== prevRegime) {
      changes.push({
        d,
        from: prevRegime,
        to: regime,
        layer: 'regime',
        reason: `经济周期打分变化，周期档位由${TIER_NAMES[prevRegime] ?? '证据不足'}转为${TIER_NAMES[regime] ?? '证据不足'}`,
      })
    }
    if (final !== prevFinal) {
      changes.push({
        d,
        from: prevFinal,
        to: final,
        layer: 'final',
        reason: index % 2 ? '本月至今均价跌破十个月均线，战术修正下调一档' : '本月至今均价重回十个月均线上方，战术修正解除',
      })
    }
  }
  return {
    generatedAt: `${end}T22:00:00.000Z`,
    ruleVersion: 'v2.2',
    start: rows[0][0],
    end: rows[rows.length - 1][0],
    rows,
    changes: changes.slice(-200),
    disclosures: ['样例数据，仅用于开发与测试。'],
  }
}

export const dailyFixture: DailyFile = makeDailyFixture()
