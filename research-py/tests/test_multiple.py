"""factorlab.multiple：有效试验数、PBO、DSR 的合成数据单测。"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest
from scipy import stats

from factorlab.guard import deflated_sharpe, expected_max_sharpe, probabilistic_sharpe
from factorlab.multiple import (
    cluster_effective_trials,
    count_t_ge2,
    moments,
    null_pass_distribution,
    period_sharpe,
)
from factorlab.guard import pbo_cscv


def _frame(cols: dict, T: int = 240) -> pd.DataFrame:
    return pd.DataFrame(cols, index=pd.date_range("2000-01-31", periods=T, freq="ME"))


def test_effective_trials_independent_noise_near_raw():
    rng = np.random.default_rng(11)
    T, N = 300, 12
    m = _frame({f"n{i}": rng.standard_normal(T) for i in range(N)}, T)
    e = cluster_effective_trials(m, threshold=0.7)
    assert e["n_raw"] == N
    # 独立噪声几乎互不相关，有效数应接近实际数
    assert e["n_effective"] >= N - 2
    assert e["n_effective"] <= N


def test_effective_trials_perfectly_correlated_is_one():
    rng = np.random.default_rng(12)
    T = 240
    base = rng.standard_normal(T)
    m = _frame({f"c{i}": base * (1 if i % 2 == 0 else -1) + 1e-12 * i for i in range(8)}, T)
    e = cluster_effective_trials(m, threshold=0.7)
    assert e["n_raw"] == 8
    assert e["n_effective"] == 1


def test_pbo_pure_noise_near_half():
    rng = np.random.default_rng(13)
    noise = pd.DataFrame(rng.standard_normal((240, 16)) * 0.04)
    pbo = pbo_cscv(noise, n_blocks=10)["pbo"]
    assert 0.35 < pbo < 0.65


def test_dsr_matches_hand_calculation():
    """已知 sr / N / T / 矩时，DSR 与 Bailey 公式手算一致。"""
    sr, n_trials, sr_var, T = 0.15, 20.0, 0.005, 224
    skew, kurt = -0.2, 4.0
    ir_star = expected_max_sharpe(n_trials, sr_var)
    denom = math.sqrt(max(1 - skew * sr + (kurt - 1) / 4 * sr ** 2, 1e-12))
    hand = float(stats.norm.cdf((sr - ir_star) * math.sqrt(T - 1) / denom))
    assert deflated_sharpe(sr, n_trials, sr_var, T, skew, kurt) == pytest.approx(hand, abs=1e-12)
    assert hand == pytest.approx(probabilistic_sharpe(sr, ir_star, T, skew, kurt), abs=1e-12)


def test_moments_and_period_sharpe():
    x = pd.Series([0.01, -0.02, 0.03, 0.01, -0.01, 0.02])
    sr, skew, kurt, T = moments(x)
    assert T == 6
    assert sr == pytest.approx(period_sharpe(x))
    assert skew == pytest.approx(float(stats.skew(x)))
    assert kurt == pytest.approx(float(stats.kurtosis(x, fisher=False)))


def test_null_pass_noise_expected_small():
    """均值本为 0 的独立噪声，t≥2 的预期应远小于列数。"""
    rng = np.random.default_rng(14)
    m = _frame({f"n{i}": rng.standard_normal(180) * 0.02 for i in range(10)}, 180)
    actual = count_t_ge2(m)["n_pass"]
    null = null_pass_distribution(m, n_sims=200, seed=14)
    assert null["expected"] < 3
    assert actual <= null["ci90"][1] + 2


def test_headline_reports_both_luck_and_pick_warning():
    from factorlab.multiple import compose_headline

    cn = {"t_ge2_actual": 8, "t_ge2_expected": 0.8, "t_ge2_ci90": [0.0, 4.0], "pbo": 0.635}
    cands = [{"dsr": 0.656}, {"dsr": 0.706}, {"dsr": 0.688}]
    headline, luck_line = compose_headline(cn, cands)
    assert "8 个对 0–4" in headline
    assert "过拟合概率 0.64" in headline and "高于 0.5" in headline
    assert "0.66–0.71" in headline and "0.95" in headline
    assert "锁箱确认和前推" in headline
    assert "0.8" not in headline.replace("0.8 个", "")
    assert "预期约 0.8 个" in luck_line


def test_headline_when_count_inside_luck_band_and_pbo_low():
    from factorlab.multiple import compose_headline

    cn = {"t_ge2_actual": 2, "t_ge2_expected": 0.6, "t_ge2_ci90": [0.0, 3.0], "pbo": 0.30}
    headline, _ = compose_headline(cn, [{"dsr": 0.97}, {"dsr": 0.5}])
    assert "仍落在纯运气区间" in headline
    assert "低于 0.5" in headline
    assert "只有 1 个达到常用门槛 0.95" in headline
