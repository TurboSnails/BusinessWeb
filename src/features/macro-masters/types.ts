// 宏观大师板块的共享类型（manager 维护；大师内容、实时读数与页面都按此约定实现）
// 研究来源：docs/research/macro-masters/<slug>/README.md

/** 本站可提供实时读数的指标键。实现见 readings.ts；找不到数据源时读数返回 null，页面显示"本站暂无"。 */
export type ReadingKey =
  // 货币与流动性
  | 'fedAssets'          // 美联储总资产
  | 'netLiquidity'       // 美联储总资产 − 财政部一般账户（TGA）− 隔夜逆回购（市场常用近似，不是某位大师的公式）
  | 'bankReserves'       // 银行准备金
  | 'realRate'           // 实际政策利率（联邦基金利率 − 核心 PCE 同比，月频）
  | 'realYield10'        // 10 年期 TIPS 实际收益率（FRED DFII10，日频）
  | 'tenYear'            // 10 年期美债收益率
  | 'curve10y2y'         // 10 年 − 2 年期限利差
  | 'nfci'               // 芝加哥联储金融条件指数
  // 信用
  | 'hySpread'           // 高收益债利差
  | 'baaAaa'             // 穆迪 Baa − Aaa
  // 宽度与趋势
  | 'spxAbove200'        // 标普 500 成分股高于 200 日线占比
  | 'netNewHighs'        // 标普 500 净新高比例
  | 'advDecLine'         // 标普 500 成分股累计涨跌线（近一年）
  | 'mcclellan'          // 比例调整 McClellan 振荡
  | 'spxVs200dma'        // 标普 500 指数相对其 200 日均线的位置
  // 盈利与估值
  | 'epsRevision'        // 标普 500 未来 12 个月 EPS 预期变化
  | 'forwardPe'          // 标普 500 前瞻市盈率
  | 'cape'               // 席勒 CAPE
  // 情绪与仓位
  | 'vix'
  | 'fearGreed'          // CNN 恐慌贪婪指数
  | 'retailBullBear'     // 散户看多减看空
  | 'naaim'              // NAAIM 主动经理股票敞口
  | 'marginDebtYoy'      // 融资余额同比
  | 'managerCash'        // 基金经理现金比例
  // 商品
  | 'copperGold'         // 铜金比
  | 'copper'             // COMEX 铜价
  // 2026-11-22 新增
  | 'policyRate'         // 准备金余额利率（IORB）：随美联储每次决议调整，用来读政策利率水平与最近一次调整方向
  | 'spxDrawdown'        // 标普 500 距近 52 周最高收盘的回撤（%，不大于 0）
  | 'equalWeightRel'     // 等权标普相对市值加权标普，近 3 个月相对表现（%）
  | 'cyclicalDefensive'  // 可选消费相对必需消费，近 3 个月相对表现（%）
  | 'smallCapRel'        // 小盘相对标普 500，近 3 个月相对表现（%）
  | 'growthValueRel'     // 成长相对价值，近 3 个月相对表现（%）
  | 'unrate'             // 失业率
  | 'sahm'               // 萨姆规则实时值
  | 'debtService'        // 家庭偿债比（FRED TDSP）
  | 'buffett'            // 非金融企业股票市值 ÷ 名义 GDP
  | 'putCall'            // Cboe 全产品期权成交量 Put ÷ Call
  // 2026-11-22 第二批：已有序列接入 + FRED 补充
  | 'tga'                // 财政部一般账户（TGA）
  | 'mmfAssets'          // 货币基金总资产（亿美元；展示可换算万亿）
  | 'cftcLevSpx'         // 杠杆基金标普期货净仓（占未平仓量 %）
  | 'hfGrossExposure'    // 对冲基金股票总名义敞口（OFR Form PF）
  | 'volumeRatio'        // 美股全市场 20 日量比
  | 'corePce'            // 核心 PCE 同比
  | 'claims'             // 初请失业金（4 周均值）
  | 'fedFunds'           // 联邦基金有效利率
  | 'nominalGdpYoy'      // 名义 GDP 同比
  | 'dotMedian'          // 点阵图：明年末利率中位数（history 日期=预测目标年）
  | 'privateCreditGdp'   // 私人非金融部门信贷 ÷ GDP（BIS）
  | 'govDebtGdp'         // 联邦政府债务 ÷ GDP
  | 'hyYield'            // 高收益债有效收益率
  | 'cccSpread'          // CCC 及以下高收益债利差（bp）
  | 'm2Yoy'              // M2 同比
  | 'inflationExp'       // 10 年盈亏平衡通胀率
  | 'primeRate'          // 优惠利率
  | 'discountRate'       // 贴现窗口一级信贷利率
  | 'consumerCreditYoy'  // 非循环消费信贷同比
  | 'profitGdp'          // 企业税后利润 ÷ GDP

/** 一个读数的统一形状 */
export type Reading = {
  key: ReadingKey
  label: string
  value: number
  unit: string
  /** 观测日期 YYYY-MM-DD */
  date: string
  /** 近 10 年分位 0–100，按序列原生频率计算（日频按周采样，周 / 月 / 季频用原始观测）；历史不足 5 年时省略 */
  percentile?: number
  /** 分位实际覆盖的年数（如 10、6.5）；页面据此写"近 N 年分位" */
  percentileYears?: number
  /** 全部可得历史上的分位 0–100（原生频率）；历史不足 30 年时省略。估值、信用这类长周期读数用它，不用近 10 年分位 */
  longPercentile?: number
  /** 长历史分位的起始年份，如 1900 */
  longPercentileSince?: number
  /** 序列原生频率 */
  frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  /** 与约一个月前相比的方向（季频序列与上一季比较） */
  direction?: 'up' | 'down' | 'flat'
  /** 用来判断方向的前值及其日期 */
  prior?: { date: string; value: number }
  /** 仅政策利率：最近一次调整的日期与前后水平 */
  lastMove?: { date: string; from: number; to: number }
  /** 仅政策利率：最近这一串同方向调整的次数、累计幅度（百分点，带符号）与这一串开始前的水平 */
  moveRun?: { direction: 'up' | 'down'; count: number; total: number; startLevel: number; since: string }
  /** 落后最近应有日期过多 */
  stale?: boolean
  /** 最近一次采集失败，显示的是上次可用读数 */
  refreshFailed?: boolean
  /** 口径或时间基准说明，如"相对 9 月 30 日的预期修正""公开数据约滞后三个月" */
  note?: string
  source: string
}

/** 大师关注的一个指标，以及他怎么读 */
export type MasterIndicator = {
  /** 不是可量化指标，而是方法、比喻或二手解读；不计入覆盖率，也不显示"本站暂无" */
  kind?: 'method'
  /** 显示名，如"美联储政策与流动性" */
  name: string
  /** 他怎么读（只写有来源支撑的读法，1–2 句） */
  howToRead: string
  /** 与他所说指标**同口径**的本站读数；没有就省略，页面显示"本站暂无"并可给出外部数据源 */
  readings?: ReadingKey[]
  /** 口径不同、只能作参考的本站近似读数（页面单独标"本站近似，口径不同"） */
  proxyReadings?: ReadingKey[]
  /** 近似与原指标的差别，一句话（有 proxyReadings 时必填） */
  proxyNote?: string
  /** 本站暂无时的外部数据源说明（如 FRED 序列名），可省略 */
  external?: string
  /** 证据等级：原话 / 转述 / 未证实（与研究文档标注一致） */
  evidence: 'quote' | 'paraphrase' | 'unverified'
}

export type Master = {
  /** 路由与目录名，与 docs/research/macro-masters/<slug> 一致 */
  slug: 'druckenmiller' | 'dalio' | 'marks' | 'tudor-jones' | 'zweig' | 'grantham' | 'soros' | 'templeton' | 'kostolany'
  name: string          // 中文名，如"斯坦利·德鲁肯米勒"
  nameEn: string        // Stanley Druckenmiller
  /** 一句话：他判断行情的核心 */
  oneLiner: string
  /** 风格标签，如 ["流动性", "趋势", "18–24 个月前瞻"] */
  tags: string[]
  /** 3–5 条核心思路（每条一句，附出处日期写在研究文档里） */
  ideas: string[]
  indicators: MasterIndicator[]
  /** 主要局限（1–3 句） */
  limits: string
  /** 偏定量（有明确指标）还是偏定性（思路为主） */
  kind: 'quant' | 'qualitative'
  /** 靠不靠谱（可检验性、适用问题、公开失误） */
  track: MasterTrack
}

// ───────── 当前位置（2026-11-22 新增；判定实现见 cycleView.ts） ─────────
// 三方讨论（Codex / Cursor / Kimi）后的约定：结论来自分维度证据，不做总分，也不让九位大师投票；
// 只有本人给过明确规则的才给档位，其余只列观察项并写明缺什么。

/** 一条证据对股票仓位的含义：偏谨慎 / 偏积极 / 中性 / 缺数据 */
export type Lean = 'caution' | 'support' | 'neutral' | 'unknown'

/** 这条证据说的是多长的期限：短线（数周到数月）/ 中期（基本面）/ 长期（估值，数年）/ 逆向线索 */
export type Horizon = 'short' | 'medium' | 'long' | 'contrarian'

/** 一句已格式化好的读数证据，如「标普 500 低于 200 日均线 5.96%（11-20）」 */
export type Evidence = { key: ReadingKey; text: string }

export type DimensionId =
  | 'trend' | 'breadth' | 'credit' | 'policy'      // 短线
  | 'liquidity' | 'fundamentals'                   // 中期
  | 'valuation'                                    // 长期
  | 'sentiment'                                    // 逆向线索

export type DimensionView = {
  id: DimensionId
  /** 显示名，如「趋势」 */
  name: string
  horizon: Horizon
  lean: Lean
  /** 2–8 个字的状态，如「跌破均线」 */
  state: string
  /** 一句话说明现在怎样 */
  summary: string
  /** 本站判定口径，一句话，含阈值 */
  rule: string
  evidence: Evidence[]
  /** 因过期或缺失没有参与判定的读数 */
  skipped: ReadingKey[]
}

export type Posture = 'defense' | 'neutral' | 'offense' | 'unknown'
export type PhaseId = 'expansion' | 'correction' | 'bear' | 'repair' | 'unknown'

export type TakeItem = {
  /** 观察项名称，如「200 日均线」 */
  label: string
  lean: Lean
  /** 一句话：读数与含义 */
  text: string
  /** 判定口径是他本人给过的规则 / 阈值，还是本站自定 */
  basis: 'own' | 'site'
  keys: ReadingKey[]
}

/** 按某位大师的公开方法，对照本站读数现在看到什么 */
export type MasterTake = {
  slug: Master['slug']
  /** rule：本人给过明确规则，可机械给档；checklist：只能逐项对照，不给档；reference：方法无法机械对照，只列线索 */
  mode: 'rule' | 'checklist' | 'reference'
  /** 仅 mode 为 rule 时给出 */
  posture?: Posture
  /** 一句话结论 */
  headline: string
  items: TakeItem[]
  /** 还缺什么才能判断；没有就给空字符串 */
  missing: string
}

export type CycleView = {
  /** 参与判定的读数里最新的观测日期 */
  asOf: string
  posture: {
    value: Posture
    confidence: 'low' | 'medium'
    /** 如「短线偏防守」 */
    label: string
    /** 一句话含义 */
    meaning: string
    /** 本站判定口径 */
    rule: string
  }
  phase: {
    id: PhaseId
    /** 如「修正（扩张中的调整）」 */
    name: string
    summary: string
    rule: string
  }
  /** 支持当前判断的证据，2–4 条 */
  supports: string[]
  /** 反面证据，1–4 条 */
  counters: string[]
  /** 什么变化会改判，2–5 条 */
  flips: string[]
  dimensions: DimensionView[]
  masters: MasterTake[]
}

/** 这套方法靠不靠谱：不打星，只写事实 */
export type MasterTrack = {
  /** 能不能检验，一句话，如「规则明确，可以回测」 */
  testability: string
  /** 适合回答什么问题，如「仓位的防守底线」 */
  bestFor: string
  /** 不适合回答什么 */
  notFor: string
  /** 公开的失误或偏差，一两句，须与研究文档一致 */
  misses: string
}
