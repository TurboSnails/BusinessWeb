// 研究评级归档：纯函数、无依赖，站内（companySignals / 候选池提醒）与服务端每日提醒邮件共用。
export type RatingBucket = '优先关注' | '条件关注' | '观察' | '回避' | '未估值'

/** 各来源评级用语不一（逢低增持/买入/首选/核心配置…），统一归到五档；未识别的一律「观察」 */
export function ratingBucket(rating: string): RatingBucket {
  if (/^未估值/.test(rating)) return '未估值'
  if (/^(回避|暂不|暂缓)/.test(rating)) return '回避'
  if (/^(优先关注|优先跟踪|买入|首选|核心配置|均衡优选|稳健增配)/.test(rating)) return '优先关注'
  if (/^(条件|HOLD（条件候选）|优先观察|观察优先|重点观察|邮轮组优先|质地优先|增长可持续|质量观察（第|优质但待价|逢低增持)/.test(rating)) return '条件关注'
  return '观察'
}
