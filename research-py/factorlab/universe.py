"""点时股票池：调仓日 × 代码 的布尔掩码，只用当日收盘及以前可得的信息。

证券表里只用 list_date / delist_date（带日期的字段）；name / status 是「现在」的信息，不得当历史用。
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from .calendar import trading_days

# 各市场默认值（DESIGN.md 第五节）。成交额门槛为名义值（当地货币），长历史上偏严 / 偏松，可改。
#   cn：剔除市值最小 30%；hk / us：流通市值前 500、股价 ≥ 1（已是大盘股，不再剔除最小 30%）。
MARKET_DEFAULTS = {
    "cn": dict(min_amount=3e6, drop_small_pct=0.3, top_n_mcap=None, min_price=None),
    "hk": dict(min_amount=1e6, drop_small_pct=0.0, top_n_mcap=500, min_price=1.0),
    "us": dict(min_amount=1e6, drop_small_pct=0.0, top_n_mcap=500, min_price=1.0),
}
_FALLBACK = dict(min_amount=0.0, drop_small_pct=0.0, top_n_mcap=None, min_price=None)


@dataclass(frozen=True)
class UniverseSpec:
    """股票池参数（写进登记簿）。None 的字段按市场默认补齐（resolved）。"""

    min_list_days: int = 120             # 上市满 N 个交易日
    min_amount: float | None = None      # t 之前 amount_window 日成交额中位数下限
    amount_window: int = 20
    drop_small_pct: float | None = None  # 剔除股票池内流通市值最小的比例
    top_n_mcap: int | None | str = "default"  # 只留流通市值前 N；None = 不限
    min_price: float | None | str = "default"  # 不复权收盘价下限（当地货币）
    exclude_limit_up: bool = False       # 调仓日收盘封涨停的剔除

    def resolved(self, market: str) -> "UniverseSpec":
        d = MARKET_DEFAULTS.get(market, _FALLBACK)
        return UniverseSpec(
            self.min_list_days,
            d["min_amount"] if self.min_amount is None else self.min_amount,
            self.amount_window,
            d["drop_small_pct"] if self.drop_small_pct is None else self.drop_small_pct,
            d["top_n_mcap"] if self.top_n_mcap == "default" else self.top_n_mcap,
            d["min_price"] if self.min_price == "default" else self.min_price,
            self.exclude_limit_up)

    def to_dict(self) -> dict:
        return asdict(self)


def as_bool(df: pd.DataFrame) -> pd.DataFrame:
    """可空布尔 / object 宽表 → 普通布尔（空值视为 False）。"""
    return df.astype("boolean").fillna(False).astype(bool)


def _listing_start(panel: dict, codes: pd.Index, securities: pd.DataFrame | None) -> pd.Series:
    """每只证券的上市日：证券表 list_date 优先，缺失时用面板里第一个有价格的日子（保守）。"""
    first_obs = panel["close_adj"].apply(lambda s: s.first_valid_index())
    start = pd.Series(pd.NaT, index=codes, dtype="datetime64[ns]")
    if securities is not None and "list_date" in securities:
        ld = securities.set_index("code")["list_date"]
        start = pd.to_datetime(ld.reindex(codes))
    return start.fillna(pd.to_datetime(first_obs.reindex(codes)))


def build_universe(panel: dict, dates, market: str, securities: pd.DataFrame | None = None,
                   spec: UniverseSpec | None = None) -> pd.DataFrame:
    """返回调仓日 × 代码 的布尔表。条件（全部满足才入池）：

    1. 截至当日已上市满 min_list_days 个交易日（交易日按面板计；上市日早于面板起点视为满足）；
    2. 未退市（delist_date 为空或晚于当日）；
    3. 当日有收盘价（close_adj 非空）；
    4. 未停牌（is_suspended 不为 True，且成交量不为 0）；
    5. t 之前（不含 t）amount_window 个交易日成交额中位数 ≥ min_amount（至少一半的日子有数据）；
    6. 不复权收盘价 ≥ min_price；
    7. exclude_limit_up=True 时剔除当日收盘封涨停的；
    8. 在以上通过者中：只留流通市值前 top_n_mcap，再剔除流通市值最小的 drop_small_pct（市值缺失的剔除）。
    """
    spec = (spec or UniverseSpec()).resolved(market)
    close = panel["close_adj"]
    days = trading_days(close)
    dates = pd.DatetimeIndex(dates)
    codes = close.columns
    mask = close.reindex(dates).notna()

    # 1. 上市天数
    start = _listing_start(panel, codes, securities)
    filled = pd.DatetimeIndex(start.fillna(days[-1] + pd.Timedelta(days=1)))
    start_pos = pd.Series(days.searchsorted(filled), index=codes).astype(float)
    start_pos[start < days[0]] = -np.inf
    date_pos = days.searchsorted(dates)
    listed_days = date_pos[:, None] - start_pos.values[None, :]
    mask &= listed_days >= spec.min_list_days

    # 2. 退市
    if securities is not None and "delist_date" in securities:
        dl = pd.to_datetime(securities.set_index("code")["delist_date"].reindex(codes))
        alive = dl.isna().values[None, :] | (dl.values[None, :] > dates.values[:, None])
        mask &= alive

    # 4. 停牌
    if "is_suspended" in panel:
        mask &= ~as_bool(panel["is_suspended"].reindex(index=dates, columns=codes))
    if "volume" in panel:
        mask &= ~(panel["volume"].reindex(index=dates, columns=codes) <= 0)

    # 5. 流动性
    if spec.min_amount and "amount" in panel:
        w = spec.amount_window
        med = panel["amount"].shift(1).rolling(w, min_periods=max(1, w // 2)).median()
        mask &= med.reindex(index=dates, columns=codes) >= spec.min_amount
    elif spec.min_amount:
        raise ValueError("股票池需要 amount 字段来做流动性筛选（或把 min_amount 设为 0）")

    # 6. 股价
    if spec.min_price:
        px = panel["close"] if "close" in panel else None
        if px is None:
            raise ValueError("min_price 需要不复权 close 字段")
        mask &= px.reindex(index=dates, columns=codes) >= spec.min_price

    # 7. 涨停买不进
    if spec.exclude_limit_up and "limit_up" in panel:
        mask &= ~as_bool(panel["limit_up"].reindex(index=dates, columns=codes))

    # 8. 市值
    if spec.top_n_mcap or spec.drop_small_pct:
        if "mcap_float" not in panel:
            raise ValueError("市值筛选需要 mcap_float 字段（或把 top_n_mcap / drop_small_pct 设为 None / 0）")
        mc = panel["mcap_float"].reindex(index=dates, columns=codes).where(mask)
        mask &= mc.notna()
        if spec.top_n_mcap:
            mask &= mc.rank(axis=1, ascending=False, method="first") <= spec.top_n_mcap
            mc = mc.where(mask)
        if spec.drop_small_pct:
            mask &= mc.rank(axis=1, pct=True, method="first") > spec.drop_small_pct

    return mask.astype(bool)
