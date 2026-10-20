# 开发上下文

本项目是 React 18 / TypeScript / Vite 5 的 Web 项目；后端包含 server/、api/ 和 supabase/。依据：package.json 与目录布局。包管理器 npm，项目声明 Node 24。

前端入口 src/，后端候选范围在 config.json。现有检查：npm run typecheck、npm run test、npm run test:knowledge、npm run test:valuation-server；只运行与实际变更相关的检查。npm run build 带 prebuild，会生成 changelog/sitemap，执行前核对已有改动。

这里没有 Android 工程，android.paths/checks 留空；迁移到 Android 仓库后从其 Gradle 模块、variant 与 CI 重新发现，不能沿用本项目命令。SDK、模拟器、真机目前未验证。

manager 开工后按实际目标补充业务入口、API 契约位置、验收和发布方式。范围内可逆开发可执行，外部发布动作遵循用户已有授权。技能本身独立于本项目业务。

`.dev-team/config.json` 的 paths/checks 是探测候选，派工前按任务核对。既有 AGENTS.md/CLAUDE.md 仍是项目约束来源。本文件不存账号、密钥或剩余额度。

## 2026-10-17 牛熊周期自动化审查

业务入口 `/monitor?tab=market-cycle`，独立模块 `src/features/market-cycle/`；行情采集 `scripts/market-cycle-snapshot.mjs`，宏观与估值复用 `server/macro.mjs`、`server/indexes.mjs`。已发布观察版；估值、资金、宽度仍需补录。需求详见 `docs/requirements/2026-10-17-cn-hk-market-cycle.md`。当前用户指定Claude独立审查并提出尽量全自动方案；本轮不改生产代码或自动交易，不申请付费数据。近期全量1116测试、同步48测试通过；本任务不需要重复全量构建。

四执行器讨论已完成：Claude、Antigravity CLI1.4.0、Kimi2.2.0、OpenCode1.19.0/MiniMax-M3；7个任务（含事实纠偏/交叉讨论）结算。团队裁决位于 docs/reviews/2026-10-17-market-cycle-automation-team.md，P0-P3已加入docs/TODO-投资工具优化.md。OpenCode并发/性能/费用保证未采纳，正式报告已由manager整理；自动化仍为待实现方案。

## 自动化实施接续

用户已授权实施及提交推送发布。Run run_0a5816e1e4ef：manager负责共享契约、前端、自动周报与CI，Claude完成事实采集及校验修复；Kimi宽度轮次因扩大探测且未交付代码由manager主动停止，同Task通过retry-of交给Claude；Antigravity负责只读交叉审查。当前自动化实现说明 docs/market-cycle-automation.md。自动观察与交易执行分开，尚无策略回测或自动下单。

## 2026-10-20 综合估值方法论
用户授权Codex与Claude讨论四维估值框架并纳入项目。正式裁决 docs/investment-valuation-framework.md；可迁移规范 .agents/skills/stock-analysis/references/public-markets/multidimensional-valuation.md。网站摘要源 src/data/notionNotes.ts，生成脚本 scripts/generate-investment-method.mjs。本轮只改研究标准与技能，不改引擎、不重算个股、不发布；已有ADR/HK估值会话改动保留。Claude独立Task成功并已release/ack，无reclaimable资源。
