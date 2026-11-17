// 互动问答页测试数据（结构与 scripts/kpl-irm.mjs 产出一致，数值为虚构）
export function irmFixture(): Record<string, unknown> {
  return {
    version: 1, generatedAt: '2026-11-17T19:50:00.000Z', asOf: '2026-11-17',
    note: '问答原文来自交易所互动平台，公司回复不等于公告；分类与关键词是机械匹配，不是判断；不构成投资建议。',
    days: [
      {
        date: '2026-11-17', total: 3, sz: 2, sh: 1, companies: 2,
        cats: { clarify: 1, risk: 0, dividend: 0, order: 0, capacity: 1, progress: 1, other: 0 },
        hot: [
          { code: '300760', name: '迈瑞医疗', p: 'sz', n: 2, cats: { progress: 1, clarify: 1 }, chg: 2.11, next: null, ind: '医疗器械' },
          { code: '688629', name: '华丰科技', p: 'sh', n: 1, cats: { capacity: 1 }, chg: -3.5, next: null, ind: null },
        ],
        keywords: [{ kw: '机器人', n: 2, companies: 1 }, { kw: '算力', n: 1, companies: 1 }],
        file: 'kpl-irm-tue.json', quoteDay: '2026-11-17', quoteNext: null,
        platforms: { sz: { ok: true, capped: false }, sh: { ok: true, capped: false } },
      },
      {
        date: '2026-11-16', total: 1, sz: 1, sh: 0, companies: 1,
        cats: { other: 1 }, hot: [{ code: '000001', name: '平安银行', p: 'sz', n: 1, cats: { other: 1 }, chg: null, next: 2.11, ind: '银行' }],
        keywords: [], file: 'kpl-irm-mon.json', quoteDay: '2026-11-16', quoteNext: '2026-11-17',
      },
    ],
    history: [{ date: '2026-11-16', total: 1, sz: 1, sh: 0 }, { date: '2026-11-17', total: 3, sz: 2, sh: 1 }],
    letters: {
      from: '2026-10-18', to: '2026-11-17', errors: [], counts: { inquiry: 1, attention: 0, supervision: 1, discipline: 1 },
      items: [
        { ex: 'sh', code: '603366', name: '日出东方', date: '2026-11-12', type: '监管工作函', group: 'supervision', title: '关于日出东方股价波动事项的监管工作函', url: 'https://www.sse.com.cn/a.doc' },
        { ex: 'sz', code: '000821', name: 'ST京机', date: '2026-11-11', type: '公开谴责', group: 'discipline', title: '关于对某某给予公开谴责处分的决定', url: 'https://reportdocs.static.szse.cn/y.pdf' },
        { ex: 'sz', code: '300364', name: '中文在线', date: '2026-10-20', type: '问询函', group: 'inquiry', title: '中文在线 问询函', url: 'https://reportdocs.static.szse.cn/a.pdf', reply: 'https://reportdocs.static.szse.cn/b.pdf', replyTitle: '回复公告' },
      ],
    },
    rules: {
      headChars: 80,
      cats: [{ id: 'clarify', label: '澄清否认' }, { id: 'risk', label: '风险提示' }, { id: 'dividend', label: '分红回购' }, { id: 'order', label: '订单合同' }, { id: 'capacity', label: '产能产品' }, { id: 'progress', label: '业务进展' }, { id: 'other', label: '其他' }],
      list: [
        { id: 'clarify', label: '澄清否认', scope: 'head', words: ['不涉及', '不存在'] },
        { id: 'risk', label: '风险提示', scope: 'all', words: ['风险提示'] },
        { id: 'dividend', label: '分红回购', scope: 'all', words: ['分红', '回购'] },
        { id: 'order', label: '订单合同', scope: 'all', words: ['订单'] },
        { id: 'capacity', label: '产能产品', scope: 'all', words: ['批量'] },
        { id: 'progress', label: '业务进展', scope: 'all', words: ['推进'] },
      ],
      keywords: [{ kw: '机器人', words: ['机器人'] }, { kw: '算力', words: ['算力'] }],
    },
    sources: [{ id: 'irm', label: '深交所互动易', url: 'https://irm.cninfo.com.cn/views/interactiveAnswer' }],
  }
}

export function irmDayFixture(date = '2026-11-17'): Record<string, unknown> {
  return {
    version: 1, generatedAt: '2026-11-17T19:50:00.000Z', date,
    platforms: { sz: { ok: true }, sh: { ok: true } },
    quotes: { day: '2026-11-17', next: null, d: { '300760': [2.11, '医疗器械'], '688629': [-3.5, '通信设备'] }, n: null },
    items: [
      { id: 'sz1', p: 'sz', code: '300760', name: '迈瑞医疗', q: '手术机器人进展如何？', a: '您好，手术机器人正在按计划推进。', at: '2026-11-17 15:13', qt: '2026-11-17 12:33', cat: 'progress', url: 'https://irm.cninfo.com.cn/ircs/question/questionDetail?questionId=1' },
      { id: 'sh1', p: 'sh', code: '688629', name: '华丰科技', q: '算力连接器是否批量供货？', a: '尊敬的投资者您好！阿里项目已实现批量交付。', cut: 1, at: '2026-11-17 18:17', qt: '2026-11-11 12:39', cat: 'capacity', url: 'https://sns.sseinfo.com/company.do?uid=273765' },
      { id: 'sz2', p: 'sz', code: '300760', name: '迈瑞医疗', q: '公司有机器人狗业务吗？', a: '您好，公司不涉及该业务。', at: '2026-11-17 10:02', qt: null, cat: 'clarify', url: 'https://irm.cninfo.com.cn/ircs/question/questionDetail?questionId=2' },
    ],
  }
}
