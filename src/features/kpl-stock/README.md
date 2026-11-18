# 开盘啦 · 个股

入口 `/market-mood/stock?code=600000`。实现索引检索、当日快捷名单、懒加载详情、区间统计、月收益、CYQ 和 PE/PB 历史估值带。仅使用收盘后的公开数据；公式与限制集中在 `model.ts` 的 METHOD，也直接呈现在页面。

## 生成与文件

运行 `node scripts/kpl-stock.mjs`，不提供跳过日期检查的 FORCE。北京同日、受支持的交易日、15:10 后才运行。5 个来源请求齐备后，以最多 6 个 worker 串行取每只股票的日 K/估值；单请求 7 秒、全局 220 秒，超时/必需源失败保留旧发布文件。估值独立降级并标注来源日期。

- `public/data/kpl-stock.json`：上限 600 只，索引上限 150 KiB。
- `public/data/kpl-stock-<代码前三位>.json`：完整替换的详情分片，删除退出股票及空前缀片。平铺文件名适配共享 workflow 的 `public/data/kpl-*.json` 收集规则。
- `data-raw/kpl-stock/universe.json`：当日及前 10 个交易日的候选池；当日优先，其他按最近出现日期保留。
- 相同日 K 日期复用上次详情（增量请求同时限制 beg/end；实测只设 lmt=1 会被忽略并返回全历史），估值报告滞后时仍尝试刷新。保留股如果没有当日日 K，涨跌幅为空，并标明行情日期。

注意：现有 workflow 的 shell 会展开 `git add public/data/kpl-*.json`，能收集新增/修改的平铺分片，但整片被删除时，这个展开式未必能暂存删除。脚本会正确清理本地分片、索引也不再引用；远程仓库可能残留未引用旧片。按本任务限定，workflow 仅在末尾追加 `stock`，没有改动提交步骤。

## 实测端点与字段

- `push2ex.eastmoney.com/getTopicZTPool`、`getTopicZBPool`：校验 `rc=0`、`qdate`、`tc=pool.length`；`hybk` 为行业。
- 新浪 `Market_Center.getHQNodeData?node=hs_a&sort=amount&asc=0&num=80&page=1/2`：完整两页取成交额前 100，核对长度、排序与重复。无日期快照仅允许北京同日收盘后使用，并再次以每只证券的日 K 日期确认。
- `datacenter-web.eastmoney.com/api/data/v1/get` / `RPT_DAILYBILLBOARD_DETAILSNEW`：验证每行 `TRADE_DATE`；`code=9201` / 空数组表示尚未发布，整次不写。
- `push2his.eastmoney.com/api/qt/stock/kline/get?klt=101&fqt=1`：`fields2=f51,...,f61` 依次为日期、开、收、高、低、成交量、成交额、振幅、涨幅、涨跌额、换手。成交量单位手，成交额元，换手为百分数。浦发银行实测末条为 2026-11-18，收盘 10.72，换手 0.20%。
- 同一数据中心的 `RPT_VALUEANALYSIS_DET` 已验证存在：`SECURITY_CODE,TRADE_DATE,PE_TTM,PB_MRQ,BOARD_NAME`。浦发银行近五年请求返回 1211 条、1 页，2021-11-18 至 2026-11-17；末条 PE 6.98669894、PB 0.47632652。PB 为 MRQ，估值报告可能比行情晚一天。历史分位按日频计算，折线压缩为每月最后一条。
- `push2.eastmoney.com/api/qt/clist/get` 本机探测超时，未将其作为必需来源。

## 公式与边界

- N 日涨幅以 N 条日 K 前的收盘为基期；最大回撤取收盘峰谷（包含基期）；振幅取区间高低差/基期收盘；成交额、换手缺一项则对应聚合为空。停牌无日 K 不补零，交易记录数不等于交易所完整日历长度。
- 月收益以相邻自然月最后一条前复权收盘比较；缺前月为空；仅保留最近 24 个自然月内的可用月份，未结束月份注明月内收益。
- CYQ：首日分布初始化为 1；随后 `C_t=(1-tau)C_(t-1)+tau*T_t`，`tau=min(turnover/100,1)`。三角分布在当日 `[low, high]`，峰值为限制到区间内的 `amount/(volume*100)`；50 桶按边界积分。一字日作为点质量。获利是严格低于收盘的桶权重；平均成本为桶价加权平均；90%/70% 取 5–95/15–85 累积权重分位，集中度 `(high-low)/(high+low)`。
- 前复权 OHLC 与原始成交均价有尺度差异，峰值限制天数和首日残余权重均显示。有限 120 日窗口、桶化、未考虑真实持仓结构，均属于模型误差；并非交易所数据。
- PE/PB 五档为正值日频样本的 min/Q25/Q50/Q75/max，分位数线性插值；当前百分位用并列中秩。PE 负值提示亏损；空值或零值仅视为缺失，PB 独立处理。

## 范围与验证

所属概念只复用已有 `kpl-plates.json` 的公开成分关系，无文件则略过。F10 全套、盘中分时、L2 与平台专有信号未做，原因写在页面。

新增 `scripts/kpl-stock{,-lib,.test}.mjs`、本目录模型/fixture、`KplStock.tsx`/测试与 `kpl-stock.css`；共享修改仅限路由、页签、SEO、对应测试与 workflow 末尾列表。

最终验证和真实运行结果见交付说明；生产 JSON 仅在当日股票池完整且日期通过后保留，不用 fixture 代替。

### 本次交付实测（2026-11-18）

- `npm run -s typecheck`、修改文件的 `npx eslint`、`npm run -s build` 均退出 0；构建后的 `public/changelog.json` 和 `public/data/company-refs.json` 已恢复。
- 前端全套：289 个文件、2100 项通过。共享 node_modules 无写权限，使用 `npm test -- --run --configLoader runner --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 --reporter=verbose`。初始默认并发运行出现其他页面 5 秒超时；静默 reporter 的一次重跑无进度，被中止，详细 reporter 的最终全套在 124.13 秒内通过。
- `npm run -s test:scripts`：648 项通过；本页 node 测试 14 项，包含手算 CYQ、缺失值、日期、600 上限、并发、增量与失败保留文件。个股页组件测试 10 项通过。
- 真实调用 `node scripts/kpl-stock.mjs`：`{"written":false,"date":"2026-11-18","reason":"The operation was aborted due to timeout","seconds":7}`。候选源请求超时，未进入发布阶段；此前单独验证的龙虎榜最新日期也是 11-17。因此此次实际发布股票数 0、索引/分片 0 个、0 B；没有用测试样本或昨日名单补成当日数据。真实完整池的冷启动耗时和体积尚未测得，220 秒预算与并发上限已有测试。
- 浏览器访问 host 不可用，无法做 390px 实机截图/滚动宽度测量；CSS 使用 minmax/min-width:0、可换行结果和 TableWrap 内部滚动，组件与样式守卫已通过。
- 未运行 git commit；原有 node_modules 符号链接未修改或暂存。
