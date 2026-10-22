# 综合估值 · cn 市场批量条件初稿（2026-10-22，第 2 轮修正）

范围：`public/research/comprehensive-valuation-2026-10-22/universe-cn.json`（公开归档底稿）全量 832 家 A 股公司。产出：`public/data/company-valuations/cn.json`（schemaVersion 1），由 `scripts/build-company-valuations-cn.py` 程序化生成，`--as-of 2026-10-22`，可重复运行；生成时内置算术/契约断言（`verify_record`），任何一条不符即拒绝写出。本批为**程序化条件初稿**（review.mode=programmatic，无 reviewed），未逐家重读财报，不构成认证。

## 计数（契约校验 + 根校验实跑）

```
python3 .agents/skills/comprehensive-equity-valuation/scripts/validate_records.py \
  public/data/company-valuations/cn.json \
  --universe public/research/comprehensive-valuation-2026-10-22/universe-cn.json
→ {"ok": true, "records": 832, "status": {"conditional": 459, "insufficient": 373}}

node scripts/verify-company-valuations.mjs
→ ok: true（us/cn/hk/adr/ndx 全市场通过；cn 段：832 条、浏览器解析器全收、来源全部归档、无 .local 引用、kinds: undated 459）
```

- 覆盖：832/832 键与归档 universe 一致，无重复/多余；每条记录均含四维与 **PE/PEG/PB/DCF/SOTP** 五方法适用性评估（不适用写原因，无依据一律不计值）。
- 主锚：PE 459（全部 conditional，kind=**undated**/date=null——前瞻 EPS 未绑定财年且研究倍数针对 2027 正常化利润，仅作可复算条件敏感性，不认证今日价值，与 US/HK 口径一致）；无数值锚 373。status：conditional 459 / insufficient 373 / reviewed 0。无旧 undated 三价冒充，所有数值由披露输入重算。
- 832 家币种均 CNY；830 家现价为腾讯延迟行情 2026-10-20 供应商最后报价（与 Yahoo 批量价差 <0.5%）；2 家无现价（601059 信达证券、601198 东兴证券，换股/终止上市流程，tradability=unverified，按协调者口径不作现价）。

## 本轮修正要点（相对第 1 轮）

1. **29 家银行一律 insufficient**：原研究 ratioNote 明确"旧盈利模型已撤回／暂停使用，本轮不认证赔率，刷新行情不恢复原模型"。value=null 且 PB method.values=null，不得披露撤回却恢复数值；ROE/g/Ke 假设与稳态PB三元组保留在 inputs/expectations 供重估追溯，missing 写明"待重估 ROE/g/Ke 或改 EV/NBV 专用模型"。
2. **来源全部归档**：research-cn 来源 url 由 `.local/comprehensive-valuation/cn.json` 改为 `research/comprehensive-valuation-2026-10-22/universe-cn.json`（public 已归档，根校验不再报未归档）。
3. **补 DCF 与 SOTP/行业辅锚适用性/缺项**（全部 832 家）：DCF applicable 249（dcf-prefill 有 ≥3 年 OCF/资本开支原值，β 可作输入；但无逐家依据的显性期增长/再投资/WACC-Ke 假设，不计值）；金融企业 DCF 明确不适用（资本即原料，应改 EV/NBV/剩余收益）；未覆盖 532 家写明缺多年现金流原值。SOTP applicable 326（工业/房地产/金融/多元业务，桥接未闭合不计值）。两辅锚 values 全为 null，无依据不算数值。
4. **算术断言并实跑**：`verify_record` 对每条记录断言——value 等于主锚 method.values 且可按披露 inputs 复算（PE=forwardEps×倍数、PB=bookValue×倍数，误差 ≤0.011）；0≤low≤base≤high；kind 规则（present.date=基准日 / undated.date=null / future>基准日）；comparison=估值/现价−1（误差 ≤0.0001）；币种一致；insufficient⇒value=null 且有具体缺项；来源无 .local 且仓库路径存在；含 PE/PEG/PB 评估。832 条全过，0 失败。
5. **PE 全部改 kind=undated**（协调者验收硬条件，与 US/HK 统一）：前瞻 EPS 未绑定财年、研究倍数针对 2027 正常化利润，兑现期限未定义；pricing/comparison 明确"期限未定义条件敏感性，非今日内在价值/非低估结论"，missing 写明转 present 所需条件；不是仅改时间标签，comparison 与披露同步改口径。
6. 保留第 1 轮守卫与披露：前瞻 EPS >10× max(TTM, 研究基准) 视为疑似异常不计值（石英股份 59×、岩山科技 37×、完美世界 17.7× → insufficient）；3–10× 在 reason 标"低基数/复苏口径，对共识高度敏感"（36 家）；不复制旧 scenario 价格，所有数值由披露输入重算。

## insufficient 373 家的缺项构成（按首条缺项归类，实跑统计）

- 239 家：研究情景倍数 [MISSING]/非单调（正常化利润、现金或NAV/EV桥接未闭合，旧盈利模型已撤回；工业/金融非银/房地产为主）。
- 79 家：原研究明确"持续盈利 PE 不适用；PS/NAV 输入待核"（亏损/微利）。
- 29 家：银行稳态PB模型原研究已撤回（本轮修正口径，value 与 method.values 均置空）。
- 21 家：TTM/前瞻 EPS 非正或缺失，无同口径正常化盈利。
- 3 家：前瞻 EPS 异常守卫（石英股份 59×、岩山科技 37×、完美世界 17.7×）。
- 2 家：无现价（601059/601198，可交易性未认证）。
- 每家保留四维分析、五方法适用性记录与可续做缺项。

## 事实核查（校验之外的人工抽查）

- 重算抽查（独立于生成器）：603596 伯特利、300750 宁德时代（461.75/615.67/769.58）、601899 紫金矿业、000625 长安汽车，存储值与手算一致；comparison 全量复算 0 失配（断言覆盖）。
- 守卫有效性：石英股份前瞻 EPS 14.74 vs TTM 0.25/研究 0.121，拦截后 insufficient。
- 无 reviewed 冒名；PE 主锚全部 kind=undated/date=null（无任何 present 数值），来源 asOf 均为资料日期（快照 2026-10-20、研究批次日、Lynch 2026-10-20、dcf-prefill 采集日），生成日未写成核验日。

## 已知局限与风险

- 倍数全部沿用原研究假设（"未校准历史分位"），本批次未重估；前瞻 EPS 为供应商一致预期，未与公司披露核对。
- 基准情形相对现价差额 >+100% 的 conditional 42 家（超 +200% 的 5 家：603929 亚翔集成、600363 ST联光、300502 新易盛、603379 三美股份、600522 中天科技），为机械应用研究倍数+前瞻共识的结果，建议协调者合并复核优先抽查；36 家 3–10× 低基数敏感已在 reason 标注。
- 601059/601198 流程结束后需重取价重算；银行 PB 待研究员重估或改 EV/NBV 模型后恢复计值；DCF/SOTP 辅锚待逐家假设补齐后再评估。

## 复跑指令

```bash
# 全量重新生成（内置算术断言，失败即拒绝写出）
python3 scripts/build-company-valuations-cn.py \
  --universe public/research/comprehensive-valuation-2026-10-22/universe-cn.json \
  --as-of 2026-10-22 --output public/data/company-valuations/cn.json
# 小样自检：加 --codes 603596,000001,000009（PE/撤回银行/撤回工业）
# 契约校验 + 根校验
python3 .agents/skills/comprehensive-equity-valuation/scripts/validate_records.py \
  public/data/company-valuations/cn.json \
  --universe public/research/comprehensive-valuation-2026-10-22/universe-cn.json
node scripts/verify-company-valuations.mjs
```

本报告仅供研究参考，不构成个人投资建议。
