export interface LifeMessage { role: 'user' | 'assistant'; content: string }
export const FIRST_QUESTION = '假设三年后，你已经过上真正想要的生活：一个普通星期二，从起床到睡觉，你会怎样度过？请描述实际做什么、和谁在一起、靠什么维持生活，先不要用“自由”“幸福”“有钱”这些抽象词。'
export const MAX_ANSWER = 2000
export const MAX_MESSAGES = 48
export const MIN_REPORT_ANSWERS = 5

export function validConversation(value: unknown): value is LifeMessage[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_MESSAGES) return false
  let total = 0
  return value.every((entry, index) => {
    if (!entry || typeof entry !== 'object' || entry.role !== (index % 2 ? 'user' : 'assistant') || typeof entry.content !== 'string') return false
    total += entry.content.length
    return entry.content.trim().length > 0 && entry.content.length <= (entry.role === 'user' ? MAX_ANSWER : 4000) && total <= 60_000
  }) && value[value.length - 1].role === 'user'
}
