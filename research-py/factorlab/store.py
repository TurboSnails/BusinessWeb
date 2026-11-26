"""本地数据仓库：读写 securities / prices / MANIFEST（布局见 schema.py）。

数据源模块只通过 write_* 写入，引擎只通过 read_* / load_panel 读取。
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict
from pathlib import Path

import pandas as pd

from .schema import KF_COLUMNS, PRICES_COLUMNS, SECURITIES_COLUMNS, Manifest, validate_frame

DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "factor-data"


def root() -> Path:
    return Path(os.environ.get("FACTORLAB_DATA", DEFAULT_ROOT))


def market_dir(market: str) -> Path:
    d = root() / market
    d.mkdir(parents=True, exist_ok=True)
    return d


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _coerce(df: pd.DataFrame, columns: dict[str, str]) -> pd.DataFrame:
    out = df.copy()
    for c, t in columns.items():
        if c not in out.columns:
            out[c] = pd.NA
        if t.startswith("datetime"):
            out[c] = pd.to_datetime(out[c])
        elif t == "boolean":
            out[c] = out[c].astype("boolean")
        elif t.startswith("float"):
            # 缺列或含 pd.NA 的 object 列不能直接 astype(float)（会报 NAType 错误）
            out[c] = pd.to_numeric(out[c]).astype(t)
        else:
            out[c] = out[c].astype(t)
    return out[list(columns) + [c for c in out.columns if c not in columns]]


def write_securities(market: str, df: pd.DataFrame) -> Path:
    df = _coerce(df, SECURITIES_COLUMNS)
    if df["code"].duplicated().any():
        raise ValueError("securities 有重复代码")
    p = market_dir(market) / "securities.parquet"
    df.to_parquet(p, index=False)
    return p


def write_prices(market: str, df: pd.DataFrame) -> Path:
    df = _coerce(df, PRICES_COLUMNS).sort_values(["code", "date"]).reset_index(drop=True)
    problems = validate_frame(df, PRICES_COLUMNS, "prices")
    if problems:
        raise ValueError("；".join(problems))
    p = market_dir(market) / "prices.parquet"
    df.to_parquet(p, index=False)
    return p


def write_kf(df: pd.DataFrame, market: str = "us_kf") -> Path:
    df = _coerce(df, KF_COLUMNS)
    p = market_dir(market) / "portfolios.parquet"
    df.to_parquet(p, index=False)
    return p


def write_manifest(m: Manifest) -> Path:
    d = market_dir(m.market)
    data = asdict(m)
    data["sha256"] = {name: _sha256(d / name) for name in m.sha256} if m.sha256 else {
        p.name: _sha256(p) for p in sorted(d.glob("*.parquet"))}
    p = d / "MANIFEST.json"
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return p


def read_manifest(market: str) -> dict:
    return json.loads((market_dir(market) / "MANIFEST.json").read_text(encoding="utf-8"))


def read_securities(market: str) -> pd.DataFrame:
    return pd.read_parquet(market_dir(market) / "securities.parquet")


LOCKBOX_FILE = Path(__file__).resolve().parent / "lockbox.json"


def lockbox_start(market: str) -> pd.Timestamp | None:
    """锁箱起点（lockbox.json）；该市场未配置锁箱时为 None。"""
    try:
        cfg = json.loads(LOCKBOX_FILE.read_text(encoding="utf-8"))["markets"]
    except FileNotFoundError:
        return None
    m = cfg.get(market)
    return pd.Timestamp(m["start"]) if m else None


def read_prices(market: str, columns: list[str] | None = None, start=None, end=None, *, raw: bool = False) -> pd.DataFrame:
    """读日线长表。默认（raw=False）截掉锁箱起点及以后的数据——研究代码直接读 store 也看不到锁箱。
    只有数据源构建、数据审计和带护栏的 data.load_market（它按解封凭证自行截断）才传 raw=True。"""
    cols = None if columns is None else sorted(set(["date", "code", *columns]))
    df = pd.read_parquet(market_dir(market) / "prices.parquet", columns=cols)
    if start is not None:
        df = df[df["date"] >= pd.Timestamp(start)]
    if end is not None:
        df = df[df["date"] <= pd.Timestamp(end)]
    if not raw:
        cut = lockbox_start(market)
        if cut is not None:
            df = df[df["date"] < cut]
    return df


def load_panel(market: str, fields: list[str], start=None, end=None, *, raw: bool = False) -> dict[str, pd.DataFrame]:
    """长表 → {字段: 宽表（行 = 交易日，列 = 代码）}。raw 的含义同 read_prices。"""
    df = read_prices(market, fields, start, end, raw=raw)
    return {f: df.pivot(index="date", columns="code", values=f).sort_index() for f in fields}
