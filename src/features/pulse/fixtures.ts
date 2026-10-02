// 测试夹具：合法的复盘记录
export const review = (date: string, extra: Record<string, unknown> = {}) => ({
  date, weekday: '周三', ztCount: 50, ztSealRate: '75%', ztOpen: 12, dtCount: 3, dtSealRate: '60%', dtOpen: 1,
  volume: 15000, upDown: '3000-1500', shszcy: '1.2/1.5/1.8', lbRate: '30%', lbCount: 8, maxBoard: 6,
  top5Amount: 2000, top5Turnover: 25, inflow: '算力', outflow: '银行', updatedAt: '2026-09-30T10:00:00.000Z', ...extra,
})
