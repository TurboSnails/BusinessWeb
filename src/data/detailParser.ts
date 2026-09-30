// 把紧凑文本格式解析成 Company 的补全字段，便于批量录入各公司深度内容。
// 每个公司以 “@市场:代码” 开头，之后每行 “键: 值”，同键多行会累加。
//   rt 评级 | h 结论 | cert 确定性 | dur 增长期限 | ratio 盈亏比说明 | ai AI 的位置
//   m 指标（标签|值，出现则整体替换原指标）
//   t 核心逻辑 | g 增长来源 | o 护城河 | rk 风险与证伪 | x 口径与陷阱 | c 验证日历
//   s 情景（名称|概率|假设|倍数|隐含价|相对现价|触发）
//   z 合理买入区 | a 确认加仓 | r 减仓止盈 | i 失效条件 | p 仓位原则
//   pf 公司简介 | seg 业务分布（名称|占比|说明）| pro 优势 | con 缺点 | ind 行业趋势
//   bull / bear / verdict 多空交锋
import type { Company } from './companies'

export const parseDetails = (text: string): Record<string, Partial<Company>> => {
  const out: Record<string, Partial<Company>> = {}
  let key = ''
  let cur: Partial<Company> | null = null
  const push = <T,>(arr: T[] | undefined, v: T): T[] => [...(arr || []), v]
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('@')) {
      key = line.slice(1).trim()
      cur = {}
      out[key] = cur
      continue
    }
    if (!cur) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim()
    if (!v) continue
    switch (k) {
      case 'rt': cur.rating = v; break
      case 'h': cur.headline = v; break
      case 'cert': cur.certainty = v; break
      case 'dur': cur.duration = v; break
      case 'ratio': cur.ratioNote = v; break
      case 'ai': cur.aiNote = v; break
      case 'm': {
        const [l, ...rest] = v.split('|')
        cur.metrics = push(cur.metrics, [l.trim(), rest.join('|').trim()] as [string, string])
        break
      }
      case 't': cur.thesis = push(cur.thesis, v); break
      case 'g': cur.growth = push(cur.growth, v); break
      case 'o': cur.moat = push(cur.moat, v); break
      case 'rk': cur.risk = push(cur.risk, v); break
      case 'x': cur.pitfalls = push(cur.pitfalls, v); break
      case 'c': cur.calendar = push(cur.calendar, v); break
      case 's': {
        const [name, prob, assumption, multiple, price, change, trigger] = v.split('|').map(x => x.trim())
        cur.scenarios = push(cur.scenarios, { name, prob: prob || undefined, assumption, multiple: multiple || undefined, price, change, trigger: trigger || '' })
        break
      }
      case 'pf': cur.profile = v; break
      case 'seg': {
        const [name, share, note] = v.split('|').map(x => x.trim())
        cur.segments = push(cur.segments, { name, share: share || undefined, note: note || undefined })
        break
      }
      case 'pro': cur.pros = push(cur.pros, v); break
      case 'con': cur.cons = push(cur.cons, v); break
      case 'ind': cur.industry = push(cur.industry, v); break
      case 'z': cur.discipline = { ...cur.discipline, zone: v }; break
      case 'a': cur.discipline = { ...cur.discipline, add: v }; break
      case 'r': cur.discipline = { ...cur.discipline, trim: v }; break
      case 'i': cur.discipline = { ...cur.discipline, invalid: v }; break
      case 'p': cur.discipline = { ...cur.discipline, position: v }; break
      case 'bull': cur.bullBear = { bull: v, bear: cur.bullBear?.bear || '', verdict: cur.bullBear?.verdict || '' }; break
      case 'bear': cur.bullBear = { bull: cur.bullBear?.bull || '', bear: v, verdict: cur.bullBear?.verdict || '' }; break
      case 'verdict': cur.bullBear = { bull: cur.bullBear?.bull || '', bear: cur.bullBear?.bear || '', verdict: v }; break
      default: break
    }
  }
  return out
}

// 合并多份解析结果：后者的同名字段覆盖前者
export const mergeDetails = (...list: Record<string, Partial<Company>>[]): Record<string, Partial<Company>> => {
  const out: Record<string, Partial<Company>> = {}
  for (const d of list) for (const [k, v] of Object.entries(d)) out[k] = { ...(out[k] || {}), ...v }
  return out
}
