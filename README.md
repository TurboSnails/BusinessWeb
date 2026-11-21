# gupiaoWS / BusinessWeb

个人投资研究工作台：按《正念投资》的方法，把看环境、找公司、估值、记录与复查、交易工具放在一个站点里。覆盖 A 股、港股、美股（标普 500、纳指 100 与部分非标普公司及 ADR）。站内所有内容是研究材料，**不构成投资建议**。

- 线上：<https://business-web-black.vercel.app>（Vercel，含 API）；<https://turbosnails.github.io/BusinessWeb/>（GitHub Pages，静态镜像，API 仍走 Vercel）
- 栈：React 18 · TypeScript · Vite 5 · React Router 6 · Vitest · Node 24

站内还有 AI 实验室、博客、知识图谱、自由之路等栏目；AI 技能的说明见 [docs/ai-skills.md](docs/ai-skills.md)。

## 主要功能

投资栏目入口是 `/invest`。下表按使用顺序列出主要页面。

| 环节 | 页面 | 路由 |
|---|---|---|
| 规则 | 《正念投资》全文与目录 | `/first-book` |
| | 投资计划：三笔钱、再平衡、红线 | `/investment-plan-2026` |
| | 新手入口：5 分钟自测与路线 | `/invest/start` |
| | 我的计划与持仓（只存本机） | `/invest/my-plan` |
| 看环境 | 观察盘：宏观阶段、全球指数、A 股一页看完 | `/watch` |
| | 宏观温度：中美港宏观、美股与中国市场、牛熊周期、估值位置、股债息差 | `/monitor` |
| | 全球行情、A 股每日复盘、板块轮动、涨停板块 | `/pulse`、`/daily-analysis`、`/sector-rotation`、`/limit-up-analysis` |
| | 三方平台风格页：开盘啦、同花顺、今天几星 | `/market-mood`、`/ths-mood`、`/jixing` |
| 找公司 | 公司研究：四个市场的公司库、林奇分类、研究方法 | `/research-notes` |
| | 公司详情：现价与情景价位、决策信号、三情景、风险与证伪 | `/research-notes/:market/:code` |
| | 产业格局、主题研究、财报前瞻、国家队持仓 | `/industry-landscape`、`/future-trends`、`/earnings`、`/invest/national-team` |
| | 机会雷达：价值回归与快速增长短名单 | `/radar` |
| 估值 | 综合估值：资产质量、交叉估值、预期差与风险预算 | `/invest/comprehensive-valuation` |
| | 估值工作台（连接本机估值服务） | `/valuation` |
| | DCF 计算器、指数全景 | `/dcf`、`/index-panorama/` |
| 记录与复查 | 候选池：备注、排序、决策记录、复查日、条件价提醒，可选云同步 | `/candidates` |
| 交易工具 | 网格交易：模拟、参数求解、回测、记录，可选云同步 | `/grid-trading` |
| | ETF 复盘、ETF 清单与研究笔记、ETF 流派地图 | `/etf-review`、`/industry-etf`、`/notes`、`/invest/etf` |
| 实验观察 | ETF 资金流、主升浪、择时与三方案回测（未验证，不是买卖指令） | `/lab/*` |

另有两个本机运行的服务：

- **估值服务**：`/valuation` 连接本机 Pi / Codex / Claude / OpenCode，采集财报并做六方法三情景估值。启动方法见 [docs/valuation-local-setup.md](docs/valuation-local-setup.md)。
- **个人知识中心**：`/knowledge` 与 Obsidian 共用 Markdown，`npm run knowledge:app` 启动；本地 MCP 可读写，HTTP MCP 只读。见 [docs/knowledge-local-setup.md](docs/knowledge-local-setup.md) 与 [docs/knowledge-garden-and-http-mcp.md](docs/knowledge-garden-and-http-mcp.md)。私人数据不发布到静态站点。

## 数据从哪来、多久更新

页面数据以静态 JSON 放在 `public/data/`，由 GitHub Actions 定时采集并提交回仓库；少量实时行情通过 `/api/*` 代理获取。

| 数据 | 主要来源 | 工作流 | 频率 |
|---|---|---|---|
| 公司报价、估值覆盖层、信号台账 | 腾讯、东方财富、新浪、雅虎等行情接口 | `company-refresh.yml` | 工作日 |
| DCF 预填库 | SEC XBRL、东方财富等 | `dcf-prefill.yml` | 每日 |
| 财报日历与一致预期 | 东方财富、雅虎等 | `earnings-calendar.yml` | 每日 |
| 宏观快照、牛熊周期、美股市场与流动性 | FRED、Cboe、OFR、AAII、指数行情等 | `macro-snapshot.yml`、`market-cycle.yml` | 工作日 / 每日两次 |
| 中国市场、股债息差 | 中金所、国证指数、东方财富、FRED 等 | `cn-market.yml`、`spread-snapshot.yml` | 工作日 |
| A 股每日复盘 | 行情与涨跌停数据 | `daily-analysis-snapshot.yml` | 工作日 |
| 开盘啦、同花顺、今天几星 | 对应平台的公开数据 | `market-mood.yml`、`kpl-tabs.yml`、`ths-mood.yml`、`ths-tabs.yml`、`jixing-tabs.yml` | 工作日 |
| ETF 技术面、主升浪、择时影子记录 | 行情接口、同花顺 | `etf-technical.yml`、`etf-uptrend.yml`、`etf-timing-shadow.yml` | 工作日 / 每日 |
| 指数全景 | 东方财富等指数估值数据 | `index-panorama.yml` | 工作日 |
| 国家队持仓 | 东方财富（上市公司定期报告、ETF 持仓） | `national-team.yml` | 每周 |
| AI Token 经济 | Ramp 等公开数据 | `ai-token-economics.yml` | 每月 |
| 评级复盘与周期回测 | 站内数据 | `rating-review.yml` | 每周 |
| 数据新鲜度检查 | 站内数据 | `data-freshness.yml` | 每日 |

工作流里的时间是 UTC。字段口径、过期判断、人工补采步骤和每次刷新的留痕方式见 [docs/data-maintenance.md](docs/data-maintenance.md)。候选池提醒邮件和每周变化摘要由 Vercel Cron 触发，设置方法也在该文档里。

## 快速开始

```bash
cd BusinessWeb
npm ci
npm run dev          # http://localhost:5173
```

需要 **Node 24**（`package.json` 的 `engines` 已声明）。开发服务器自带 `/api/grid-market` 行情代理；`/api/grid-sync` 等同步接口只在 `vercel dev` 下运行。

## 验证

```bash
npm test              # 前端单元与组件测试
npm run test:scripts  # 数据采集脚本测试
npm run test:functions
npm run typecheck
npm run lint
npm run build         # 含 prebuild，会重新生成 changelog、sitemap 等文件
```

推送到 `main` 时，Pages 工作流会跑前端测试、typecheck、lint、脚本测试、估值服务与知识中心测试、Obsidian 插件检查，全部通过后再构建发布。`npm run build` 的 prebuild 会改写 `public/changelog.json` 等生成文件，本地验证后不要把这些无关改动混进提交。

## 目录结构

```
BusinessWeb/
├── src/
│   ├── pages/            路由页面（投资各栏目、开盘啦 kpl/、同花顺 ths/、今天几星 jixing/）
│   ├── features/         按功能划分的模块（公司估值、宏观、美股市场、牛熊周期、候选池、网格交易等约 80 个）
│   ├── components/       共享组件；ui/ 为页面骨架、卡片、页签、表格等基础组件
│   ├── data/             站内研究数据与站点地图（siteMap.ts）
│   ├── styles/           全局令牌（index.css）、共享类（ui.css、shell.css）与各页样式
│   ├── services/、hooks/、utils/、content/
├── public/data/          定时采集的静态数据
├── scripts/              数据采集、生成与检查脚本
├── api/                  Vercel Functions（行情代理、云同步、问答、评论等）
├── server/               本机开发与估值、知识中心服务端代码
├── supabase/migrations/  可选云同步的表结构
├── packages/、tools/、knowledge-sync/、obsidian-plugin/
├── .github/workflows/    数据采集与 Pages 发布
└── docs/                 维护与设计文档
```

## 部署

- **Vercel（主站）**：Production Branch 为 `main`，Build Command `npm run build`，Output Directory `dist`。Functions 处理 `/api/*`。完整步骤、免费额度、可选 Supabase 同步与环境变量见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。
- **GitHub Pages（静态镜像）**：[.github/workflows/pages.yml](.github/workflows/pages.yml) 在推送 `main` 时测试、构建并发布；本地可用 `npm run build:pages` 验证。仓库 Settings → Pages 的来源需选 **GitHub Actions**。Pages 不运行 Functions，API 走 Vercel。

站内「最近更新」只在 `/about` 展示，维护在 [src/data/siteUpdates.ts](src/data/siteUpdates.ts)：只登记已上线、用户可感知的变化，不自动导入 Git 提交。

## 研究口径与界面约定

- **涨跌色**：A 股、港股红涨绿跌，用 `--up` / `--down`；美股绿涨红跌，用 `--system-green` / `--system-red`，页面上标注口径。折溢价、风险状态等非涨跌含义不用涨跌色。由 `src/styles/colorSemantics.test.ts` 锁定。
- **估值待核**：综合估值在以下任一情况下标为"估值待核"并写明原因，不显示偏低 / 偏高幅度，也不计入"低于 / 高于情景区间"筛选：按前瞻盈利计市盈率超过 60 倍或前瞻盈利不为正；前瞻与过去 12 个月盈利相差 3 倍以上；现价高于基准 2 倍或低于基准一半。阈值是展示规则，定义在 `src/features/company-valuation/model.ts`。
- **数据与假设分开**：情景价标明日期、币种和来源；缺失数据显示"未取得"，不补数；悲观情景不表示本金保障。产品原则见 [PRODUCT.md](PRODUCT.md)，估值方法见 [docs/investment-valuation-framework.md](docs/investment-valuation-framework.md)。
- **界面**：页面根节点用 `<Page>`，每页一个 `<main>`、一个 h1；文字不小于 12px（图表内文字除外），控件高度不低于 32px，触屏不低于 44px；单选和复选框保持原大小，可点区域由整行标签承担。组件层约定见 [docs/superpowers/specs/2026-10-11-ui-system-design.md](docs/superpowers/specs/2026-10-11-ui-system-design.md)，内联样式与硬编码颜色由 `src/styles/inlineStyleRatchet.test.ts` 限制只减不增。

## 限制与边界

- 不做多用户登录与权限系统；云同步用专用口令，按单用户多设备设计。
- 没有文件上传存储（R2 / S3）。
- A 股、港股行情依赖公共接口（东方财富、腾讯等），不保证长期稳定；接口失败时相关卡片取不到数据。
- AKTools 需要单独的 Python 服务，未自动部署；使用时配置 `VITE_AKTOOLS_BASE_URL`，见 [docs/AKSHARE.md](docs/AKSHARE.md)。
- 投研 skill 与站内研究的产出都是研究材料，不构成投资建议。

## 相关文档

- [docs/data-maintenance.md](docs/data-maintenance.md)：数据台账、维护周期与验收
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)：Vercel 与 Supabase 部署
- [docs/investment-valuation-framework.md](docs/investment-valuation-framework.md)：综合估值方法
- [docs/market-cycle-automation.md](docs/market-cycle-automation.md)：牛熊周期自动化
- [docs/daily-analysis.md](docs/daily-analysis.md)：A 股每日复盘
- [docs/ai-skills.md](docs/ai-skills.md)：AI 技能与 AI 实验室说明
- [docs/research/](docs/research/)：研究报告与回测
- [docs/superpowers/](docs/superpowers/)：设计 spec 与实施计划
