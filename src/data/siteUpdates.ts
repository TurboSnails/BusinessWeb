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
