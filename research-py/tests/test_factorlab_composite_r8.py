"""R8 组合因子：注册信息与成分口径（与 composite() 手工组合逐格一致）。"""
import numpy as np
import pandas as pd

from factorlab.factors import composite as cp
from factorlab.registry import FACTORS


def _panel(n_days=40, n=30, seed=0):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2020-01-01", periods=n_days)
    cols = [f"{i:06d}" for i in range(n)]
    px = pd.DataFrame(100 * np.exp(np.cumsum(rng.normal(0, 0.02, (n_days, n)), 0)), idx, cols)
    turn = pd.DataFrame(rng.uniform(0.5, 5, (n_days, n)), idx, cols)
    return {"close_adj": px, "turnover": turn,
            "fin_ni_sue": pd.DataFrame(rng.normal(size=(n_days, n)), idx, cols),
            "fin_rev_sur": pd.DataFrame(rng.normal(size=(n_days, n)), idx, cols)}, idx[25:]


def test_registered_with_expected_needs():
    assert set(FACTORS["cn_pead2"].needs) >= {"fin_ni_sue", "fin_rev_sur"}
    assert set(FACTORS["cn_multi4"].needs) >= {"fin_ni_sue", "fin_rev_sur", "turnover"}
    assert FACTORS["cn_pead2"].direction == 1 and FACTORS["cn_multi4"].direction == 1


def test_pead2_equals_manual_composite():
    panel, dates = _panel()
    got = FACTORS["cn_pead2"](panel, dates)
    want = cp.composite(panel, dates, (("cn_sue", 1), ("cn_sur", 1)))
    pd.testing.assert_frame_equal(got, want)
    # 任一成分缺失即为空
    panel["fin_rev_sur"].iloc[-1, 0] = np.nan
    assert np.isnan(FACTORS["cn_pead2"](panel, dates).iloc[-1, 0])
