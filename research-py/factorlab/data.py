"""受护栏约束的数据入口：引擎只通过这里读数据。

load_market 在 store.load_panel 之上按模式截断并补上复权开盘价 open_adj = open × close_adj / close：
- explore / validate：锁箱起点以前，且**只返回**该层的证券（sha256(code) 分 70% / 30%）；
- confirm：锁箱终点（含）以前，全部证券，须有效解封凭证；
- forward：须给出已核验的预注册提交；有本市场有效解封凭证时全部可见，否则删掉锁箱区间的行（只给锁箱前与
  锁箱后），并记一条 data_access 事件。
证券表同样按可见上界删改：上市日不早于可见上界的行删掉；退市日不早于可见上界（或落在被删区间）的改为空、
状态改为 listed——否则证券表会泄露锁箱期谁退市了。
测试钩子启用时（guard.set_test_overrides）且 store 指向仓库数据目录：confirm / forward 拒绝，其他模式
一律截在包内锁箱起点以前（换掉锁箱配置也看不到仓库里的锁箱数据）。
store.read_* 默认也截掉锁箱（raw=False）；本模块按模式与解封凭证自行截断，所以传 raw=True。
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

import pandas as pd

from . import guard, store
from .guard import Lockbox, TrialLedger, UnsealToken, split_codes, truncate_panel, verify_prereg

DERIVED = {"open_adj": ("open", "close", "close_adj")}

# 不在日线 prices.parquet 里、按可见范围现算的字段：market → 模块（须有 PROVIDES、NEEDS、available()、
# snapshot()、panel_fields(fields, panel, end_ex, hidden)）。美股：SEC 点时基本面与「股本 × 不复权价」市值
# （prices.parquet 的 mcap_float / mcap_total / turnover 全空，改由这里提供），见 fundamentals_us.py。
# A 股：cn_fin 点时财报（fin_pit.parquet）→ 月末 TTM / 平均 / 同比等字段（fin_*），见 fundamentals_cn.py。
EXTRA_PROVIDERS = {"us": "factorlab.fundamentals_us", "cn": "factorlab.fundamentals_cn"}


def extra_provider(market: str):
    """该市场的额外字段提供方；没有配置或数据未构建（例如测试用的临时数据目录）时为 None。"""
    name = EXTRA_PROVIDERS.get(market)
    if not name:
        return None
    import importlib

    mod = importlib.import_module(name)
    return mod if mod.available() else None


def has_field(market: str, field: str) -> bool:
    """该市场能否读到 field：日线 prices.parquet 里有这一列，或额外提供方提供，或是派生字段。"""
    if field in DERIVED:
        return all(has_field(market, f) for f in DERIVED[field])
    prov = extra_provider(market)
    if prov is not None and field in prov.PROVIDES:
        return True
    import pyarrow.parquet as pq

    try:
        return field in set(pq.read_schema(store.market_dir(market) / "prices.parquet").names)
    except OSError:
        return False


def add_open_adj(panel: dict) -> dict:
    """open_adj = open × close_adj / close（复权因子 = close_adj / close）。缺字段时不加。"""
    if {"open", "close", "close_adj"} <= set(panel) and "open_adj" not in panel:
        c = panel["close"].reindex_like(panel["close_adj"])
        o = panel["open"].reindex_like(panel["close_adj"])
        panel = {**panel, "open_adj": o * panel["close_adj"] / c.where(c > 0)}
    return panel


def window(market: str, mode: str = "explore", token: UnsealToken | None = None, prereg: str | None = None,
           repo=None, lockbox: Lockbox | None = None) -> tuple[pd.Timestamp | None, tuple | None]:
    """该模式下的（可见上界（不含），被删区间）。forward 先核验预注册提交。"""
    lockbox = lockbox or Lockbox()
    prereg_ok = False
    if mode == "forward":
        if not prereg:
            raise PermissionError("forward 需要已提交的预注册（prereg）")
        verify_prereg(prereg, repo)
        prereg_ok = True
    return lockbox.window(market, mode, token, prereg_ok)


def restrict_codes(panel: dict, mode: str, frac: float) -> dict:
    """explore / validate 只留本层证券（70% / 30%）；其他模式不变。"""
    if mode not in ("explore", "validate") or "close_adj" not in panel:
        return panel
    keep = split_codes(panel["close_adj"].columns, mode, frac)
    return {k: v.loc[:, v.columns.isin(keep)] for k, v in panel.items()}


def guard_securities(sec: pd.DataFrame | None, mode: str, end_ex: pd.Timestamp | None, hidden: tuple | None,
                     frac: float) -> pd.DataFrame | None:
    """证券表按可见范围删改（见模块说明），explore / validate 只留本层证券。"""
    if sec is None:
        return None
    s = sec.copy()
    if mode in ("explore", "validate") and "code" in s:
        s = s[s["code"].isin(split_codes(s["code"], mode, frac))]
    ld = pd.to_datetime(s["list_date"]) if "list_date" in s else None
    dl = pd.to_datetime(s["delist_date"]) if "delist_date" in s else None
    if end_ex is not None and ld is not None:
        s, ld = s[~(ld >= end_ex)], ld[~(ld >= end_ex)]
        dl = None if dl is None else dl.loc[s.index]
    if dl is not None:
        cut = pd.Series(False, index=s.index)
        if end_ex is not None:
            cut |= dl >= end_ex
        if hidden is not None:
            cut |= (dl >= hidden[0]) & (dl < hidden[1])
        if cut.any():
            s.loc[cut, "delist_date"] = pd.NaT
            if "status" in s:
                s.loc[cut, "status"] = "listed"
    return s.reset_index(drop=True)


def guard_panel(panel: dict, market: str, mode: str = "explore", token: UnsealToken | None = None,
                prereg: str | None = None, repo=None) -> dict:
    """对调用方传入的面板施加同样的截断与截面留出（测试或外部面板用）。"""
    lb = Lockbox()
    end_ex, hidden = window(market, mode, token, prereg, repo, lb)
    return add_open_adj(restrict_codes(truncate_panel(panel, end_ex, hidden), mode, lb.explore_frac))


def snapshot_hash(market: str) -> str | None:
    """数据快照哈希：MANIFEST 里各文件 sha256 的哈希；没有 MANIFEST 时为 None。"""
    try:
        m = store.read_manifest(market)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return hashlib.sha256(json.dumps(m.get("sha256", {}), sort_keys=True).encode()).hexdigest()[:16]


def repo_data() -> bool:
    """store 是否指向仓库数据目录（research-py/factor-data/，而不是测试用的临时目录）。"""
    return store.root().resolve() == store.DEFAULT_ROOT.resolve()


@dataclass
class MarketData:
    panel: dict
    securities: pd.DataFrame | None
    snapshot: str | None
    visible_end: pd.Timestamp | None
    hidden: tuple | None = None


def load_market(market: str, fields, mode: str = "explore", token: UnsealToken | None = None,
                prereg: str | None = None, repo=None, start=None, log: bool = True) -> MarketData:
    """按模式读取面板与证券表。fields 可含派生字段 open_adj。"""
    lb = Lockbox()
    if guard.overridden() and repo_data():
        # 测试钩子下不读仓库数据目录里的锁箱数据：confirm / forward 直接拒绝，其他模式截在包内锁箱起点以前
        if mode in ("confirm", "forward"):
            raise PermissionError("测试钩子（set_test_overrides）启用时不能从仓库数据做 confirm / forward")
    end_ex, hidden = window(market, mode, token, prereg, repo, lb)
    if guard.overridden() and repo_data():
        cut = store.lockbox_start(market)
        if cut is not None:
            end_ex = cut if end_ex is None else min(end_ex, cut)
    prov = extra_provider(market)
    extra = sorted(f for f in fields if prov is not None and f in prov.PROVIDES)
    raw = set()
    for f in fields:
        if f not in extra:
            raw |= set(DERIVED.get(f, (f,)))
    helper = set(prov.NEEDS) - raw if extra else set()
    if helper:  # 提供方的辅助字段只取日线文件里有的列（例如测试数据没有 industry）
        import pyarrow.parquet as pq

        have = set(pq.read_schema(store.market_dir(market) / "prices.parquet").names)
        helper = {h for h in helper if h in have}
    panel = store.load_panel(market, sorted(raw | helper), start=start,
                             end=None if end_ex is None else end_ex - pd.Timedelta(days=1), raw=True)
    panel = restrict_codes(truncate_panel(panel, end_ex, hidden), mode, lb.explore_frac)
    if extra:
        # 提供方只拿到已截断的面板，并自行删掉生效日不早于 end_ex（或落在 hidden）的财报事件
        got = prov.panel_fields(extra, panel, end_ex, hidden)
        panel = {k: v for k, v in panel.items() if k not in helper}
        panel.update(truncate_panel(got, end_ex, hidden))
    panel = add_open_adj(panel)
    try:
        sec = store.read_securities(market)
    except FileNotFoundError:
        sec = None
    sec = guard_securities(sec, mode, end_ex, hidden, lb.explore_frac)
    if log and mode in ("confirm", "forward"):
        TrialLedger().append(market, {"event": "data_access", "mode": mode, "fields": sorted(raw),
                                      "batch_id": getattr(token, "batch_id", None), "prereg": prereg,
                                      "visible_end": None if end_ex is None else str(end_ex.date()),
                                      "hidden": None if hidden is None else [str(d.date()) for d in hidden]})
    snap = snapshot_hash(market)
    if extra:
        snap = f"{snap}+{prov.snapshot()}"
    return MarketData(panel, sec, snap, end_ex, hidden)
