# 操作清单：A 股因子锁箱确认 2026Q4（L-038）

给 12 月上旬执行人。预注册：`PREREG.md`（提交 `001087bd`）。锁箱 cn：`2023-11-01`–`2026-11-30`。候选 3 个：`cn_sue`（K1，判 `tmu_cap`）、`cn_sur`（K2，判 `tmu_cap`）、`turnover_vol_20d`（K3，判 `tmu_ew`）。

工作目录一律：

```bash
cd /Users/hassan/WorkSpace/workspace/gupiaoWS/BusinessWeb/research-py
```

---

## 0. 不可回头点（先看）

| 步骤 | 可回头？ |
|---|---|
| 1–3 数据核验与补行情 | 可以重做 |
| **4 解封 `unseal`** | **不可回头**：批次、预注册、候选名额永久计入 `factor-ledger/unseals.json` |
| 5 每个候选 `confirm` | 每个候选只能成功一次；失败（error）可再试，成功不可再跑 |
| 6–7 Holm / 更新文档 | 可以重算、重写 |

解封前必须人工口头确认：「数据包哈希 OK、源码未改、要解封的就是这 3 个」。

---

## 1. 确认机器与数据包哈希

**命令：**

```bash
uv run python -m factorlab.datapack status
```

**预期：** 末行 `结论：全部 OK`；`[预注册冻结的 sha256]` 里每一行 `OK`（含 `factor-data/cn/fin_pit.parquet`、`fundamentals_cn.py`、`factors/surprise.py`、`factors/price2.py`）。退出码 `0`。

**失败了怎么办：**

- `fin_pit.parquet` / 其它冻结文件 `MISMATCH`：**立刻停**。本机若是重新 `fetch-all` 下的数据，字节会与预注册不一致。去**原机器**做确认，或把原机器打好的包解过来：

```bash
uv run python -m factorlab.datapack unpack /path/to/pack.tar --force
uv run python -m factorlab.datapack status   # 再确认全部 OK
```

- `MISSING`：缺文件，先补齐或 unpack，不要解封。
- 只有 MANIFEST 价格哈希因增量更新变化、且**预注册冻结列表仍全 OK**（尤其 `fin_pit`）：可以继续（确认时本来就要补价格、不重建财报）。

**`--quick`：** 跳过 MANIFEST 内 sha256，但仍核对预注册冻结项。正式确认不要用 `--quick` 当最终结论。

---

## 2. 核对 PREREG 冻结源码（status 已覆盖的）

`datapack status` 已按 PREREG 正文里的 `` `路径` sha256 `64位` `` 核对：

- `research-py/factorlab/fundamentals_cn.py`
- `research-py/factorlab/factors/surprise.py`
- `research-py/factorlab/factors/price2.py`
- `factor-data/cn/fin_pit.parquet`

另：因子函数短哈希（12 位）由引擎 `candidate_spec` 覆盖，确认前再跑：

```bash
uv run python -m factorlab.forward status --market cn
```

**预期：** `哈希核对 OK（与 PREREG 冻结值一致）`。

**失败：** 有人改了因子源码 / 默认口径 → **不要解封**，先对齐提交 `001087bd` 时的代码。

引擎 `evaluate.py` / `backtest.py` 也按「本提交时的版本」冻结（PREREG 正文）；status 不扫它们——用 `git rev-parse HEAD` / `git log -1 -- evaluate.py backtest.py` 人工确认未在预注册之后改口径。

---

## 3. 增量补行情到锁箱结束后第一个交易日

**目标：** 日线价格覆盖到 **2026-11-30 之后的第一个交易日**；**绝不重建** `fin_pit.parquet`。

**命令（同事模块，以实际 `--help` 为准）：**

```bash
uv run python -m factorlab.sources.cn_update --help
# 典型（实现完成后）：
uv run python -m factorlab.sources.cn_update
# 或：uv run python -m factorlab.sources.cn_update --until 2026-12-01
```

> 写本清单时 `factorlab.sources.cn_update` 可能尚未合入；若 `ModuleNotFoundError`，等该任务完成后再做本步，**不要**用 `cn fetch --refresh` 全量重下（会动财报相关流程、耗时长，且哈希会漂）。

**补完后：**

```bash
uv run python -m factorlab.datapack status
```

**预期：** `fin_pit.parquet` 仍为 `OK`（sha256 未变）；价格覆盖越过 2026-11-30。

**失败：** fin_pit 变了 → 停，从原包 `unpack --force` 恢复后再只补价格。

---

## 4. 解封 2026Q4 批次（不可回头）

人工确认步骤 1–3 通过后：

```bash
uv run python -m factorlab.cli unseal \
  --market cn \
  --batch 2026Q4-cn \
  --prereg 001087bd \
  --prereg 24ce2039 \
  --candidate cn_sue \
  --candidate cn_sur \
  --candidate turnover_vol_20d \
  --candidate cn_multi4 \
  --execution open
```

**参数说明（对照 `cli.py`）：**

| 参数 | 值 |
|---|---|
| `--market` | `cn` |
| `--batch` | `2026Q4-cn`（批次号，勿与已有批次重复） |
| `--prereg` | `001087bd`（L-038）与 `24ce2039`（L-043，`PREREG-L043.md`）两个都要传 |
| `--candidate` | 四个因子名各一次（L-043 新增 `cn_multi4`） |
| `--execution` | `open`（默认；与预注册口径一致，勿改） |
| `--note` | 可选 |

`unseal` 会用默认口径调用 `candidate_spec` 冻结（源码/参数/配置哈希）。非默认口径不能靠本 CLI，须在 Python 里自建候选（本批不需要）。

**预期：** 打印 `已解封 cn 批次 2026Q4-cn：候选 [...]`；`factor-ledger/unseals.json` 多一条。

**失败了怎么办：**

- 预注册提交无效 / 文件未列全候选 → 检查是否在含 `PREREG` 的提交上、名字是否写对。
- 批次或预注册已用过 / 同季已解封 / 超预算 → **不要换名字硬解**；升级找维护者。
- 解封成功后再发现数据错了：锁箱已打开，只能在文档里诚实记录，不能「当没发生」。

---

## 5. 每个候选只确认一次

```bash
uv run python -m factorlab.cli eval --market cn --factor cn_sue --mode confirm --batch 2026Q4-cn --json ../docs/research/factorlab-confirm-2026Q4/confirm-cn_sue.json
uv run python -m factorlab.cli eval --market cn --factor cn_sur --mode confirm --batch 2026Q4-cn --json ../docs/research/factorlab-confirm-2026Q4/confirm-cn_sur.json
uv run python -m factorlab.cli eval --market cn --factor turnover_vol_20d --mode confirm --batch 2026Q4-cn --json ../docs/research/factorlab-confirm-2026Q4/confirm-turnover_vol_20d.json
uv run python -m factorlab.cli eval --market cn --factor cn_multi4 --mode confirm --batch 2026Q4-cn --json ../docs/research/factorlab-confirm-2026Q4/confirm-cn_multi4.json
```

**预期：** Markdown 报告含 RankIC / tmu_cap / tmu_ew / NW t；JSON 落盘；登记簿 `mode=confirm` `status=ok`。

**失败：**

- `已确认过一次` → 不要再跑；用已有 JSON / 登记簿。
- 哈希与解封冻结不一致 → 代码或口径漂了，停。
- `status=error`（数据/股票池）→ 修好后**可以**再确认（error 不占「一次」）。

记录 K1/K2 的 `tmu_cap_mean` / `tmu_cap_t_nw` / `p_tmu`，K3 的 `tmu_ew_mean` / `tmu_ew_t_nw`（K3 判定用等权；`p_tmu` 仍是主口径单边 p，Holm 时对 K3 用 `tmu_ew` 的 NW t 转单边 p，见下一步）。

---

## 6. 批内 Holm + 三档判定

**L-043 补充：** K1–K3 仍按 L-038「批内 3 个」做 Holm；K4 按整批 4 个（K1–K4）做 Holm（更严）。解封前另核对 `PREREG-L043.md` 列出的文件哈希：`factors/composite.py`、`factors/composite_r8.py`、`factors/fundamental_cn.py`、`factor-data/cn/shares_pit.parquet`；`shares_pit.parquet` 与 `fin_pit.parquet` 一样不重建。

PREREG 门槛（小数）：

| 候选 | ½·m* |
|---|---|
| K1 cn_sue | 0.00137（+0.137%/月） |
| K2 cn_sur | 0.00153 |
| K3 turnover_vol_20d | 0.00226 |
| K4 cn_multi4（L-043，判 `tmu_ew`） | 0.00305 |

规则：

1. 均值 ≥ ½·m* **且** 批内 Holm 校正后单边 p < 0.05 → **通过**
2. 均值 ≥ ½·m* 但 Holm 不显著 → **方向一致、证据不足**
3. 均值 < ½·m* → **不通过**

**命令（读登记簿；也可用 `--mean` / `--p` 手填）：**

```bash
uv run python -m factorlab.forward holm --market cn --batch 2026Q4-cn \
  --json ../docs/research/factorlab-confirm-2026Q4/holm.json
```

若 K3 要用等权 t 的 p，手算后覆盖，例如：

```bash
uv run python -m factorlab.forward holm --market cn --batch 2026Q4-cn \
  --mean cn_sue=... --mean cn_sur=... --mean turnover_vol_20d=... \
  --p cn_sue=... --p cn_sur=... --p turnover_vol_20d=... \
  --json ../docs/research/factorlab-confirm-2026Q4/holm.json
```

单边 p（标准正态近似，与引擎 `p_tmu` 一致）：`p = 1 - Φ(NW_t)`。Holm：对批内 p 排序后逐步乘以剩余个数，见 `guard.holm`。

---

## 7. 更新 LEDGER、站点

1. 编辑 `docs/research/LEDGER.md` 的 **L-038** 结论列：写入三档结果与关键数字（均值、Holm p）。
2. 导出因子实验室页：

```bash
uv run python -m factorlab.export_site
```

预期：打印 `已写 public/data/factorlab.json：...`。

3. 若站点有「更新说明 / changelog」类文档，按仓库惯例补一条（指向 L-038 与本目录 confirm/holm JSON）。**不要**把锁箱期收益序列贴进网站。

---

## 解封后的前推（本批不论通过与否）

从 **2026-12** 起每月：

```bash
uv run python -m factorlab.sources.cn_update          # 补行情；--help 为准
uv run python -m factorlab.forward run --market cn    # 追加冻结行 → forward.json
uv run python -m factorlab.forward status --market cn
```

- 已写入的月份**冻结**；改旧行会拒绝退出。
- 累计 ≥ 24 期且判定口径 NW t < −1 → 该候选撤下（`withdrawn: true`）。
- `--dry-run` 只打印不写文件。

---

## 命令速查（均已对照当前代码）

| 目的 | 命令 |
|---|---|
| 数据 / 冻结哈希 | `uv run python -m factorlab.datapack status` |
| 解包 | `uv run python -m factorlab.datapack unpack <tar> [--force]` |
| 增量行情 | `uv run python -m factorlab.sources.cn_update`（实现中） |
| 解封 | `uv run python -m factorlab.cli unseal --market cn --batch 2026Q4-cn --prereg 001087bd --prereg 24ce2039 --candidate ...`（四个候选） |
| 确认 | `uv run python -m factorlab.cli eval --market cn --factor F --mode confirm --batch 2026Q4-cn` |
| Holm 三档 | `uv run python -m factorlab.forward holm --market cn --batch 2026Q4-cn` |
| 前推 | `uv run python -m factorlab.forward run --market cn` |
| 站点 | `uv run python -m factorlab.export_site` |

---

## 附：港股 2026Q4 批次（L-045，`PREREG-L045-hk.md`，提交 `6dc801f9`）

港股与 A 股分属不同市场，各自一季一批，互不影响。港股没有增量更新：

```bash
uv run python -m factorlab.sources.hk fetch --refresh     # 全量重下日线（数小时）
uv run python -m factorlab.sources.hk build
uv run python -m factorlab.datapack status                 # PREREG-L045-hk.md 冻结项须全部 OK（fin_pit 不重建）
uv run python -m factorlab.cli unseal --market hk --batch 2026Q4-hk --prereg 6dc801f9 --candidate hk_vqs52 --execution open
uv run python -m factorlab.cli eval --market hk --factor hk_vqs52 --mode confirm --batch 2026Q4-hk --json ../docs/research/factorlab-confirm-2026Q4/confirm-hk_vqs52.json
```

判定：`tmu_ew` 均值 ≥ 0.00268 且单边 p < 0.05 → 通过（仍只进「研究中」，等级 B）；均值 ≥ 0.00268 不显著 → 方向一致、证据不足；否则不通过。

