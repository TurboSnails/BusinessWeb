# 综合估值协作验收（2026-10-22）

本轮先把方法固定为 `.agents/skills/comprehensive-equity-valuation/SKILL.md`，再分派 Claude（US/NDX）、Kimi（CN）、Antigravity CLI（HK/ADR）。协调者负责技能、统一数据契约、页面接入、独立算术检查与验收。三个批次均为程序化条件初稿，不代表逐家独立重读财报，也不改变原研究评级。

## 验收中实际拦截的事项

- 前瞻 EPS 未绑定预测财年、旧研究倍数面向未来年度：不得标为 `present`；只可显示未定期限敏感性。
- 港股/ADR 最初直接沿用旧三价，与本轮披露的 EPS × PE 不一致：退回重算，要求方法输入可复算。SOFI 必须区分研究预测 EPS 与供应商一致预期，不能未量化混入 TBV 后声称综合价。
- A 股银行已撤回/暂停的 PB 模型：退回要求保留原因并暂停数值，不能靠改名 conditional 恢复旧模型。
- 本机 `.local` 路径：退回改为冻结公开归档；导出日期不能替代原研究日期。
- 价格刷新：必须币种一致、日期不早于记录，无法确认可交易性的行情不用于比价。
- 区间筛选：基准日估值与未来/未定期限分别筛选；不把未来价差叫今日低估。

## 一手来源抽查的实际范围

协调者访问了 [Microsoft FY26 Q4 官方业绩](https://www.microsoft.com/en-us/Investor/earnings/FY-2026-Q4/press-release-webcast) 与 [Tencent 官方业绩入口](https://www.tencent.com/investors/results/)（访问日期 2026-10-22）。Microsoft 公告中的 FY2026 GAAP EPS 为 17.95 美元，与本轮 MSFT 供应商 TTM 输入相符；这不认证前瞻 EPS 23.72118、目标 PE 倍数或其它公司的财务事实。Tencent 官方入口提供最新季度/中期材料，但本轮未逐项完成公告 EPS、汇率、股份单位与供应商前瞻字段的桥接，不能声称该步骤已完成。报价币种与财报币种不同也不能自动推断供应商每股字段已经正确折算。

来源抽查不等于全库一手复核。现有数值反映供应商分母与原研究参数的条件敏感性；完整基准日价值仍需逐项核实正常化盈利、预测财年、股份/ADR单位、资本回报、再投资与目标倍数。

## 可重复检查

- `node scripts/verify-company-valuations.mjs`：技能契约、冻结清单覆盖、前端实际解析器与归档路径。
- `npm test -- --run src/features/company-valuation`：渲染/比较、币种/日期、全库数据及从披露输入复算 PE；四舍五入允许一分钱差异。
- 各市场生成器接受冻结 universe、显式 `--as-of` 与输出路径；国际生成器内含算术回归，不能用校验通过替代财务事实复核。
- `python3 -B .agents/skills/comprehensive-equity-valuation/scripts/test_validate_records.py`：独立技能校验器回归。

最终数量以公开批次归档 README 和验证命令实际输出为准。缺项保留在对应公司详情，禁止把全量覆盖称为全量数值估值完成。

## 最终验收结果

实际全量检查：1540条，968条条件数值（967 undated、1 future），572条等待证据，present=0、reviewed=0。202个测试文件、1283项测试全部通过；完整TypeScript检查与生产构建通过。技能结构校验与4项校验器回归通过，项目工具镜像与ZIP一致。US、CN、NDX以冻结归档重跑与交付文件逐字节相同；HK/ADR已全量重跑内置算术回归。浏览器确认主列表五列为公司/评级/一句话结论/估值/候选，腾讯详情的条件输入和价格日期显示正确。
