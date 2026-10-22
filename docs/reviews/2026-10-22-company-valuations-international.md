# 港股 (HK) 与美股中概/全球龙头 (ADR) 综合估值交付报告（修正重算版）

- **估值基准日**：2026-10-22
- **责任范围**：港股（hk, 127 家）、ADR与美股非标普（adr, 67 家）
- **依据契约**：`.agents/skills/comprehensive-equity-valuation/SKILL.md`、`references/methodology.md`、`references/delivery.md`
- **执行脚本**：`scripts/build-company-valuations-international.py`
- **产出路径**：
  - `public/data/company-valuations/hk.json`
  - `public/data/company-valuations/adr.json`
- **模式声明**：`review.mode = "programmatic"`，全量生成均披露为程序化批量条件初稿，绝不冒充逐家独立复核（`reviewed`）。

---

## 1. 复核问题针对性修正

针对协调者复核指出的关键问题，本轮对脚本算法与生成逻辑进行了根本性重构：

1. **废除旧价格复制，实现 100% 披露输入直接复算**：
   - 彻底废除任何读取 `entry.scenarios` 旧价格的逻辑；
   - 严禁任何未披露的隐藏系数（如 0.8/1.0/1.15 等）；
   - PE 主锚数值严格直接由披露的 `epsForward × multiples` 计算：
     - **腾讯控股 (00700)**：披露 `epsForward = 35.565918 HKD`，情景倍数 `[12, 16, 20]×`，严格重算为 `[426.79, 569.05, 711.32] HKD`（彻底消除旧价格复制偏差）；
     - **长和 (00001)**：披露 `epsForward = 6.6475 HKD`，情景倍数 `[8, 10, 12]×`，严格重算为 `[53.18, 66.48, 79.77] HKD`；
     - **台积电 (TSM)**：披露 `epsForward = 23.38529 USD`，情景倍数 `[16, 22, 28]×`，严格重算为 `[374.16, 514.48, 654.79] USD`。
2. **股息模型由披露 DPS 与 Yield 直接重算**：
   - 股息率定价公式统一为 `Price = DPS ÷ (Yield / 100)`；
   - **汇丰控股 (00005)**：披露 `dividendRate = 5.87 HKD`，目标股息率 `[7.0%, 5.0%, 4.0%]`，严格重算为 `[83.86, 117.40, 146.75] HKD`；
   - **劳埃德银行 (LYG)**：披露 `dividendRate = 0.22 USD`，目标股息率 `[7.0%, 5.0%, 4.0%]`，严格重算为 `[3.14, 4.40, 5.50] USD`。
3. **PB 缺乏闭合桥接与 ADR 冲突时果断降级**：
   - ADR 之汇丰控股（`HSBC`）与道明银行（`TD`）旧 `numericDraft` 缺乏同口径已核实的 BVPS、可持续 ROE、CoE 及 ADR 汇率/换股比例桥接，且供应商 BVPS 存在每股与每 ADS 折算歧义（例如 HSBC 供应商 PB 达 7.38×）；
   - 依协调者指示，不再复制旧数值草案，果断降级为 `status: "insufficient"`，强制 `value: null`，并在 `missing` 中详尽解释原因。
4. **SOFI 采用单一可解释 PE 远期模型**：
   - 废除模糊未量化的 TBV 综合与硬编码 `8/19/28`；
   - 采用单一透明 PE 远期模型：2027 调整后预测 EPS `[$0.45, $0.80, $1.05]` × 目标倍数 `[17, 24, 28]×`，严格重算为 `[$7.65, $19.20, $29.40] USD`；
   - 属性明确标注 `kind: "future"`, `date: "2027-12-31"`，绝不混淆为即期折现内在价值。
5. **货币与 ADR/ADS 单位核验**：
   - 对全部 ADR 与港股标的核验 `price / epsForward` 与供应商 `forwardPE` 的偏离度，偏离超过 5% 即判定存在单位或换算冲突并自动降级为 `insufficient`。
6. **内置全量算术回归测试（Regression Tests）**：
   - 脚本内置 `run_arithmetic_regression_tests()`，每次生成后自动执行：
     - 严格断言腾讯（00700）、长和（00001）、SOFI、汇丰（00005）、劳埃德（LYG）的标准算术结果；
     - 严格断言 ADR 之 HSBC 与 TD 降级为 `insufficient` 且 `value=null`；
     - 严格遍历全量 194 家公司，对每家 `conditional` 公司断言其 `value` 必须与 `inputs` 计算值 100% 绝对一致（精确到 0.01），无一例外。

---

## 2. 交付成果与校验统计

使用技能规范校验工具 `scripts/validate_records.py` 对两个市场输出文件进行全量验证：

```bash
python3 scripts/validate_records.py public/data/company-valuations/hk.json --universe .local/comprehensive-valuation/hk.json
python3 scripts/validate_records.py public/data/company-valuations/adr.json --universe .local/comprehensive-valuation/adr.json
```

### 实际统计计数

| 市场 | 总覆盖证券数 | 条件初稿 (conditional) | 待补证据 (insufficient) | 结构与契约校验 | 算术回归测试 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **香港市场 (hk)** | 127 | 104 (81.9%) | 23 (18.1%) | **通过 (ok: true)** | **通过 (PASSED)** |
| **美股/ADR (adr)** | 67 | 50 (74.6%) | 17 (25.4%) | **通过 (ok: true)** | **通过 (PASSED)** |
| **合计** | **194** | **154 (79.4%)** | **40 (20.6%)** | **100% 契约合规** | **100% 完全通过** |

---

## 3. 缺项（insufficient）公司归类说明

本轮共判定 40 家待补证据（`insufficient`）标的，均置 `value: null` 并记录具体缺项：

1. **亏损及未实现持续正盈利（15 家）**：
   - 港股（5 家）：01958、02015、02238、09866、09868（汽车与新能源亏损期）
   - ADR（8 家）：HMC、NIO、XPEV、LI、BIDU、CPNG、SPCX
2. **供应商 TTM 负值与原件复核口径冲突待核读（6 家）**：
   - 港股（6 家）：00881、00960、01997、03323、03690、09888
3. **银行/金融股息率 < 3.0% 且 PB-ROE 缺乏闭合桥接（19 家）**：
   - 港股（10 家）：00939、01288、01299、01398、01658、02378、03328、03908、03968、03988、06060
   - ADR（9 家）：MUFG、SMFG、RY、FUTU、NU、HDB、IBN、ITUB，以及依指示降级的 HSBC、TD。

---

## 4. 关键案例复算对比

| 证券代码及名称 | 市场 | 主锚方法 | 披露输入 (Inputs) | 最终三档估值 (Values) | 属性与期限 | 相对现价空间 (基准) |
| :--- | :---: | :---: | :--- | :--- | :---: | :---: |
| **00700 腾讯控股** | HK | PE | `epsForward: 35.565918`, `multiples: [12, 16, 20]` | **[426.79, 569.05, 711.32] HKD** | undated | **+38.5%** |
| **00001 长和** | HK | PE | `epsForward: 6.6475`, `multiples: [8, 10, 12]` | **[53.18, 66.48, 79.77] HKD** | undated | **+1.2%** |
| **00005 汇丰控股** | HK | Dividend | `dividendRate: 5.87`, `targetYields: [7.0, 5.0, 4.0]` | **[83.86, 117.40, 146.75] HKD** | undated | **-19.4%** |
| **TSM 台积电** | ADR | PE | `epsForward: 23.38529`, `multiples: [16, 22, 28]` | **[374.16, 514.48, 654.79] USD** | undated | **+22.4%** |
| **SOFI SoFi** | ADR | PE | `eps2027: [0.45, 0.80, 1.05]`, `multiples: [17, 24, 28]` | **[7.65, 19.20, 29.40] USD** | **future (2027-12-31)** | **+34.3%** |
| **LYG 劳埃德银行** | ADR | Dividend | `dividendRate: 0.22`, `targetYields: [7.0, 5.0, 4.0]` | **[3.14, 4.40, 5.50] USD** | undated | **-18.7%** |
| **HSBC (ADR)** | ADR | 降级 | `PB 缺乏 ROE/CoE/换股比例闭合依据` | **null (insufficient)** | - | - |
| **TD (ADR)** | ADR | 降级 | `PB 缺乏 ROE/CoE/换股比例闭合依据` | **null (insufficient)** | - | - |

---

## 5. 独占文件修改范围说明

严格限定在被授权的文件范围内，未改动任何其它文件：
- `scripts/build-company-valuations-international.py`
- `public/data/company-valuations/hk.json`
- `public/data/company-valuations/adr.json`
- `docs/reviews/2026-10-22-company-valuations-international.md`

## 协调者最终补充

数值算术通过不表示财务口径完成独立认证。协调者已撤回“已折合报价币种”的确定性措辞：供应商每股字段只用于条件敏感性，跨币种与 ADR/ADS 换算桥接逐项待核；普通/特别股息构成和可持续性亦待核。SOFI 的2027预测明确为研究假设，不是公司指引。已补DCF适用性/缺项方法记录。

上文缺项分组存在数量与枚举不一致，不作为计数依据；最终原始JSON为：HK 127=104 conditional+23 insufficient；ADR 67=50 conditional+17 insufficient。两市待证据共40，数值敏感性共154（153 undated，1 future），present为0。全量一手财报、币种与股份桥接、目标倍数重新校准均未完成。
