export interface SiteUpdate {
  id: string
  date: string
  title: string
  description: string
  href: string
}

// 仅记录已上线、用户可感知的需求；同一需求合并为一条，按上线日期倒序维护。
// 使用中文描述结果和使用方式，不从 Git 提交、构建或日常数据刷新自动生成。
export const SITE_UPDATES: readonly SiteUpdate[] = [
  {
    id: 'portfolio-rebalance-spx-signal',
    date: '2026-11-22',
    title: '组合回测的大跌切换可用标普 500 做信号',
    description: '组合再平衡回测的大跌切换新增信号指数选项：纳指 100 或标普 500。结果页新增「信号指数当前位置」，显示距本轮高点的回撤、是否已触发、离下一档还差多少。研究观察补充了 1986 年以来以标普 500 回撤为起点的长期测试：年化中位差约 +0.4 到 +0.7 个百分点，最大回撤同时加深，独立的大跌只有几轮，不能认定存在稳定加成。',
    href: '/lab/portfolio-rebalance',
  },
  {
    id: 'macro-masters',
    date: '2026-11-22',
    title: '宏观大师：九位投资人怎么看周期',
    description: '宏观大师板块：总览页先给出本站按公开数据归纳的当前位置——短线偏攻还是偏守、处在扩张、修正、熊市还是修复，并列出支持证据、反面证据和什么情况会改判，再按趋势、宽度、信用、货币政策、流动性、盈利与就业、估值、情绪八个维度展开。德鲁肯米勒、达利欧、霍华德·马克斯、都铎·琼斯、茨威格、格兰瑟姆、索罗斯、邓普顿、科斯托拉尼各一页，写明按他的方法现在看到什么、能不能检验、适合回答什么和公开失误；只有本人给过明确规则的才给档位。指标对照可按主题和大师筛选，带历史分位刻度。判定是本站口径，未经回测证实；不打总分，不构成买卖建议。',
    href: '/invest/macro-masters',
  },
  {
    id: 'us-market-breadth-copper',
    date: '2026-11-22',
    title: '美股市场加入涨跌家数与铜金比',
    description: '宏观温度的美股市场页新增市场宽度：标普 500 与纳指 100 成分股每日上涨、下跌家数，10 日上涨占比、McClellan 振荡与累计涨跌线，每个交易日收盘后约 40 分钟更新；另加铜价与铜金比作背景参考，并说明关税对纽约铜价的扭曲。估值位置页加入 Finviz 远期市盈率热力图入口。',
    href: '/monitor?tab=us-market',
  },
  {
    id: 'portfolio-rebalance-conclusions',
    date: '2026-11-22',
    title: '组合回测给出自动结论',
    description: '组合再平衡回测按当前组合自动说明结果：收益与回撤对比、对单只股票的敏感性、稳定股的取舍，并在样本过短、未调仓等情况下不下结论；逐一剔除表改为中性配色并加入回撤变化；纳指 100 等权对照改用仍跟踪全部成分的 QQQE。',
    href: '/lab/portfolio-rebalance',
  },
  {
    id: 'portfolio-rebalance-presets',
    date: '2026-11-22',
    title: '组合回测加入研究参考组合',
    description: '组合再平衡回测页新增 4 个参考组合：首选（Meta 换苹果）、省心（六只分散）、回撤最小（拼多多替换 SoFi）和原方案对照，一键载入并按每年调一次计算。依据 11 个候选组合在 39 个起点、前后两段和去掉博通后的稳健性比较；是事后挑选的参考，不是买卖建议。',
    href: '/lab/portfolio-rebalance',
  },
  {
    id: 'portfolio-rebalance-masters',
    date: '2026-11-22',
    title: '组合回测加入大师长期持仓股',
    description: '组合再平衡回测的可选股票从 23 只增加到 37 只，新增苹果、伯克希尔 B、万事达、Visa、穆迪、拼多多等 14 只，均来自巴菲特、段永平、李录、阿克曼、阿克雷、特里·史密斯 13F 中占比 5% 以上、五年前就已持有的股票。卡片上标「大师」，可展开看各人持仓占比。13F 有约 45 天延迟，不代表当前仍持有或推荐。',
    href: '/lab/portfolio-rebalance',
  },
  {
    id: 'portfolio-rebalance-lab',
    date: '2026-11-22',
    title: '组合再平衡回测上线',
    description: '在实验观察里选几只美股、设目标权重和再平衡规则，一次看清不动、动态平衡、等权与纳指 100 的期末金额、回撤和逐年收益；可开启“大跌时分步卖出稳定股、买入跌得最多的股票”，默认累计最多卖出一半。还能看每只股票离下一次调仓还差多少、去掉任意一只会怎样。价格每个交易日自动更新。历史回测，不是买卖指令。',
    href: '/lab/portfolio-rebalance',
  },
  {
    id: 'kf-deeper',
    date: '2026-10-28',
    title: 'kf-deeper 更深 Skill 上线',
    description: '新增 kf-deeper：不扩大范围，用专业补足、原始材料、方法工具与独立验证四问把任务改写得更深，改写后停下等你确认。Skills 工具库提供说明、示例和 ZIP 下载。',
    href: '/ai/ai-skills#thinking-skills',
  },
  {
    id: 'fullstack-workflow',
    date: '2026-10-28',
    title: '全栈 AI 开发工作流 Skill 上线',
    description: '新增 fullstack-workflow：把 OpenSpec 规范、Matt 需求澄清、Superpowers 工程方法与多 Agent 分工编排成七阶段流程，按快速、标准、严格三种模式执行，含质量门禁、审批门、任务卡与验证报告模板。Skills 工具库提供说明与 ZIP 下载。',
    href: '/ai/ai-skills#development-skills',
  },
  {
    id: 'deepen-task',
    date: '2026-10-27',
    title: '任务深挖 Skill 上线',
    description: '新增 deepen-task：保持原任务范围，从专家补充工作、一手材料、方法工具与独立验证四方面诊断，再重写提示词。Skills 工具库提供说明、示例、英文原始提示词和 ZIP 下载。',
    href: '/ai/ai-skills#thinking-skills',
  },
  {
    id: 'comprehensive-company-valuation',
    date: '2026-10-22',
    title: '综合估值与公司价格对比上线',
    description: '新增综合股票估值 Skill，统一评估 PE、PEG、PB 与现金流方法。公司研究可查看情景基准、现价与区间位置，筛选偏离情景区间的公司，并展开推导、来源和待核证据；未来情景单独展示。',
    href: '/research-notes',
  },
  {
    id: 'matt-workflow',
    date: '2026-10-20',
    title: 'Matt Pocock 开发工作流 Skill 上线',
    description: '中文版 Skills v1.3：从追问设计、写 spec、拆 tickets 到实现、双轴审查、写 PR 和复盘的完整流程，新增并行实现 implement-spec、pr 与 retro，可下载独立安装包。',
    href: '/ai/ai-skills#development-skills',
  },
  {
    id: 'dropshipping-strategy',
    date: '2026-10-11',
    title: '无货源电商：30 天实施方案',
    description: '补充一件代发的选品、供应商与平台规则说明，提供利润测算、预算与周转金拆分、30 天任务和继续或停止条件，可下载订单记账模板。',
    href: '/ai/dropshipping',
  },
  {
    id: 'mindful-investing-book',
    date: '2026-10-11',
    title: '《正念投资》书稿与听书更新',
    description: '新增导读与公司研究实战，提供阅读路线、章节搜索和字号调节；普通话听书支持本节、本章与全书，播放器可收起悬浮，书评独立放在书籍页底部。',
    href: '/first-book/slow-is-fast',
  },
  {
    id: 'dev-team',
    date: '2026-10-11',
    title: 'Orca 开发团队 Skill 上线',
    description: '更新包含独立 README 的完整 ZIP，使用说明可直接在线阅读，补充安装、自检、项目配置与验证范围；建议从只读评审开始。',
    href: '/ai#lab-skills',
  },
  {
    id: 'national-team-holdings',
    date: '2026-10-11',
    title: '新增国家队持仓看板',
    description: '按机构、行业和个股查看 A 股与 ETF 持仓，了解季度持仓变化。',
    href: '/invest/national-team',
  },
  {
    id: 'about-comments',
    date: '2026-10-11',
    title: '关于页开放留言',
    description: '可以在关于页提交使用反馈和功能建议，留言审核后公开展示。',
    href: '/about#about-comments',
  },
  {
    id: 'company-notes',
    date: '2026-10-11',
    title: '新增公司研究笔记',
    description: '公司研究页支持阅读笔记，获得编辑授权后可修改并保存到云端。',
    href: '/research-notes',
  },
  {
    id: 'ai-applications-and-materials',
    date: '2026-10-10',
    title: '扩充 AI 应用与新材料研究',
    description: '未来趋势与产业格局增加相关赛道、产业链和公司研究入口。',
    href: '/future-trends',
  },
]
