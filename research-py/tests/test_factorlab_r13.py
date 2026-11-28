"""R13 技术形态因子：无前视、手算一致。"""
import numpy as np
import pandas as pd

import factorlab.factors  # noqa: F401
from factorlab.registry import FACTORS, check_no_lookahead

NAMES = ["brk_250", "brk_250_vol", "donchian_60", "uptrend_pullback", "dd_60", "peak_fall"]


def _panel(seed=3):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2018-01-01", periods=700)
    cols = [f"S{i}" for i in range(30)]
    px = pd.DataFrame(100 * np.exp(np.cumsum(rng.normal(0.0005, 0.02, (700, 30)), 0)), idx, cols)
    vol = pd.DataFrame(rng.uniform(1e5, 1e6, (700, 30)), idx, cols)
    ends = pd.DatetimeIndex(pd.Series(idx).groupby(idx.to_period("M")).max().values[-10:])
    return {"close_adj": px, "volume": vol}, ends


def test_no_lookahead():
    panel, ends = _panel()
    for n in NAMES:
        assert check_no_lookahead(FACTORS[n], panel, ends), n


def test_manual():
    panel, ends = _panel()
    c = panel["close_adj"]
    d = ends[-1]
    i = c.index.get_loc(d)
    s = c.iloc[:, 4]
    assert abs(FACTORS["brk_250"](panel, ends).loc[d].iloc[4] - (s.iloc[i] / s.iloc[i - 260:i - 20].max() - 1)) < 1e-12
    w = s.iloc[i - 59:i + 1]
    assert abs(FACTORS["dd_60"](panel, ends).loc[d].iloc[4] - (1 - s.iloc[i] / w.max())) < 1e-12
    pos = (s.iloc[i] - w.min()) / (w.max() - w.min())
    assert abs(FACTORS["donchian_60"](panel, ends).loc[d].iloc[4] - pos) < 1e-12
    ma = s.iloc[i - 249:i + 1].mean(); ma20 = s.iloc[i - 269:i - 19].mean()
    up = FACTORS["uptrend_pullback"](panel, ends).loc[d].iloc[4]
    if s.iloc[i] > ma and ma > ma20:
        assert abs(up - (1 - s.iloc[i] / w.max())) < 1e-12
    else:
        assert np.isnan(up)
