# 综合估值独立页面

## 2026-10-22：PE / PEG / PB 接入与本地使用

综合估值新增三情景 EPS、EPS 增长率百分数、每股净资产及目标 PE/PEG/PB 输入，直接复用工作台 `calculateMultiple`，不自动平均。方法卡分别显示预测价格、适用性和选填要求回报率下的现价约束；基准日价值不能直接当未来卖价。新增 PB/ROE 行业边界说明，以及财务口径、历史/同行倍数依据、共同假设、方法分歧与主辅锚理由记录。

可显式导入同源浏览器中最近一次/已保存工作台报告，或工作台导出的 JSON；不主动请求 AI。导入保留来源、原情景理由、各情景要求回报率和缺项，并重新计算目标价，不信任缓存结果。拒绝不一致预测年度、非法估值日期、缺汇率及现价币种不匹配报告。导入会清空旧公司研究笔记、收益情景与自查，页面提示先下载旧研究；只有明确采用某方法后才复制三情景价格，分红归零、概率留空。改变导入的期限/币种后需确认已重建每股假设，不自动外推或换汇。

草稿自动保存在当前浏览器本地存储，保存失败时显示提示；研究卡导出含财务假设、结果、来源、倍数依据和缺项，并标注“草稿 / 未经独立核验”。估值工作台修改假设后同步最近结果，并新增前往综合估值的入口。修正工作台报告校验对 Kimi / Antigravity 后端的遗漏。

本地页面：`http://localhost:5173/invest/comprehensive-valuation`，当前目录运行 `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`；工作台服务运行 `npm run valuation:server`，监听 `127.0.0.1:8788`。不同域名、端口的浏览器存储互不相通，须在同一访问地址下保存和读取工作台报告。

验证：新增计算、报告边界、导出、草稿与页面交互回归；独立代码评审发现的跨币种现价误标与非法日期问题已修正并补失败→通过测试。`npm run typecheck` 通过；`npm test -- --run` 全站 199 文件、1,273 项通过；`npm run build` 通过并预渲染 2,043 页。ESLint 使用临时目录中与项目匹配的依赖运行，0 错误；估值工作台既有 `attach` effect 依赖警告保留。

Chrome 实测三方法价格、显式采用 PE、刷新恢复和往返 DCF 后恢复；390px 屏宽下整页宽度 390px，三张宽表各自横滑。JSON 文件选择的浏览器实测受扩展文件 URL 权限阻止，未改变浏览器权限；JSON 导入解析、非法报告拒绝和页面导入最近报告由自动化测试覆盖。本轮仅本地运行，未线上部署。

以下为此前版本的设计与验收记录；此前“仅手工情景价、无持久保存”的描述由本节更新。

用户委托自行选择投资板块位置，新增独立页面。现有投资中心以工具与参考承载估值工作台、DCF，故在该组新增“综合估值”，路由 /invest/comprehensive-valuation；搜索、面包屑和同组切换复用 siteMap 注册表。

表面模式：Read + Operate，沿用现有纸书茶室视觉：纸色底、宋体标题、绿色链接、表格与留白，不另建品牌。首屏直接说明四个决策问题，提供方法、测算、研究清单锚点。四维正文按研究顺序展开；测算以可编辑的三情景表为中心，结果就近显示；窄屏仅表格自身可横滑。

测算是手工研究假设。默认教学示例：现价100，悲观85、基准125、乐观180，期限2年，分红0；概率默认留空。统一证券与币种、不再投资分红；未来价格不是今日DCF。概率全空不算期望，部分填写或不合计100%提示修正；价格/期限非法不输出结果。价差比只在Bear<P<Base时定义，不把比值当胜率。年化按终值折算，概率加权终值年化不称期望CAGR。

四组证据文本与复核清单支持Markdown下载，含输入、计算、证据与未勾选项。无自动取数、上传、交易或个人仓位推荐。完整取数与DCF通过既有页面链接进入。此次不部署。

验收：入口可发现、独立路由可加载、三情景与异常输入计算正确、导出包含研究假设及未决证据、可键盘操作和窄屏阅读。样式与组件沿用现有tokens；静态与针对性计算检查，浏览器验证条件允许时执行。

## 实施与验证

已接入 App 懒加载路由、投资工具与参考主入口、同组切换/面包屑、站内搜索与独立SEO（工具页noindex，不新增sitemap）。页面含四维方法与行业边界、三情景价格/累计分红/概率手工输入、持有期与终值等价年化、有效区间内价差比与2:1研究价，以及四组证据/八项自查的Markdown导出。

实际执行：
- `npx tsc --noEmit -p tsconfig.json`：通过。
- `npm test -- --run src/features/comprehensive-valuation/model.test.ts src/data/siteMap.test.ts src/components/SectionChrome.test.tsx src/utils/seo.test.ts`：4文件、45项通过。
- `npx eslint src/pages/ComprehensiveValuation.tsx src/features/comprehensive-valuation/model.ts src/features/comprehensive-valuation/model.test.ts`：通过。
- `npx vite build --outDir /private/tmp/businessweb-comprehensive-valuation-build`：通过；仅Vite构建，未运行发布前的全站预渲染/生成流程。
- `git diff --check`：通过。
- Impeccable检测器对新TSX/CSS返回空问题列表。
- 本机Chrome：投资入口进入新路由；验证1.67:1、28.75%、非法现价拦截、恢复示例与研究卡下载；1440×1000/390×844截图，手机无整页横溢出，无pageerror。

浏览器先因Playwright缓存浏览器缺失未启动，改用已安装Chrome；沙箱启动受限后按环境要求申请权限并成功验证。截图与浏览器报告位于 `.impeccable/review/`。开发服务 `http://localhost:5196/invest/comprehensive-valuation`。

未实施：自动财报取数、研发/SOTP/逆向DCF自动求解、新的个股评级与策略回测；页面将相关完整计算链接到既有工作台/DCF工具。本次未提交、推送或线上发布。

## 设计记录核对（普通扩展）

按 Impeccable documenter handoff 核对既有视觉的延续，依据为 PRODUCT.md、本页方向记录、src/index.css、src/styles/ui.css 与 src/pages/InvestHub.tsx；本记录仅适用于综合估值页面，不建立新的全站设计权威。

- **Tokens 与材质**：comprehensive-valuation.css 直接引用既有纸色背景、正文/次要文字、绿色墨色链接、细边框、间距、圆角与 44px 触控高度变量；计算区以浅色底和边框区分层次，没有引入独立色板或阴影体系。
- **组件与入口**：页面与 InvestHub 共用 Page 外壳、React Router Link 和 Lucide 图标。测算按钮、输入框和表格为页面局部样式，沿用共享 token，并非全部直接复用 ui 控件。siteMap 的 tools 组注册入口，InvestHub 使用既有 CardGroup 呈现；App 已注册独立路由，截图可见面包屑和同组切换。
- **排版与布局**：沿用宋体标题、系统无衬线正文；说明文字限宽 76ch，方法与研究卡使用双栏，三情景计算以表格为中心，结果紧邻输入。700px 以下转单栏、四维导航转两列，宽表仅在自身容器滚动；标题字号和分节留白属于本页阅读与操作密度调整。
- **已核对证据**：读取新页 TSX/CSS 和上述既有来源，查看 .impeccable/review/desktop.png、mobile.png；已有 comprehensive-valuation-browser.json 记录 1440×1000 / 390×844、无整页横溢出及无 pageerror。记录与 PRODUCT.md 的手工假设、条件化演算及研究复核用途一致。既有审查结论为 ship，无 material findings。
- **局限与保留项**：本次仅核对源码、既有截图及浏览器报告，未重新运行浏览器或测试；截图不能证明全部交互状态或所有屏宽。首屏增加研究卡直达锚点、为表格增加可见横滑提示仍为可选优化，均未实施；表格已有可聚焦滚动区域及辅助技术标签。未处理无关页面漂移。
