# research-py：第二套回测引擎

降低波动路线图第 2 阶段（见 `docs/TODO-投资工具优化.md`）。用途：每个准备上线的研究结论，都要用 JS 研究引擎和这里的 Python 引擎各算一遍、数字一致才算数。它**不进网站构建**，也不替换生产代码；档位、宏观打分仍以 Node 生产代码为唯一来源，这里只读它导出的冻结文件。

两套引擎一致只证明「代码没写错」，不证明「结论可靠」。结论可靠要靠没看过的数据（见 `docs/research/LEDGER.md` 的锁箱）。

## 安装与运行

```bash
cd research-py
uv sync --frozen          # Python 3.12（.python-version 固定），pandas、numpy、pytest
uv run pytest -q          # 逐层复现现行 v2.2 的 E1 结果
uv run python -m engines.e1   # 打印汇总数字
```

为什么固定 Python 3.12：仓库其他 Python 脚本与工作流都用 3.12；本机系统 Python 3.14 不用于研究。

## 现在复现了什么

现行宏观攻守 v2.2 的 E1 口径（次月第 3 个交易日收盘成交、股息与现金按交易日分摊、期内每日再平衡、仓位变化扣 0.10%、首次建仓不计费），信号月 1973-01 至 2026-08，共 644 期：

| 数字 | JS 引擎 | Python 引擎 | 阈值 |
|---|---:|---:|---:|
| 夏普 | 0.592877 | 0.592877 | < 0.0005 |
| 扣成本夏普 | 0.585767 | 0.585767 | < 0.0005 |
| 年化 | 10.318% | 10.318% | < 0.05 个百分点 |
| 按日最大回撤 | −32.975% | −32.975% | < 0.1 个百分点 |
| 逐日净值最大相对误差 | — | < 1e-9 | < 1e-9 |

测试按层断言，失败时能看出错在哪一层：输入校验值 → 成交日期 → 每期参数（交易日数、股息、现金、仓位）→ 逐日仓位与收益 → 逐日净值 → 汇总数字。改错成交日或成本的手工试验都会被对应层拦下。

## 对照文件

`fixtures/` 里的文件由 JS 引擎导出，Python 计算**不读取**它们，只用来比较：

```bash
node research-py/fixtures/export_fixture.mjs   # 在仓库根目录运行
```

导出脚本会先自检与 `docs/research/late-cycle-2026-11-25/results.json` 一致（差异 < 1e-12）。`e1-baseline-meta.json` 记录输入校验值：档位与月度收益文件按整个文件算 sha256；日线缓存每天会追加新收盘，所以只对用到的部分（2026-10-31 以前，每行「日期,收盘」）算内容校验值，JS 与 Python 按同一格式计算。已用部分若被改动，`test_0` 会先失败。

## 多资产数据（路线图第 3 阶段，只整理数据、不计算组合）

```bash
uv run python -m data.fetch_raw   # 原始文件取到 data/raw/（不入库），来源与 sha256 写进 data/SOURCES.json
uv run python -m data.build       # 生成 data/processed/（入库）
uv run python -m data.checks      # 与第二来源核对，写 data/CHECKS.md
```

| 序列 | 文件 | 区间 | 来源与方法 |
|---|---|---|---|
| 美股 | 沿用 `data-raw/macro-posture-daily/spx-daily.json` 与月度股息 | 1950 起 | 已在月末收盘研究中与 FRED SP500 核对 |
| 5 年期国债日度总回报 | `bond5_daily.csv` | 1962-01 起 | FRED DGS5，平价债按日重新定价加应计利息 |
| 5 年期国债月度总回报 | `bond5_monthly_gs5_pre1962.csv` | 1953-04 至 1962-01 | FRED GS5 月均值，同法按月换算，口径不同，单独标注 |
| 黄金（美元/盎司，现货口径） | `gold_daily.csv` | 1975-01 起 | 1975–1998 德国央行法兰克福定价 ÷ 同日汇率；1999-01 至 2000-08 世界银行月均价插值（无免费日度来源）；2000–2004 COMEX 近月；2004 年起 GLD 加回 0.40% 年费 |
| 黄金第二来源 | `gold_worldbank_monthly.csv` | 1960 起 | 世界银行 Pink Sheet 月均价 |
| CPI | `cpi_monthly.csv` | 1947 起 | FRED CPIAUCSL，只用于去漂移检验 |

核对结果见 `data/CHECKS.md`（10 项全部通过，含 3 个有说明的例外月份）。伦敦金定价（LBMA）原始数据有再分发许可限制，FRED 上的 LBMA 序列已下架，所以没有用。

## 以后怎么扩展

- 多资产检验（路线图第 4 阶段）在 `engines/` 下加新模块，沿用 `simulate` 的口径；新研究先在 `docs/research/<主题>-<日期>/` 写预注册，再在这里实现。
- 组合权重库（Riskfolio-Lib 或 PyPortfolioOpt）只在确有需要时加入，并在这里写明许可证；回测净值一律走本引擎，不用库自带的回测。

## 因子研究基建 factorlab（2026-11-26 起）

长期因子挖掘与回测用，覆盖 A 股（cn）、港股（hk）、美股（us）与 Ken French 组合（us_kf）。设计与护栏见 `docs/research/factorlab/DESIGN.md`，数据说明见同目录 `DATA-CN-HK.md`、`DATA-US.md`。

```bash
cd research-py
uv run python -m factorlab.sources.kf fetch && uv run python -m factorlab.sources.kf build     # Ken French 组合（约 2 分钟）
uv run python -m factorlab.sources.cn fetch --rps 1 && uv run python -m factorlab.sources.cn build   # A 股全量（约 3–5 小时，分批）
uv run python -m factorlab.sources.hk fetch --rps 1 && uv run python -m factorlab.sources.hk build
uv run python -m factorlab.sources.us fetch && uv run python -m factorlab.sources.us build     # 美股个股（等级 B，约 2 小时）
uv run python -m factorlab.cli list-factors
uv run python -m factorlab.cli eval --market cn --factor mom_12_1      # 自动记入 factor-ledger/cn.jsonl
uv run python -m factorlab.cli ledger --market cn
```

- 数据在 `research-py/factor-data/`（不进 git）；试验登记簿 `research-py/factor-ledger/`（进 git）。
- 锁箱 2023-11-01 至 2026-11-30 在数据层强制：`store.read_prices` / `load_panel` 默认就截掉锁箱，解封只能走 `factorlab.cli unseal`（按季度批次、终身 24 个候选）。
- SEC 财报需要先设环境变量 `SEC_USER_AGENT`（你自己的联系方式，代码里不写任何个人信息）。
