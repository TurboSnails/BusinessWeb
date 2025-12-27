// 获取周几
export const getWeekday = (dateStr: string): string => {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[new Date(dateStr).getDay()]
}

// 获取今天的日期字符串 YYYY-MM-DD
export const getToday = (): string => {
  return new Date().toISOString().split('T')[0]
}

