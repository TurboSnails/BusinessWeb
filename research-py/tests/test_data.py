"""多资产处理后数据的基本检查（只读 data/processed/，不需要原始文件）。"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from data.build import par_bond_price

P = Path(__file__).resolve().parents[1] / "data" / "processed"


def test_par_bond_pricing():
    assert par_bond_price(0.05, 0.05, 5) == pytest.approx(1.0, abs=1e-12)
    # 收益率上升 1 个百分点，5 年期平价债跌约 4.2%（修正久期约 4.4）
    assert par_bond_price(0.06, 0.05, 5) == pytest.approx(0.9573, abs=5e-4)
    assert par_bond_price(0.04, 0.05, 0) == 1.0


def test_bond_daily_series():
    b = pd.read_csv(P / "bond5_daily.csv", index_col=0)
    assert b.index[0] == "1962-01-02"
    assert b["ret"].iloc[1:].notna().all()
    assert b["ret"].iloc[1:].abs().max() < 0.05  # 单日涨跌不超过 5%
    assert b.index.is_monotonic_increasing


def test_gold_segments_in_order_and_continuous():
    g = pd.read_csv(P / "gold_daily.csv", index_col=0)
    assert g.index.is_monotonic_increasing and not g.index.duplicated().any()
    order = list(dict.fromkeys(g["source"]))
    assert order == ["bundesbank-frankfurt", "worldbank-interpolated", "comex-gc-front", "gld-fee-added-back"]
    assert g.index[0] == "1975-01-02"
    # 各段接缝处没有跳空（相邻两天涨跌 < 3%）
    r = g["price"].pct_change()
    seams = g.index[g["source"] != g["source"].shift()][1:]
    assert all(abs(r[s]) < 0.03 for s in seams)


def test_checks_all_pass():
    checks = json.loads((P.parent / "CHECKS.json").read_text(encoding="utf-8"))
    assert checks["allOk"], [c for c in checks["checks"] if not c["ok"]]
