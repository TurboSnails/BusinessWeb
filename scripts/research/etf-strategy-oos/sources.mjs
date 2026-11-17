// 影子运行（shadow.mjs）的日线数据源解析：东财前复权（fqt=1）作为腾讯被拦时的备用。纯函数，便于测试。
export const emMarket = (code) => (/^(5|6)/.test(code) ? 1 : 0)
export const eastmoneyUrl = (code, endDay) =>
  `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${emMarket(code)}.${code}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55&klt=101&fqt=1&beg=20100101&end=${endDay.replaceAll('-', '')}&lmt=10000`

/** 东财 K 线 → [{date, open, close, high, low}]；校验返回的代码与交易所，防止串号 */
export function parseEastmoney(j, code) {
  const d = j?.data
  if (j?.rc !== 0 || !d || String(d.code) !== code || d.market !== emMarket(code) || !Array.isArray(d.klines)) throw new Error('东财返回异常')
  // fields2=f51..f55：日期、开、收、高、低
  return d.klines.map((s) => String(s).split(','))
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f[0]))
    .map((f) => ({ date: f[0], open: +f[1], close: +f[2], high: +f[3], low: +f[4] }))
}
