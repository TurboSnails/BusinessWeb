"""因子研究基建的数据约定（所有数据源与引擎共用，改动需同时改各方）。

存储布局（根目录 = 环境变量 FACTORLAB_DATA，默认 research-py/factor-data/，不进 git）：

    {root}/{market}/securities.parquet   证券表，一行一只证券（含已退市）
    {root}/{market}/prices.parquet       日线长表，一行 = 一只证券一个交易日
    {root}/{market}/raw/...              数据源原始缓存（各数据源自定，可断点续传）
    {root}/{market}/MANIFEST.json        数据源、下载时间、行数、sha256、覆盖区间、幸存者偏差等级

market 取值：'cn'（A 股）、'hk'（港股）、'us'（美股）。另有组合级数据集 'us_kf'（Ken French 组合），
格式见 KF_COLUMNS。

约定：
- 日期一律为交易所当地日期，pandas datetime64[ns]（无时区）。
- 价格以当地货币计；close_adj 为后复权收盘（含分红再投资的总收益口径；数据源只有前复权时须换算成
  「最新价不变、历史按复权因子回推」以外的、可连乘的口径，并在 MANIFEST 写明）。
- 收益只能用 close_adj 计算：ret_t = close_adj_t / close_adj_{t-1} - 1。
- 缺失用 NaN，不用 0；停牌日不应有行（或 volume == 0 且 is_suspended = True，二选一，在 MANIFEST 写明）。
- 任何「事后才知道」的字段（例如当前名称、当前行业、当前是否 ST）都不能当成历史值使用；
  只有带生效日期的字段才能进入 prices 或单独的点时（point-in-time）表。
"""

from __future__ import annotations

from dataclasses import dataclass

MARKETS = ("cn", "hk", "us")

# 证券表：一行一只证券
SECURITIES_COLUMNS: dict[str, str] = {
    "code": "string",          # 市场内唯一代码，A 股 6 位（600000），港股 5 位（00700），美股 ticker（AAPL）
    "name": "string",          # 最新名称（只作展示，不得作为历史信息使用）
    "market": "string",        # cn / hk / us
    "exchange": "string",      # SSE / SZSE / BSE / HKEX / NASDAQ / NYSE / AMEX ...
    "board": "string",         # 主板 / 创业板 / 科创板 / 北交所 / GEM ...（可空）
    "list_date": "datetime64[ns]",    # 上市日（可空）
    "delist_date": "datetime64[ns]",  # 退市日（仍上市为 NaT）
    "status": "string",        # listed / delisted / unknown
    "currency": "string",      # CNY / HKD / USD
    "source": "string",        # 数据源标识
}

# 日线长表：一行 = 一只证券一个交易日
PRICES_COLUMNS: dict[str, str] = {
    "date": "datetime64[ns]",
    "code": "string",
    "open": "float64",         # 不复权
    "high": "float64",
    "low": "float64",
    "close": "float64",        # 不复权收盘
    "close_adj": "float64",    # 后复权收盘（可连乘的总收益口径）
    "volume": "float64",       # 股
    "amount": "float64",       # 成交额（当地货币）
    "turnover": "float64",     # 换手率，小数（0.0123 = 1.23%），可空
    "mcap_float": "float64",   # 流通市值（当地货币），可空；A 股可由 amount / turnover 近似，须在 MANIFEST 说明
    "mcap_total": "float64",   # 总市值，可空
    "limit_up": "boolean",     # 当日收盘封涨停（买不进），可空（非 A 股为空）
    "limit_down": "boolean",   # 当日收盘封跌停（卖不出），可空
    "is_suspended": "boolean", # 停牌，可空
}

# Ken French 组合数据集（market = 'us_kf'）：长表
KF_COLUMNS: dict[str, str] = {
    "date": "datetime64[ns]",  # 月末
    "dataset": "string",       # 例如 Portfolios_Formed_on_ME
    "portfolio": "string",     # 例如 Lo 10 / Hi 10 / SMALL LoBM
    "weighting": "string",     # vw / ew
    "ret": "float64",          # 月收益，小数
}

# 幸存者偏差等级：写进 MANIFEST 的 survivorship 字段
SURVIVORSHIP = {
    "A": "含已退市证券，基本无幸存者偏差",
    "B": "只含当前上市证券，有幸存者偏差：结论必须注明，不能单独据此采用",
    "C": "组合级数据（如 Ken French），由数据提供方处理退市，可视同 A",
}


@dataclass(frozen=True)
class Manifest:
    market: str
    source: str
    survivorship: str          # A / B / C
    downloaded_at: str         # ISO 时间（UTC）
    coverage: tuple[str, str]  # 起止日期
    rows: int
    securities: int
    sha256: dict[str, str]     # 文件名 → sha256
    notes: str = ""


def validate_frame(df, columns: dict[str, str], name: str) -> list[str]:
    """返回问题列表（空列表 = 通过）。只检查列是否齐全与关键约束，不改数据。"""
    problems: list[str] = []
    missing = [c for c in columns if c not in df.columns]
    if missing:
        problems.append(f"{name} 缺列：{missing}")
        return problems
    if "date" in columns and df["date"].isna().any():
        problems.append(f"{name} 有空日期")
    if {"date", "code"} <= set(columns) and df.duplicated(["date", "code"]).any():
        problems.append(f"{name} 有重复的 (date, code)")
    if "close_adj" in columns:
        bad = (df["close_adj"] <= 0).sum()
        if bad:
            problems.append(f"{name} 有 {int(bad)} 行 close_adj ≤ 0")
    return problems
