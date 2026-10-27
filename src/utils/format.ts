// 格式化价格
export const formatPrice = (price: number, symbol?: string): string => {
  if (symbol === 'BTC-USD') {
    return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 格式化百分比
export const formatPercent = (percent: number): string => {
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}


// 数据层的 [MISSING] 占位符只用于程序判断，展示给读者时统一写成「未取得」
export const displayMissing = (text: string): string => text.replace(/\[MISSING\]/g, '未取得')
