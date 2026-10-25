# AI 降价与利润页的数据维护

页面：`/invest/ai-token-economics`（`src/pages/AiTokenEconomics.tsx`）。

## 数据来源与更新方式

| 方式 | 说明 |
| --- | --- |
| 每月自动 | `.github/workflows/ai-token-economics.yml` 每月 16 日抓取 [Ramp AI Index](https://ramp.com/data/ai-index) 的 Tokenomics 表，追加到 `src/features/ai-token-economics/snapshots.json`，提交后触发 Pages 部署。 |
| 本地手动 | `npm run ai-token:update`，效果与 Action 相同。 |
| 页面手动 | 页面上的「刷新最新数据」调用 `/api/ai-token-economics`（本地由 Vite 中间件、线上由 Vercel 函数），取到更新一期只在本次浏览中覆盖显示，**不写入文件**。 |

解析代码：`server/ramp-ai-index.mjs`，测试：`scripts/ai-token-economics.test.mjs`（样本 `scripts/fixtures/ramp-ai-index.html`）。

## 失败处理

- Ramp 页面结构变化或抓取失败：脚本抛错、非零退出、不改动 `snapshots.json`，Action 报红。修复解析后重跑。
- 页面刷新失败：继续显示已保存数据，并提示。
- 同一周重复抓取按 `weekEnding` 覆盖；历史升序保留。

## 口径提醒

- `tokenUsage`、`tokenSpend` 覆盖 Ramp 样本内全部模型供应商；`price.combined` 只覆盖 OpenAI + Anthropic，两者不能直接相乘（页面有演算）。
- Ramp 样本来自使用其 Token 管理产品的企业，不代表全市场；不含模型公司的成本和利润。
- 页面中路透社、Axios、OpenRouter 与 Anthropic 财务来自 2026-10-25 的 AI 对话，未独立核对，已在页面逐条标注，需要时手工更新 `data.ts`。
