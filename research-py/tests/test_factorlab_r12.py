"""R12 股息率：手算、送转不计、无前视。"""
import numpy as np
import pandas as pd

import factorlab.factors  # noqa: F401
from factorlab.registry import FACTORS, check_no_lookahead


def _panel():
    idx = pd.bdate_range("2020-01-01", periods=400)
    cols = ["A", "B", "C"]
    close = pd.DataFrame(10.0, idx, cols)
    ref = close.shift(1).copy()
    shares = pd.DataFrame(1e8, idx, cols)
    # A：两次现金分红 0.3、0.2
    for day, dv in ((100, 0.3), (300, 0.2)):
        ref.iloc[day, 0] = 10.0 - dv
    # B：10 送 10（参考价减半），股本翻倍
    ref.iloc[200, 1] = 5.0
    close.iloc[200:, 1] = 5.0
    ref.iloc[201:, 1] = 5.0
    shares.iloc[200:, 1] = 2e8
    # C：单次 20% 的「分红」（视为非现金事件）
    ref.iloc[150, 2] = 8.0
    return {"close": close, "ref_close": ref, "total_shares": shares}, idx


def test_manual_values_and_exclusions():
    panel, idx = _panel()
    d = idx[[320, 399]]
    f = FACTORS["cn_dy_ttm"](panel, d)
    assert abs(f.iloc[0, 0] - (0.3 + 0.2) / 10.0) < 1e-12        # 两次都在 252 日内
    assert abs(f.iloc[1, 0] - 0.2 / 10.0) < 1e-12                # 第 100 日已出窗口
    assert f.iloc[0, 1] == 0.0                                   # 送转不计
    assert f.iloc[0, 2] == 0.0                                   # 单次 > 15% 不计


def test_no_lookahead():
    panel, idx = _panel()
    ends = pd.DatetimeIndex(pd.Series(idx).groupby(idx.to_period("M")).max().values[-8:])
    assert check_no_lookahead(FACTORS["cn_dy_ttm"], panel, ends)
