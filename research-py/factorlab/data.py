"""受护栏约束的数据入口：引擎只通过这里读数据。

load_market 在 store.load_panel 之上按模式截断（探索 / 截面验证：锁箱起点以前；确认：锁箱终点以前；
前推：不截断），并补上复权开盘价 open_adj = open × close_adj / close。
store.read_* 默认也截掉锁箱（raw=False）；本模块按模式与解封凭证自行截断，所以传 raw=True。
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

import pandas as pd

from . import store
from .guard import Lockbox, UnsealToken, truncate_panel

DERIVED = {"open_adj": ("open", "close", "close_adj")}


def add_open_adj(panel: dict) -> dict:
    """open_adj = open × close_adj / close（复权因子 = close_adj / close）。缺字段时不加。"""
    if {"open", "close", "close_adj"} <= set(panel) and "open_adj" not in panel:
        c = panel["close"].reindex_like(panel["close_adj"])
        o = panel["open"].reindex_like(panel["close_adj"])
        panel = {**panel, "open_adj": o * panel["close_adj"] / c.where(c > 0)}
    return panel


def guard_panel(panel: dict, market: str, mode: str = "explore", token: UnsealToken | None = None,
                lockbox: Lockbox | None = None) -> dict:
    """对已有面板施加同样的截断（测试或外部传入面板时用）。"""
    lockbox = lockbox or Lockbox()
    return add_open_adj(truncate_panel(panel, lockbox.visible_end(market, mode, token)))


def snapshot_hash(market: str) -> str | None:
    """数据快照哈希：MANIFEST 里各文件 sha256 的哈希；没有 MANIFEST 时为 None。"""
    try:
        m = store.read_manifest(market)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return hashlib.sha256(json.dumps(m.get("sha256", {}), sort_keys=True).encode()).hexdigest()[:16]


@dataclass
class MarketData:
    panel: dict
    securities: pd.DataFrame | None
    snapshot: str | None
    visible_end: pd.Timestamp | None


def load_market(market: str, fields, mode: str = "explore", token: UnsealToken | None = None,
                lockbox: Lockbox | None = None, start=None) -> MarketData:
    """按模式读取面板与证券表。fields 可含派生字段 open_adj。"""
    lockbox = lockbox or Lockbox()
    end_ex = lockbox.visible_end(market, mode, token)
    raw = set()
    for f in fields:
        raw |= set(DERIVED.get(f, (f,)))
    panel = store.load_panel(market, sorted(raw), start=start,
                             end=None if end_ex is None else end_ex - pd.Timedelta(days=1), raw=True)
    panel = guard_panel(panel, market, mode, token, lockbox)
    try:
        sec = store.read_securities(market)
    except FileNotFoundError:
        sec = None
    return MarketData(panel, sec, snapshot_hash(market), end_ex)
