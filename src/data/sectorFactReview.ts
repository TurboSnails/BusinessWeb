import type { Company } from './companies'

// 2026-10-05：公用事业、能源、通信服务的一手事实复核。
// 原始报价与旧情景金额保留；缺少盈利桥接时只撤回模型认证，不生成新目标价。
type Review = {
  evidence: string
  sources: string[]
  next: string
  withdraw?: boolean
  patch?: Partial<Company>
}

const alphabet: Review = {
  evidence: '2026Q2 其他收益净额 $98.0bn，主要来自股权证券未实现收益；营业利润率 34%。GAAP 净利 $112.19bn 不是数据错误，但不能将含投资重估的 TTM EPS 19.91 标成可持续归一化 EPS。',
  sources: ['https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm'],
  next: '拆分营业利润、投资损益、所得税与稀释股数后重建正常化 EPS；跟踪搜索、云业务及现金资本开支。',
  withdraw: true,
  patch: { headline: '观察（待重建）：经营增长已确认，但巨额投资重估使 GAAP 盈利不可直接外推；旧情景暂不认证' },
}
const water: Review = {
  evidence: '2025-10-27 签署 AWK/WTRG 全股票合并协议：每股 WTRG 在交割时换取 0.305 股 AWK。2026-08-17 公告确认 HSR 等待期已于 8/14 届满，仅满足其中一项交割条件；不能据此认定已交割。',
  sources: ['https://ir.amwater.com/news-and-events/financial-releases/financial-release-details/2025/American-Water-and-Essential-Utilities-to-Merge-as-a-Leading-Regulated-U-S--Water-and-Wastewater-Utility/default.aspx', 'https://ir.amwater.com/news-and-events/financial-releases/financial-release-details/2026/American-Water-and-Essential-Utilities-Announce-Expiration-of-Hart-Scott-Rodino-Waiting-Period-for-Proposed-Merger/default.aspx'],
  next: '核对各州审批、剩余交割条件及最新交割公告；WTRG 对价随 AWK 股价变动，重建换股与失败情景。',
  withdraw: true,
}
const nextera: Review = {
  evidence: '2026-05-18 NEE/D 签署合并协议：每股 D 在交割时获得 0.8138 股 NEE，另按比例分配合计 $360m 现金。NEE 2026Q2 仍称拟议合并；该换股对价不等于固定现金收购价。',
  sources: ['https://www.sec.gov/Archives/edgar/data/753308/000110465926063001/tm2614888d1_8k.htm', 'https://www.sec.gov/Archives/edgar/data/753308/000075330826000058/neeq22026exhibit99.htm'],
  next: '核对股东及监管批准、交割状态、发行股数与合并融资；D 研究需要换股及交易失败情景。',
  withdraw: true,
}
const paramount: Review = {
  evidence: '2026-02-27 PSKY/WBD 签署协议：每股 WBD 现金对价 $31；若 9/30 尚未交割，每季度 $0.25/股 ticking fee 按日计算至交割。公告条款已核实，截至复核日最终交割状态 [MISSING]；现金对价不能视为保证兑现的市价。',
  sources: ['https://ir.paramount.com/news-releases/news-release-details/paramount-acquire-warner-bros-discovery-form-next-generation'],
  next: '核对最新交割公告、监管与融资条件；WBD 重建现金交割/延迟/失败情景，PSKY 核对新股发行、杠杆与整合现金流。',
  withdraw: true,
}

export const sectorFactReviews: Record<string, Review> = {
  GOOG: alphabet,
  GOOGL: alphabet,
  AWK: { ...water, patch: { headline: '观察（并购待核）：拟与 Essential Utilities 换股合并；旧独立公司情景未包含交易影响', profile: '受监管水务公司 American Water Works；已签署与 Essential Utilities 的换股合并协议，交割状态需继续核对。' } },
  NEE: { ...nextera, patch: { headline: '观察（并购待核）：拟与 Dominion 合并；需桥接发行股数、融资与盈利，旧模型暂不认证' } },
  D: { ...nextera, patch: { headline: '观察（事件研究）：拟按 0.8138 股 NEE 加现金分配换股；旧独立 PE 情景暂不认证' } },
  WBD: { ...paramount, patch: { headline: '观察（事件研究）：已签署每股 $31 现金收购协议及延迟交割费；最终交割状态待确认' } },
  PSKY: { ...paramount, patch: { headline: '观察（并购与盈利待核）：已签署收购 WBD 协议；须核对融资、摊薄及交易完成状态' } },
  OXY: {
    evidence: 'OxyChem 已于 2026-01-02 售予伯克希尔；初公告现金价 $9.7bn，Q2 10-Q 披露调整后售价 $9.5bn，仍受后续交割调整影响。2026 上半年终止经营税后净利 $3.119bn，包含出售收益；旧 TTM 不能直接当归一化持续盈利，不以终止经营总额机械扣减普通股 EPS。',
    sources: ['https://www.oxy.com/siteassets/documents/news-releases/pr-010226_occidental-completes-oxychem.pdf', 'https://www.oxy.com/siteassets/documents/investors/2025-annual-report.pdf', 'https://www.sec.gov/Archives/edgar/data/797468/000162828026053388/oxy-20260630.htm'],
    next: '以持续经营、终止经营、优先股股息及稀释股数桥接 TTM EPS；按油气价格和现金流重建悲观情景。下一季度公告日期待确认。',
    withdraw: true,
    patch: { headline: '观察（待重建）：已出售 OxyChem，TTM 包含资产出售收益；低 PE 与旧买入区暂不认证', profile: '油气及中游/低碳业务公司 Occidental Petroleum；OxyChem 已于 2026-01-02 售出，化工仅属历史披露边界。' },
  },
  CVX: {
    evidence: '2026Q2 GAAP 净利 $12.072bn、EPS $6.11；调整后约 $12.0bn、EPS $6.06。高盈利获公告支持；程序剔除整个季度得到 EPS 6.42/PE 31.9× 不等于公司调整后盈利，也未证明是正常化 TTM。',
    sources: ['https://www.chevron.com/newsroom/2026/q3/chevron-reports-second-quarter-2026-results', 'https://www.sec.gov/Archives/edgar/data/93410/000009341026000167/cvx-20260630.htm'],
    next: '保留原 GAAP 数据，核对油价、销量、炼油利润率、并购及逐季盈利桥接；以周期正常化盈利和现金流交叉估值。',
    withdraw: true,
    patch: { headline: '观察（待重建）：Q2 高盈利真实；程序平滑 EPS 未获正常化认证，旧估值暂不认证' },
  },
  NRG: {
    evidence: '2026Q2 GAAP 净利 $506m、基本 EPS $2.32；调整后净利 $315m、基本 EPS $1.49（上年 $1.73）。LS Power 资产加入及非现金经济套保收益影响 GAAP；程序剔除整个季度的 EPS 1.96 不是公司调整后 TTM。',
    sources: ['https://investors.nrg.com/news-releases/news-release-details/nrg-energy-reports-second-quarter-2026-results-and-reaffirms'],
    next: '桥接并购资产、利息、折旧、套保和基本/稀释股数；区分公司 FCFbG 与通常 FCF，再重建持续盈利。',
    withdraw: true,
    patch: { headline: '观察（待重建）：并购与套保改变盈利口径；程序平滑 EPS 和旧情景暂不认证', profile: '综合电力及零售公司 NRG；2026Q2 已包含从 LS Power 收购的资产，需关注并购整合及套保会计。' },
  },
  NFLX: {
    evidence: '2026Q1 官方股东信：收到 WBD 交易终止费 $2.8bn，计入利息及其他收益；推高季度 EPS 与经营现金流。旧 TTM EPS 不能未经桥接直接当作可持续归一化盈利，终止费现金流也不可逐年重复。',
    sources: ['https://d18rn0p25nwr6d.cloudfront.net/CIK-0001065280/02e11080-ea38-41f8-ba90-f6f02f37ef12.pdf'],
    next: '桥接终止费税后影响、拆股后的稀释股数、内容投入及订阅/广告收入，重建持续 EPS 与 FCF。',
    withdraw: true,
    patch: { headline: '观察（待重建）：TTM 含 $2.8bn 交易终止费；旧归一化盈利外推暂不认证' },
  },
  CHTR: {
    evidence: '历史价格 $110.67，旧 Bear/Base/Bull 为 $154/$266/$327：悲观价仍高于价格，未构造下行损失，inf:1 不成立；$110.67 不在旧 $182–201 区间。2026Q2 归属股东净利 $1.292bn/收入约 $13.53bn，对应约 9.6%；集团净利 $1.524bn 对应 11.3%，旧页混用口径。',
    sources: ['https://ir.charter.com/news-releases/news-release-details/charter-announces-second-quarter-2026-results'],
    next: '核对宽带客户、资本开支、债务及回购；重建实际会发生亏损的悲观情景，不用低 PE 替代下行分析。',
    withdraw: true,
    patch: { headline: '观察（待重建）：旧悲观价高于历史价格，无有效下行情景；无限赔率和买入区认证已撤回', ratioNote: '赔率不适用：旧悲观价 $154 高于历史价格 $110.67，未构造下行损失；不能认证无限赔率。' },
  },
  CEG: {
    evidence: '2026-01-07 已完成 Calpine 收购，业务包含天然气及地热。2026Q2 GAAP EPS $1.42、调整后经营 EPS $2.55；全年调整后经营 EPS 指引上调至 $11.50–12.50。Q2 营收 $7.504bn 与旧值一致，不能把该调整后指引直接替换为 GAAP TTM。',
    sources: ['https://www.constellationenergy.com/news/2026/01/constellation-completes-calpine-transaction-powering-americas-clean-energy-future.html', 'https://investors.constellationenergy.com/node/10176/pdf'],
    next: '核对 Calpine 并表股数、购入合同摊销、利息与整合；分别桥接 GAAP 和调整后经营 EPS，再认证旧情景。',
    patch: { profile: '电力生产及竞争性零售公司 Constellation；2026-01-07 完成 Calpine 收购，发电组合包含核电、天然气、地热及其他能源。' },
  },
  ES: {
    evidence: '2026Q2 GAAP 净利 $53.7m/EPS $0.14，non-GAAP recurring 净利 $329.1m/EPS $0.87。Aquarion 出售税后费用 $111.4m、海风或有负债税后费用 $164.0m，合计 $275.4m；不能把低 GAAP 利润全部解释为持续经营恶化。全年 recurring EPS 指引 $4.57–4.72，不等于 TTM。',
    sources: ['https://investors.eversource.com/news-releases/news-release-details/eversource-energy-reports-second-quarter-2026-results'],
    next: '核对出售后业务边界、海风负债与现金影响；持续经营 EPS、GAAP EPS 和指引分别比较。',
  },
  META: {
    evidence: '2026Q2 含 $2.4bn 法律诉讼费用；全年资本开支指引 $130–145bn。收入增长不等于利润同比增长；资本开支指引不等于当季支出或 FCF。',
    sources: ['https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Second-Quarter-2026-Results/'],
    next: '跟踪法律费用是否持续、广告利润率及现金资本开支；不得机械把全部费用加回归一化 TTM。',
  },
  CMCSA: {
    evidence: '2026Q2 Peacock 首次季度盈利，口径为调整后 EBITDA $189m，不能写成 GAAP 净利润；宽带客户流失和盈利持续性仍需跟踪。公司同时宣布拟分拆 NBCUniversal 与 Sky；上年 Q2 含出售 Hulu 权益收益，GAAP 同比受基数影响。',
    sources: ['https://www.sec.gov/Archives/edgar/data/1166691/000162828026049274/ex991-6302026.htm'],
    next: '跟踪 Peacock EBITDA 盈利持续性、体育内容投入、宽带客户及分拆进展；分拆后盈利尚未桥接。',
  },
  TMUS: {
    evidence: '2026Q2 稀释 EPS $2.99，其中 UScellular 整合相关税后成本 $146m/每股 $0.14。旧页数据只到 Q2，却把下一季度财报写成 2027-02，日期错位；改为下一季度公告日期待确认。',
    sources: ['https://www.t-mobile.com/news/business/t-mobile-q2-2026-earnings'],
    next: '下一季度公告日期待公司确认；跟踪 UScellular 整合成本、客户流失率与现金流。',
  },
  DIS: {
    evidence: 'FY2026Q3 调整后 EPS $2.06，同比增长 28%；FY2025Q3 含 Hulu 非现金税收收益 $3.277bn（EPS 影响 $1.56），GAAP 同比不能直接解释为经营盈利同比崩塌。GAAP 与调整后 EPS 必须分列。',
    sources: ['https://www.sec.gov/Archives/edgar/data/1744489/000174448926000056/fy2026_q3xerxex991.htm'],
    next: '核对 Hulu 税收基数、重组减值、流媒体利润与乐园利润；保留原 GAAP 数字，不机械替换正常化 EPS。',
  },
}

export function applySectorFactReview(company: Company): Company {
  const row = company.market === 'us' ? sectorFactReviews[company.code] : undefined
  if (!row || company.metrics.some(([key]) => key === '三板块复核日期')) return company
  const metrics = company.metrics.map(([key, value]): [string, string] => {
    if (company.code === 'CHTR' && key === '最新季（2026-06-30）') {
      return [key, '营收约 $13.53bn；归属股东净利 $1.292bn、净利率约 9.6%；集团净利 $1.524bn、净利率约 11.3%；稀释 EPS $10.66']
    }
    return [row.withdraw && key !== '价格锚点' ? `上轮存档·${key}` : key, value]
  })
  const updated: Company = {
    ...company,
    ...row.patch,
    metrics: [['三板块复核日期', '2026-10-05（公告期别见证据；未更新报价）'], ['一手事实与口径', row.evidence], ...(row.withdraw ? [['上轮结论存档', company.headline] as [string, string], ['上轮情景假设存档', (company.scenarios || []).map(s => `${s.name}：${s.assumption}；${s.price}（${s.change}）`).join(' / ') || '原记录未给出 EPS 情景'] as [string, string]] : []), ...metrics],
    asOf: `2026-10-05 公告及口径增补；报价与原始指标沿用旧时点：${company.asOf}`,
    pitfalls: [row.evidence, ...row.sources.map(url => `一手来源：${url}`), ...(company.pitfalls || [])],
    risk: [row.withdraw ? '持续盈利或并购后估值尚未认证；旧数值不可作为确定安全边际。' : row.evidence, ...company.risk],
    calendar: [row.next, ...(company.calendar || []).filter(item => !item.includes('2027-02'))],
  }
  if (company.code === 'OXY') {
    updated.segments = company.segments?.map(s => s.name.includes('化工') ? { ...s, note: '历史业务：OxyChem 已于 2026-01-02 出售，不能继续列为当前持续经营分部。' } : s)
  }
  if (company.code === 'CMCSA') updated.risk = updated.risk.map(s => s.replace('宽带流失与流媒体亏损', '宽带流失、Peacock EBITDA 盈利持续性及内容投入'))
  if (company.code === 'TMUS') updated.risk = updated.risk.map(s => s.replace(/约 2027-02 月（按上年同期披露日推算，待公告）/g, '下一季度公告日期待公司确认'))
  if (!row.withdraw) return updated
  return {
    ...updated,
    rating: '观察（待重建）',
    certainty: '公告事实已核实；持续盈利、事件失败价值及旧估值未认证',
    duration: '旧增长期限未认证；需完成持续盈利或并购后桥接',
    ratioNote: row.patch?.ratioNote || '旧赔率暂停认证；原报价和情景金额仅存档，尚未重建正常化盈利或事件下行价值。',
    thesis: [row.evidence, row.next],
    growth: [row.evidence],
    next: [row.next],
    scenarios: undefined,
    discipline: { zone: '旧买入区暂停认证，待重建悲观与基准价值', add: row.next, trim: '兑现区间待重建', invalid: '持续经营桥接或交易条件变化时重新评估', position: '本轮不提供仓位指令' },
    bullBear: undefined,
    pros: ['保留原业务研究方向；已确认的公告事实见本轮证据'],
    cons: [row.evidence, '原情景与赔率仅供历史核对，不能视为本轮确认结果。'],
    calendar: [row.next],
  }
}
