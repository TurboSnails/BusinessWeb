"""因子注册表：@factor 装饰器 + FACTORS 字典 + 参数哈希（登记簿用）。

因子函数签名：f(panel, dates, **params) -> DataFrame（行 = dates，列 = 代码）。
约定：dates 当日的因子值只能用该日收盘及以前的数据（compute_strict / check_no_lookahead 可验证）。
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

ALL_MARKETS = ("cn", "hk", "us")


@dataclass(frozen=True)
class FactorSpec:
    name: str
    func: Callable
    needs: tuple[str, ...]
    lookback: int                      # 需要的回看交易日数（含当日）
    markets: tuple[str, ...] = ALL_MARKETS
    doc: str = ""
    version: int = 1
    direction: int = 1                 # 事先假设的方向：+1 = 越大越好，-1 = 越小越好（选「前 20%」用）
    defaults: dict = field(default_factory=dict)

    def __call__(self, panel: dict, dates, **params) -> pd.DataFrame:
        missing = [f for f in self.needs if f not in panel]
        if missing:
            raise KeyError(f"因子 {self.name} 缺字段：{missing}")
        p = {**self.defaults, **params}
        out = self.func(panel, pd.DatetimeIndex(dates), **p)
        return out.reindex(pd.DatetimeIndex(dates))


FACTORS: dict[str, FactorSpec] = {}


def factor(name: str, needs, lookback: int, markets=ALL_MARKETS, doc: str = "", version: int = 1,
           direction: int = 1, **defaults):
    """注册因子。同名重复注册会报错（改定义请升 version 并换名或删旧定义）。"""

    def deco(fn: Callable) -> Callable:
        if name in FACTORS and FACTORS[name].func.__qualname__ != fn.__qualname__:
            raise ValueError(f"因子 {name} 已注册")
        FACTORS[name] = FactorSpec(name, fn, tuple(needs), int(lookback), tuple(markets),
                                   doc or (fn.__doc__ or "").strip(), int(version), int(direction),
                                   dict(defaults))
        return fn

    return deco


def get(name: str) -> FactorSpec:
    from . import factors  # noqa: F401  确保内置因子已注册

    if name not in FACTORS:
        raise KeyError(f"未注册的因子：{name}（已有：{sorted(FACTORS)}）")
    return FACTORS[name]


def _canon(obj):
    if isinstance(obj, dict):
        return {str(k): _canon(v) for k, v in sorted(obj.items(), key=lambda kv: str(kv[0]))}
    if isinstance(obj, (list, tuple)):
        return [_canon(v) for v in obj]
    if isinstance(obj, (np.integer, np.floating)):
        return obj.item()
    if isinstance(obj, pd.Timestamp):
        return obj.strftime("%Y-%m-%d")
    return obj


def params_hash(name: str, version: int, params: dict | None = None) -> str:
    """因子名 + 版本 + 参数 的稳定哈希（12 位）。同一写法哈希相同，便于在登记簿里数「不同写法」。"""
    payload = json.dumps(_canon({"name": name, "version": version, "params": params or {}}),
                         sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:12]


def compute_strict(spec: FactorSpec, panel: dict, dates, **params) -> pd.DataFrame:
    """逐个调仓日把面板截到当日（含）再计算：慢，但从构造上排除了用未来数据。用于核对。"""
    rows = []
    for d in pd.DatetimeIndex(dates):
        sub = {k: v.loc[:d] for k, v in panel.items()}
        rows.append(spec(sub, [d], **params).iloc[0].rename(d))
    return pd.DataFrame(rows).reindex(columns=panel["close_adj"].columns if "close_adj" in panel else None)


def check_no_lookahead(spec: FactorSpec, panel: dict, dates, n_check: int = 4, atol: float = 1e-10,
                       **params) -> bool:
    """抽 n_check 个调仓日比较「全量计算」与「截到当日计算」的结果；一致返回 True。"""
    dates = pd.DatetimeIndex(dates)
    pick = dates[np.linspace(0, len(dates) - 1, min(n_check, len(dates))).astype(int)]
    fast = spec(panel, dates, **params).loc[pick]
    slow = compute_strict(spec, panel, pick, **params).reindex(columns=fast.columns)
    a, b = fast.to_numpy(float), slow.to_numpy(float)
    same_nan = np.array_equal(np.isnan(a), np.isnan(b))
    return bool(same_nan and np.allclose(np.nan_to_num(a), np.nan_to_num(b), atol=atol, rtol=1e-9))
