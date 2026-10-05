import { SIGNALS, signalTone } from './stages'
import { INDICATORS, MODULES, signalValues, stageFromSnapshot, thresholdText, toneOf, type Indicator, type MacroSnapshot } from './indicators'
import { CN_INDICATORS, CN_MODULES, type CnKey } from './china'

const TONE = { green: '绿', yellow: '黄', red: '红', blue: '—', gray: '不打分' } as const

function rows<K extends string>(snap: MacroSnapshot<K>, indicators: Indicator<K>[], modules: { id: string; name: string }[]) {
  return indicators.filter(i => snap.series[i.key]).map(i => {
    const d = snap.series[i.key]
    return {
      维度: modules.find(m => m.id === i.module)?.name,
      指标: i.name,
      读数: d.latest.value,
      单位: d.unit,
      日期: d.latest.date,
      状态: TONE[toneOf(i, d.latest.value)],
      阈值: thresholdText(i, d.unit === 'pp' || d.unit === '万人' ? '' : d.unit),
      近一年: d.history.slice(-12).map(([date, v]) => [date.slice(0, 7), v]),
    }
  })
}

/** 交给本地模型的输入：页面已用规则算好的全部结果，模型只解释、不重算 */
export function buildDigest(us: MacroSnapshot, cn: MacroSnapshot<CnKey> | null) {
  const { stage, score, entered } = stageFromSnapshot(us)
  const values = signalValues(us)
  return {
    asOf: us.fetchedAt?.slice(0, 10) ?? us.generatedAt,
    stage: {
      name: stage.name,
      score,
      rule: `每项绿 0、黄 1、红 2；≥2 预警，≥5 防御，≥8 危机；已接入 ${entered}/${SIGNALS.length} 项`,
      signals: SIGNALS.map(s => ({ 信号: s.name, 读数: values[s.id] ?? null, 黄灯: s.yellow, 红灯: s.red, 状态: values[s.id] === undefined ? '缺' : TONE[signalTone(s, values[s.id])] })),
      thisStageDoes: stage.does,
      thisStageDoesNot: stage.doesNot,
    },
    us: rows(us, INDICATORS, MODULES),
    cn: cn ? rows(cn, CN_INDICATORS, CN_MODULES) : [],
  }
}
