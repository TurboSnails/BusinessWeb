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
#   缺市值时（美股数据源目前没有流通市值，港股早年也缺）：mcap_fallback='amount' 表示当日改用
#   「t 之前 amount_window 日成交额中位数」排序做同样的前 N / 剔除最小比例（流动性筛选），股价 ≥ 1 照旧；
#   实际每个调仓日用的是市值还是成交额，写在掩码的 attrs['size_screen'] 并由 evaluate 记进登记簿。
MARKET_DEFAULTS = {
    "cn": dict(min_amount=3e6, drop_small_pct=0.3, top_n_mcap=None, min_price=None),
    "hk": dict(min_amount=1e6, drop_small_pct=0.0, top_n_mcap=500, min_price=1.0),
    "us": dict(min_amount=1e6, drop_small_pct=0.0, top_n_mcap=500, min_price=1.0),
}
_FALLBACK = dict(min_amount=0.0, drop_small_pct=0.0, top_n_mcap=None, min_price=None)
MCAP_MIN_COVERAGE = 0.5   # 当日候选里有市值的比例低于此值 → 该日按成交额排序


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
    mcap_fallback: str | None = "amount"  # 缺市值的调仓日改用成交额中位数排序；None = 缺市值即剔除

    def resolved(self, market: str) -> "UniverseSpec":
        d = MARKET_DEFAULTS.get(market, _FALLBACK)
        return UniverseSpec(
            self.min_list_days,
            d["min_amount"] if self.min_amount is None else self.min_amount,
            self.amount_window,
            d["drop_small_pct"] if self.drop_small_pct is None else self.drop_small_pct,
            d["top_n_mcap"] if self.top_n_mcap == "default" else self.top_n_mcap,
            d["min_price"] if self.min_price == "default" else self.min_price,
            self.exclude_limit_up,
            self.mcap_fallback)

    def to_dict(self) -> dict:
        return asdict(self)


def bool_values(df: pd.DataFrame) -> np.ndarray:
    """可空布尔 / 浮点 0-1 / object 宽表 → numpy 布尔数组（空值视为 False）。不经 pandas 的可空布尔转换。"""
    dts = set(df.dtypes)
    if not dts:
        return np.zeros(df.shape, dtype=bool)
    if dts == {np.dtype(bool)}:
        return df.to_numpy(bool)
    if all(dt.kind == "f" for dt in dts):
        v = df.to_numpy(float)
        return (v != 0) & ~np.isnan(v)
    if all(isinstance(dt, pd.BooleanDtype) for dt in dts):
        return df.to_numpy(dtype=bool, na_value=False)
    v = df.to_numpy(object)
    try:  # True / False / None / NaN 的 object 数组：转浮点最快（pd.NA 等转不了的走下面的慢路径）
        f = v.astype(float)
        return (f != 0) & ~np.isnan(f)
    except (TypeError, ValueError):
        pass
    out = np.zeros(v.shape, dtype=bool)
    ok = ~pd.isna(v)
    out[ok] = v[ok].astype(bool)
    return out


def as_bool(df: pd.DataFrame) -> pd.DataFrame:
    """bool_values 的 DataFrame 版本（保留索引与列）。"""
    return pd.DataFrame(bool_values(df), index=df.index, columns=df.columns)


def rolling_median_at(frame: pd.DataFrame, dates, window: int = 20, min_periods: int | None = None,
                      columns=None) -> pd.DataFrame:
    """只在 dates 上算「t 之前（不含 t）window 行」的中位数（等价于 frame.shift(1).rolling(window,
    min_periods).median() 在这些日子的值，但只算需要的日子）。dates 不在 frame 索引里时按其前一行算。"""
    min_periods = max(1, window // 2) if min_periods is None else min_periods
    if columns is not None:
        frame = frame.reindex(columns=columns)
    a = frame.to_numpy(float)
    dates = pd.DatetimeIndex(dates)
    pos = frame.index.searchsorted(dates, side="left")
    out = np.full((len(dates), a.shape[1]), np.nan)
    for i, p in enumerate(pos):
        lo = max(0, p - window)
        if p <= lo:
            continue
        out[i] = _nanmedian0(a[lo:p], min_periods)
    return pd.DataFrame(out, index=dates, columns=frame.columns)


def _nanmedian0(block: np.ndarray, min_periods: int) -> np.ndarray:
    n = (~np.isnan(block)).sum(0)
    s = np.sort(block, axis=0)  # NaN 排在最后
    lo = np.take_along_axis(s, ((n - 1) // 2).clip(0)[None], 0)[0]
    hi = np.take_along_axis(s, (n // 2).clip(0)[None], 0)[0]
    return np.where(n >= min_periods, (lo + hi) / 2, np.nan)


class AdvCache:
    """「t 之前 window 日成交额中位数」按日惰性计算并缓存（股票池、滑点、容量、加权代理共用一份）。"""

    def __init__(self, amount: pd.DataFrame | None, window: int = 20, min_periods: int | None = None):
        self.amount = amount
        self.window = window
        self.min_periods = max(1, window // 2) if min_periods is None else min_periods
        self._a = None if amount is None else amount.to_numpy(float)
        self._cache: dict = {}

    @property
    def columns(self):
        return None if self.amount is None else self.amount.columns

    def row(self, date) -> np.ndarray | None:
        if self.amount is None:
            return None
        d = pd.Timestamp(date)
        if d not in self._cache:
            p = self.amount.index.searchsorted(d, side="left")
            lo = max(0, p - self.window)
            self._cache[d] = (np.full(self._a.shape[1], np.nan) if p <= lo
                              else _nanmedian0(self._a[lo:p], self.min_periods))
        return self._cache[d]

    def at(self, dates, columns=None) -> pd.DataFrame | None:
        if self.amount is None:
            return None
        dates = pd.DatetimeIndex(dates)
        df = pd.DataFrame(np.vstack([self.row(d) for d in dates]) if len(dates) else
                          np.empty((0, len(self.amount.columns))), index=dates, columns=self.amount.columns)
        return df if columns is None else df.reindex(columns=columns)


def _listing_start(panel: dict, codes: pd.Index, securities: pd.DataFrame | None) -> pd.Series:
    """每只证券的上市日：证券表 list_date 优先，缺失时用面板里第一个有价格的日子（保守）。"""
    c = panel["close_adj"].reindex(columns=codes)
    has = c.notna().to_numpy()
    any_ = has.any(axis=0)
    first = np.where(any_, c.index.to_numpy()[has.argmax(axis=0)], np.datetime64("NaT", "ns"))
    first_obs = pd.Series(pd.to_datetime(first), index=codes)
    start = pd.Series(pd.NaT, index=codes, dtype="datetime64[ns]")
    if securities is not None and "list_date" in securities:
        ld = securities.drop_duplicates("code").set_index("code")["list_date"]
        start = pd.to_datetime(ld.reindex(codes))
    return start.fillna(first_obs)


def _size_proxy(mcap: np.ndarray | None, adv: np.ndarray | None, mask: np.ndarray, fallback: str | None,
                need: str) -> tuple[np.ndarray, np.ndarray]:
    """每个调仓日的规模代理：有市值的候选比例 ≥ MCAP_MIN_COVERAGE 用市值，否则（允许时）用成交额中位数。
    返回（代理值，是否用了成交额 的每日标记）。"""
    n_d = mask.shape[0]
    use_amt = np.zeros(n_d, dtype=bool)
    if mcap is None:
        if fallback != "amount":
            raise ValueError(f"{need}需要 mcap_float 字段（或把 top_n_mcap / drop_small_pct 设为 None / 0）")
        use_amt[:] = True
    else:
        cand = mask.sum(1)
        cov = np.where(cand > 0, (mask & np.isfinite(mcap) & (mcap > 0)).sum(1) / np.maximum(cand, 1), 1.0)
        use_amt = (cov < MCAP_MIN_COVERAGE) & (fallback == "amount")
    if use_amt.any() and adv is None:
        raise ValueError(f"{need}缺市值，回退到成交额排序也需要 amount 字段")
    out = np.full(mask.shape, np.nan) if mcap is None else np.where(mcap > 0, mcap, np.nan)
    if use_amt.any():
        out[use_amt] = np.where(adv[use_amt] > 0, adv[use_amt], np.nan)
    return out, use_amt


def _rank_desc(x: np.ndarray) -> np.ndarray:
    """逐行从大到小的名次（1 起；NaN 为 NaN；并列按列顺序，与原 method='first' 一致）。"""
    return pd.DataFrame(x).rank(axis=1, ascending=False, method="first").to_numpy()


def build_universe(panel: dict, dates, market: str, securities: pd.DataFrame | None = None,
                   spec: UniverseSpec | None = None, adv: AdvCache | None = None) -> pd.DataFrame:
    """返回调仓日 × 代码 的布尔表。条件（全部满足才入池）：

    1. 截至当日已上市满 min_list_days 个交易日（交易日按面板计；上市日早于面板起点视为满足）；
    2. 未退市（delist_date 为空或晚于当日）；
    3. 当日有收盘价（close_adj 非空）；
    4. 未停牌（is_suspended 不为 True，且成交量不为 0）；
    5. t 之前（不含 t）amount_window 个交易日成交额中位数 ≥ min_amount（至少一半的日子有数据）；
    6. 不复权收盘价 ≥ min_price；
    7. exclude_limit_up=True 时剔除当日收盘封涨停的；
    8. 在以上通过者中：只留流通市值前 top_n_mcap，再剔除流通市值最小的 drop_small_pct（市值缺失的剔除）；
       当日市值覆盖不足时按 mcap_fallback 改用成交额中位数排序（见 MARKET_DEFAULTS 的说明）。
    返回的 DataFrame.attrs['size_screen'] = {'mcap': 用市值的调仓日数, 'amount': 用成交额的调仓日数}。
    """
    spec = (spec or UniverseSpec()).resolved(market)
    close = panel["close_adj"]
    days = trading_days(close)
    dates = pd.DatetimeIndex(dates)
    codes = close.columns
    mask = close.reindex(dates).notna().to_numpy()

    # 1. 上市天数
    start = _listing_start(panel, codes, securities)
    filled = pd.DatetimeIndex(start.fillna(days[-1] + pd.Timedelta(days=1)))
    start_pos = days.searchsorted(filled).astype(float)
    start_pos[(start < days[0]).to_numpy()] = -np.inf
    date_pos = days.searchsorted(dates)
    mask &= (date_pos[:, None] - start_pos[None, :]) >= spec.min_list_days

    # 2. 退市
    if securities is not None and "delist_date" in securities:
        dl = pd.to_datetime(securities.drop_duplicates("code").set_index("code")["delist_date"].reindex(codes))
        mask &= dl.isna().to_numpy()[None, :] | (dl.to_numpy()[None, :] > dates.to_numpy()[:, None])

    # 4. 停牌
    if "is_suspended" in panel:
        mask &= ~bool_values(panel["is_suspended"].reindex(index=dates, columns=codes))
    if "volume" in panel:
        mask &= ~(panel["volume"].reindex(index=dates, columns=codes).to_numpy(float) <= 0)

    # 5. 流动性（只在调仓日算 t 之前的成交额中位数）
    need_amt = bool(spec.min_amount) or ((spec.top_n_mcap or spec.drop_small_pct) and spec.mcap_fallback == "amount")
    med = None
    if "amount" in panel and need_amt:
        if adv is not None and adv.window == spec.amount_window and adv.min_periods == max(1, spec.amount_window // 2):
            med = adv.at(dates, codes).to_numpy(float)
        else:
            med = rolling_median_at(panel["amount"], dates, spec.amount_window, columns=codes).to_numpy(float)
    if spec.min_amount:
        if med is None:
            raise ValueError("股票池需要 amount 字段来做流动性筛选（或把 min_amount 设为 0）")
        mask &= med >= spec.min_amount

    # 6. 股价
    if spec.min_price:
        px = panel["close"] if "close" in panel else None
        if px is None:
            raise ValueError("min_price 需要不复权 close 字段")
        mask &= px.reindex(index=dates, columns=codes).to_numpy(float) >= spec.min_price

    # 7. 涨停买不进
    if spec.exclude_limit_up and "limit_up" in panel:
        mask &= ~bool_values(panel["limit_up"].reindex(index=dates, columns=codes))

    # 8. 规模（市值；缺市值的日子按成交额）
    screen = {"mcap": 0, "amount": 0}
    if spec.top_n_mcap or spec.drop_small_pct:
        mc = (panel["mcap_float"].reindex(index=dates, columns=codes).to_numpy(float)
              if "mcap_float" in panel else None)
        size, use_amt = _size_proxy(mc, med, mask, spec.mcap_fallback, "市值筛选")
        screen = {"mcap": int((~use_amt).sum()), "amount": int(use_amt.sum())}
        size = np.where(mask, size, np.nan)
        mask &= np.isfinite(size)
        if spec.top_n_mcap:
            mask &= _rank_desc(size) <= spec.top_n_mcap
            size = np.where(mask, size, np.nan)
        if spec.drop_small_pct:
            pct = pd.DataFrame(size).rank(axis=1, pct=True, method="first").to_numpy()
            mask &= pct > spec.drop_small_pct

    out = pd.DataFrame(mask.astype(bool), index=dates, columns=codes)
    out.attrs["size_screen"] = screen
    return out
