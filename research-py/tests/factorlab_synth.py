"""factorlab 测试用的合成市场（只用随机数，不联网）。

- n 只股票 × n_years 年工作日；日收益 = 漂移 + β·市场 + b·signal_{t-1} + 噪声；
- signal 是可观测字段（AR(1)，φ = 0.99），用来检验「植入的信号能被找回」；
- 部分股票晚上市、部分退市（证券表带 list_date / delist_date）、随机停牌（当日无行）；
- 复权因子 k（close = close_adj / k）、开盘价按隔夜 / 日内拆分；涨跌停按 ±9.9% 标记。
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd
import pytest


@lru_cache(maxsize=4)
def make_market(n: int = 200, n_years: int = 8, seed: int = 7, start: str = "2012-01-02", b: float = 0.001):
    rng = np.random.default_rng(seed)
    days = pd.bdate_range(start, periods=252 * n_years)
    T = len(days)
    codes = [f"{600000 + i:06d}" for i in range(n)]
    phi = 0.99
    s = np.zeros((T, n))
    s[0] = rng.standard_normal(n)
    eps = rng.standard_normal((T, n)) * np.sqrt(1 - phi ** 2)
    for t in range(1, T):
        s[t] = phi * s[t - 1] + eps[t]
    mkt = rng.standard_normal(T) * 0.01
    ret = 0.0002 + mkt[:, None] + b * np.vstack([np.zeros((1, n)), s[:-1]]) + 0.02 * rng.standard_normal((T, n))
    ret = np.clip(ret, -0.3, 0.3)
    close_adj = 10 * np.cumprod(1 + ret, axis=0)
    k = rng.uniform(0.5, 2.0, n)
    close = close_adj / k
    prev = np.vstack([close_adj[:1] / (1 + ret[:1]), close_adj[:-1]])
    open_adj = prev * (1 + ret) ** 0.4
    open_ = open_adj / k
    wig = np.abs(rng.standard_normal((T, n))) * 0.005
    high = np.maximum(open_, close) * (1 + wig)
    low = np.minimum(open_, close) * (1 - wig)
    shares = np.exp(rng.normal(np.log(5e8), 0.8, n))
    mcap = close * shares[None, :]
    amount = mcap * np.exp(rng.normal(np.log(0.01), 0.3, (T, n)))
    volume = amount / close
    turnover = amount / mcap

    present = np.ones((T, n), dtype=bool)
    list_date = pd.Series([days[0] - pd.Timedelta(days=1000)] * n, index=codes)
    delist_date = pd.Series(pd.NaT, index=codes, dtype="datetime64[ns]")
    late = rng.choice(n, 20, replace=False)
    for j in late:
        i0 = int(rng.integers(100, T // 2))
        present[:i0, j] = False
        list_date.iloc[j] = days[i0]
    rest = np.setdiff1d(np.arange(n), late)
    for j in rng.choice(rest, 15, replace=False):
        i1 = int(rng.integers(T // 3, T - 50))
        present[i1:, j] = False
        delist_date.iloc[j] = days[i1]
    susp = np.zeros((T, n), dtype=bool)
    for _ in range(60):
        j, i0 = int(rng.integers(n)), int(rng.integers(T - 30))
        susp[i0:i0 + int(rng.integers(1, 15)), j] = True
    present &= ~susp

    def wide(x):
        return pd.DataFrame(np.where(present, x, np.nan), index=days, columns=codes)

    panel = {"close_adj": wide(close_adj), "close": wide(close), "open": wide(open_), "high": wide(high),
             "low": wide(low), "volume": wide(volume), "amount": wide(amount), "turnover": wide(turnover),
             "mcap_float": wide(mcap), "signal": wide(s)}
    lu, ld = ret >= 0.099, ret <= -0.099
    panel["limit_up"] = pd.DataFrame(lu, index=days, columns=codes).where(present)
    panel["limit_down"] = pd.DataFrame(ld, index=days, columns=codes).where(present)
    panel["is_suspended"] = pd.DataFrame(False, index=days, columns=codes).where(present)
    sec = pd.DataFrame({"code": codes, "name": codes, "market": "cn", "exchange": "SSE", "board": "主板",
                        "list_date": list_date.values, "delist_date": delist_date.values,
                        "status": np.where(delist_date.notna(), "delisted", "listed"), "currency": "CNY",
                        "source": "synthetic"})
    return panel, sec


def market(**kw):
    """返回可修改的副本。"""
    panel, sec = make_market(**kw)
    return {k: v.copy() for k, v in panel.items()}, sec.copy()


def to_long(panel: dict) -> pd.DataFrame:
    fields = [f for f in panel if f != "signal"]
    long = pd.concat({f: panel[f].stack(future_stack=True) for f in fields}, axis=1)
    long.index.names = ["date", "code"]
    long = long.reset_index()
    return long[long["close_adj"].notna()]


@pytest.fixture(autouse=True)
def tmp_ledger(tmp_path, monkeypatch):
    """每个测试用临时登记簿，绝不写真实的 factor-ledger/。"""
    d = tmp_path / "ledger"
    monkeypatch.setenv("FACTORLAB_LEDGER", str(d))
    return d
