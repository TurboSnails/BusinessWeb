"""第二套引擎验收：独立复现 JS 研究引擎的现行 v2.2 E1 结果，逐层断言，失败时能定位到哪一层。

对照文件由 fixtures/export_fixture.mjs 用 JS 引擎导出；这里只拿来比较，Python 计算不读取它们。
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from engines import e1

FIX = Path(__file__).resolve().parents[1] / "fixtures"
META = json.loads((FIX / "e1-baseline-meta.json").read_text(encoding="utf-8"))

# 路线图第 2 阶段的验收阈值
SCALAR_TOL = {"sharpe": 5e-4, "sharpeNet": 5e-4, "cagr": 5e-4, "dailyMaxDd": 1e-3}
NAV_REL_TOL = 1e-9


@pytest.fixture(scope="module")
def result():
    inp = e1.load_inputs()
    periods = e1.build_periods(inp)
    daily, per = e1.simulate(inp, periods)
    return inp, periods, daily, per


def _short(x: float) -> str:
    """与 JS String(number) 相同的最短往返表示（整数不带 .0）。"""
    s = repr(float(x))
    return s[:-2] if s.endswith(".0") else s


def test_0_inputs_are_the_frozen_files():
    tiers = META["inputs"]["tiers"]
    digest = hashlib.sha256((e1.REPO / tiers["file"]).read_bytes()).hexdigest()
    assert digest == tiers["sha256"], f"{tiers['file']} 与导出对照文件时不同，先重新导出对照文件"
    daily = META["inputs"]["daily"]
    rows = json.loads((e1.REPO / daily["file"]).read_text(encoding="utf-8"))["rows"]
    text = "".join(f"{d},{_short(c)}\n" for d, c in rows if d <= daily["until"])
    assert hashlib.sha256(text.encode()).hexdigest() == daily["contentSha256"], "日线缓存的已用部分被改动，先查原因并重新导出对照文件"


def test_1_execution_dates(result):
    _, periods, _, _ = result
    ref = pd.read_csv(FIX / "e1-baseline-periods.csv", dtype={"signal": str})
    assert len(periods) == len(ref) == 644
    assert (periods["signal"].to_numpy() == ref["signal"].to_numpy()).all()
    assert (periods["start"].to_numpy() == ref["start"].to_numpy()).all()
    assert (periods["end"].to_numpy() == ref["end"].to_numpy()).all()


def test_2_period_parameters(result):
    _, periods, _, _ = result
    ref = pd.read_csv(FIX / "e1-baseline-periods.csv", dtype={"signal": str})
    assert (periods["n"].to_numpy() == ref["n"].to_numpy()).all()
    assert (periods["tier"].to_numpy() == ref["tier"].to_numpy()).all()
    for col in ["div", "cash", "weight"]:
        np.testing.assert_allclose(periods[col].to_numpy(), ref[col].to_numpy(), rtol=0, atol=1e-14, err_msg=col)


def test_3_daily_weights_and_returns(result):
    _, _, daily, _ = result
    ref = pd.read_csv(FIX / "e1-baseline-daily.csv", dtype={"signal": str})
    assert len(daily) == len(ref)
    assert (daily["date"].to_numpy() == ref["date"].to_numpy()).all()
    # CSV 以 17 位有效数字写出，0.85 这类数读回会差约 1e-16，属于格式往返误差
    np.testing.assert_allclose(daily["weight"].to_numpy(), ref["weight"].to_numpy(), rtol=0, atol=1e-15)
    np.testing.assert_allclose(daily["stock"].to_numpy(), ref["stock"].to_numpy(), rtol=0, atol=1e-14)
    np.testing.assert_allclose(daily["ret"].to_numpy(), ref["ret"].to_numpy(), rtol=0, atol=1e-14)


def test_4_daily_nav(result):
    _, _, daily, _ = result
    ref = pd.read_csv(FIX / "e1-baseline-daily.csv", dtype={"signal": str})
    rel = np.abs(daily["nav"].to_numpy() / ref["nav"].to_numpy() - 1)
    assert rel.max() < NAV_REL_TOL, f"逐日净值最大相对误差 {rel.max():.2e}"


def test_5_summary_numbers(result):
    _, _, daily, per = result
    mine = e1.summarize(daily, per)
    ref = META["summary"]
    for key, tol in SCALAR_TOL.items():
        assert abs(mine[key] - ref[key]) < tol, f"{key}: {mine[key]} vs {ref[key]}"
    # 路线图写定的现行数字：夏普 0.593、扣费 0.586、年化 10.3%、按日最大回撤 −33.0%
    assert round(mine["sharpe"], 3) == 0.593
    assert round(mine["sharpeNet"], 3) == 0.586
    assert round(mine["cagr"], 3) == 0.103
    assert round(mine["dailyMaxDd"], 3) == -0.330
