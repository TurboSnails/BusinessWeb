# 全公司综合估值批次 · 2026-10-22

方法入口：`.agents/skills/comprehensive-equity-valuation/SKILL.md`。Claude 负责 US/NDX、Kimi 负责 CN、Antigravity CLI 负责 HK/ADR；协调者独立核算并接入网站。

| 市场 | 记录覆盖 | 条件情景有数值 | 等待证据 |
| --- | ---: | ---: | ---: |
| us | 504 | 349 | 155 |
| cn | 832 | 459 | 373 |
| hk | 127 | 104 | 23 |
| adr | 67 | 50 | 17 |
| ndx | 10 | 6 | 4 |
| 合计 | 1540 | 968 | 572 |

这表示全量研究池已有估值记录，不表示1,540家公司已完成数值估值或逐家一手财报复核。所有结果均为 programmatic 条件初稿，无 reviewed 认证。PE、PEG、PB逐项说明适用性；无独立目标参数的PEG/PB保留缺项，不凑数值。

968条数值中967条为未定期限敏感性，SOFI为2027年底研究情景；present为0，不等于今日内在价值。供应商前瞻EPS未绑定财年、旧研究倍数未重估、普通/特别股息构成和跨币种/ADR股份换算仍有待核项。现价采用冻结供应商最后可得报价（逐条显示日期），不是实时价格。

`universe-*.json` 是本轮完整清单和原研究的冻结导出，包含原研究日期。`public/data/company-valuations/*.json` 是结构化分析；每家公司缺项、计算输入、公式、来源与四维精简结论可在公司详情查看。原评级及一句话结论保留，价差不自动生成新买入评级。

复核命令（从 BusinessWeb 目录执行）：

```sh
node scripts/verify-company-valuations.mjs
npm test -- --run src/features/company-valuation
```

生成器接受 `--universe public/research/comprehensive-valuation-2026-10-22/universe-MARKET.json --as-of 2026-10-22 --output OUTPUT.json`。US/NDX用 `scripts/build-company-valuations-us.py`，CN用 `scripts/build-company-valuations-cn.py`，HK/ADR用 `scripts/build-company-valuations-international.py`。输出可指向临时目录对比，不必覆盖交付文件。

契约校验和算术复算不证明财务事实或目标倍数有效。下一轮应优先补：已撤回模型的重新立论、财报/预测财年与股份单位桥接、可持续盈利和资本回报、目标倍数/股息率依据、DCF预测与再投资。不得通过删除证据不足的公司提高完成率。
