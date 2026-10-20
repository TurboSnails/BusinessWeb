# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

用户在 Live 投资板块研究公司、核对估值与风险。当前需求由用户明确委托：将已讨论的综合估值框架放到合适位置，作为单独页面。

## Product Purpose

把资产质量、价格、预期差与风险预算连接成可复用的公司研究过程。条件化演算不作为买卖指令。

## Capabilities and Constraints

现有 React / TypeScript 网站已有投资导航、公司研究、估值工作台、DCF 计算器。新页面沿用现有技术与设计，在投资板块提供方法、手工情景测算及研究清单。具体证券数据仍须核实来源；不得将教学值冒充行情，不从主观概率自动推出仓位。

## Evidence on Hand

项目规范见 docs/investment-valuation-framework.md 与股票分析技能的 multidimensional-valuation.md。界面沿用 src/index.css、src/styles/ui.css 与 InvestHub 的既有体系。

## Product Principles

- 数据、假设和计算结果明确区分。
- 情景价格注明时间、币种与分红口径。
- 悲观情景不表示本金保障。
- 研究方法、计算与交易指令保持清楚的含义。
