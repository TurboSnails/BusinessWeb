# 综合估值批量初稿：US（504）与 NDX-10（估值基准日 2026-10-22）

> 程序化条件初稿（`review.mode = programmatic`），不是逐家专家复核，**不得标为 reviewed**。研究倍数未重估，财务分母取供应商口径，一手财报未在本批次逐家重读。本批次**没有任何 present 值**。

## 产物

| 文件 | 说明 |
| --- | --- |
| `scripts/build-company-valuations-us.py` | 生成脚本（只读仓库证据，仅标准库） |
| `public/data/company-valuations/us.json` | US 504 家，schemaVersion 1，asOf 2026-10-22 |
| `public/data/company-valuations/ndx.json` | NDX 10 家，同上 |
| `docs/reviews/2026-10-22-company-valuations-us.md` | 本总结 |

复跑（脚本以 `--universe` 指向 `.local` 公司导出，`--as-of` 显式给日期）：

```sh
python3 scripts/build-company-valuations-us.py --universe public/research/comprehensive-valuation-2026-10-22/universe-us.json  --as-of 2026-10-22 --output public/data/company-valuations/us.json
python3 scripts/build-company-valuations-us.py --universe public/research/comprehensive-valuation-2026-10-22/universe-ndx.json --as-of 2026-10-22 --output public/data/company-valuations/ndx.json
python3 .agents/skills/comprehensive-equity-valuation/scripts/validate_records.py public/data/company-valuations/us.json  --universe public/research/comprehensive-valuation-2026-10-22/universe-us.json
python3 .agents/skills/comprehensive-equity-valuation/scripts/validate_records.py public/data/company-valuations/ndx.json --universe public/research/comprehensive-valuation-2026-10-22/universe-ndx.json
```

## 校验结果（实际运行）

- `us.json`：`{"ok": true, "records": 504, "status": {"conditional": 349, "insufficient": 155}}`，覆盖清单与 `public/research/comprehensive-valuation-2026-10-22/universe-us.json` 一致。
- `ndx.json`：`{"ok": true, "records": 10, "status": {"conditional": 6, "insufficient": 4}}`，覆盖与 `public/research/comprehensive-valuation-2026-10-22/universe-ndx.json` 一致。
- 校验只证明结构、日期、数值顺序与来源引用，不证明财务事实。

## 方法与口径

- **价格**：US 用 `companyMarketSnapshot`（腾讯延迟行情，2026-10-19 供应商最后报价）；NDX-10 无快照，用 Yahoo `regularMarketPrice`（2026-10-19）。快照与 Yahoo 在所有同时具备两者的代码上偏差在 0.5% 以内。两源都要求报价币种与记录一致（均为 USD）。价格日期 2026-10-19 与估值基准日 2026-10-22 分开记录，不称实时。
- **tradability**：514 家的 `marketRefresh.tradability` 全部为 `no-known-restriction`，没有 `unverified` 记录。脚本已加入守卫：若为 `unverified`，不把行情当现价（price 为 null，记录 insufficient）。本批次没有触发该分支。
- **PE 敏感性**（仅当 TTM EPS 与前瞻 EPS 均为正时计值）：值 = Yahoo 前瞻 EPS（一致预期、原始字段）× 该公司自身原研究的悲观/基准/乐观 PE 倍数。`kind = undated`、`date = null`。理由：前瞻 EPS 的预测财年未绑定，原研究倍数针对未来年度 EPS，不能认证为基准日价值。低/高只改变倍数，EPS 不变。未用价格÷PE 倒推 EPS。
- **一致预期冲突守卫**：前瞻 EPS 相对原研究基准 EPS（无则相对 TTM）超过 2 倍，不计值，记为口径冲突（29 家）。例如 ALB 一致预期 11.19 对比原研究基准 0.32。
- **研究日期**：取每家 `asOf` 原文中“原研究：”之后的首个日期（如 2026-09-29、2026-09-21、2026-10-05），原文写入 `assumptions`。无日期则不计值。全部记录均可取得日期，未统一伪造 2026-09-21。
- **研究来源 URL**：`research/comprehensive-valuation-2026-10-22/universe-{us|ndx}.json`（已确认存在于 `public/research/`）；Yahoo 为 `research/data-refresh-2026-10-20/yahoo-quote-batch.json`；Lynch 为 `data/lynch.json`；快照为仓库路径 `src/data/companyMarketSnapshot.json`。
- **倍数单位**：仅当情景文本含 `EPS`、且无 PB/PS/EV/NAV/营收/净资产字样时，把裸 `N×` 视为 PE，并在 reason 中披露（99 家）。标注“未按本轮事实重建”的旧模型情景不用。
- **PEG**：仅当 TTM EPS 为正、Lynch 增速在 (0, 40]% 时适用；与 PE 共享增长假设，不作独立证据，**不计值**。
- **PB**：资产型行业（金融、房地产、公用事业、能源、材料、工业）且 BVPS 为正时适用；轻资产行业（信息技术、医疗、消费、通信）判为不适用。**不计值**（目标 PB 缺 ROE/股权成本依据）。
- **DCF / FCF / 资本开支**：本批次未纳入计值，缺项中逐条注明。
- **相对现价**：记录内 `comparison` 为 `敏感性价 / 现价 − 1`，标注“未定期限”，不称低估或高估。

## 计数

| 维度 | US 504 | NDX 10 | 合计 |
| --- | --- | --- | --- |
| conditional（PE 敏感性有值，`kind = undated`） | 349 | 6 | 355 |
| insufficient（`value = null`） | 155 | 4 | 159 |
| `kind = present` | 0 | 0 | 0 |
| PE 适用 | | | 483 |
| PEG 适用（不计值） | | | 231 |
| PB 适用（不计值） | | | 258 |

insufficient 的 159 家按原因分组：

- **研究情景缺 PE 倍数、倍数非 PE 口径、或标注旧模型**：99 家（含 EV/S、PB、NAV 类研究情景）。
- **TTM 或前瞻 EPS 不为正 / 供应商无 EPS**：31 家（如 CRWV、MSTR、NBIS、RKLB、INTC、GILD、COIN 等）。
- **一致预期 EPS 与研究基准口径冲突（超过 2 倍）**：29 家（如 STX、NOW、ALB、SNDK、TPL 等，完整名单见记录 `methods[PE].reason`）。

## 需要读者注意的结果

- **系统性偏高**：355 家 conditional 中，306 家（86%）的敏感性价高于现价，中位数约 +20%。主因是原研究倍数普遍高于现价前瞻 PE，且一致预期口径常高于原研究 EPS 假设。**这是输入与倍数的结果，不是买入信号**。
- **倍数偏离过大（已在 missing 标注）**：NVDA（+105%）、AMCR（+128%）、BG（+128%）、CTVA（+239%）。原研究倍数远高于现价隐含前瞻 PE，需重核倍数依据后才可作估值参考。
- **EPS 口径分歧**：conditional 记录中，前瞻一致预期与原研究基准 EPS 的差异已写入 `assumptions`（“方法分歧”）与 `pricing`。例如 MSFT 一致预期 23.72 对比原研究基准 20.0，相差 +18.6%。
- **悲观/乐观仅改倍数**：`risk` 中明确写“倍数压缩情景而非下限”。

## 未做、限制与待协调者确认

1. 未逐家重读财报，未做一手公告抽查（本轮未执行网页检索）。`sources` 的 asOf 为资料日期：快照与 Yahoo 批量为 2026-10-20，Lynch 为 2026-10-20，原研究为各家原文日期。
2. 预测财年未绑定，因此 PE 值全部是未定期限敏感性。要得到基准日 `present` 值，需要两项依据：基准日正常化盈利（有分母来源）与当期相对倍数（有依据的倍数）。本批次均不具备。
3. 脚本在记录中增加了契约未禁止的字段：`comparison`、`legacy`（旧评级与旧纪律区，仅作历史参考）、`sector`、`generatedBy`。页面未改动。
4. 契约未说明：当 PEG 与 PE 共享增长输入时是否允许 PEG 计值。本批次选择不计值。
5. 旧研究评级保存在 `legacy.rating`，未被本轮价格判断静默覆盖。
6. 没有写入页面，没有部署，没有修改 `.env` 或他人文件，没有 `git` 提交。

本报告仅供研究参考，不构成个人投资建议。

## 追加（第二轮）：DCF 与行业辅锚适用性

- **DCF**：有预取历史财报、股数与资产负债项的非金融公司（195 家）标注为适用，inputs 来源 `dcf-prefill`，但缺显式预测期、再投资与终值假设，**本批次不计值**。金融公司（77 家）判为不适用（不以 FCFF 估值）。无预取数据的公司判为不适用并说明原因。
- **旧 DCF 自动值**：`legacy.dcfAuto` 存放原始数组（240 家），字段口径未核，仅存档，不计入本轮估值。
- **金融行业辅锚**：银行与其他金融公司标注 `PB-ROE`（72 家适用、不计值）；保险公司标注 `EV/NBV`（3 家，缺 EV 与 NBV）。
- **房地产辅锚**：统一标注 `NAV/AFFO` 为待核适用（30 家）。供应商长名无法可靠识别 REIT（如 American Tower），需先核实身份后再选 AFFO 或分部 NAV。
- 统计：present 仍为 0；校验结果不变（US 504：conditional 349 / insufficient 155；NDX 10：6 / 4）。

## UI 只读复核摘要（协调者文件，未编辑）

已发现的真实问题（已发消息给协调者）：

1. **区间筛选恒为零**：`matchValuationFilter` 对非 present 值返回 false，而当前全部记录均为 undated，因此“低于/位于/高于条件区间”三项在现数据下恒为 0。“有数值估值”把未定期限敏感性计入分母，易被读作数值估值完成。
2. **加载失败与无数据不可区分**：`loadCompanyValuations` 捕获所有错误并返回空 Map；损坏或 404 时，列表与详情均显示“等待估值数据”或“尚未加载”，且 `parseValuationDocument` 静默丢弃无效记录。
3. **刷新价无币种校验**：`compareValuation` 使用 `marketRefresh.price` 时无 currency 字段可比。当前 us/ndx 均为 USD，无实际错配；cn/hk 接入时存在风险。
4. **来源文案不一致（低）**：NDX 估值记录的价格源为 Yahoo，页面 `marketRefresh` 显示腾讯。10 只数值一致，仅 provenance 文案不同。
5. **分母口径（低）**：“等待估值证据”包含无记录公司，cn/hk 无估值文件时整市场计入等待。

无其它重大问题；`reviewed` 与 `programmatic` 的提示、旧评级与新估值分列、日期币种显示均正确。

## 协调者复核处理

UI 已加入未来/未定期限筛选，基准日区间筛选明确仅针对 present；加载失败和无效记录输出诊断；更新报价须币种匹配才用于比价。主列表与详情保留来源记录日期，不声称实时。
