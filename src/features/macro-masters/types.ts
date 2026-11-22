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

/** 一个读数的统一形状 */
export type Reading = {
  key: ReadingKey
  label: string
  value: number
  unit: string
  /** 观测日期 YYYY-MM-DD */
  date: string
  /** 分位 0–100（按每周一个观测统一采样后计算）；历史不足 5 年时省略 */
  percentile?: number
  /** 分位实际覆盖的年数（如 10、6.5）；页面据此写"近 N 年分位" */
  percentileYears?: number
  /** 与约一个月前相比的方向 */
  direction?: 'up' | 'down' | 'flat'
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
}
