"""调仓频率（M / W / D）：默认月度与以前完全相同（日期与配置哈希），周 / 日调仓日正确。"""
import pandas as pd
import pytest

import factorlab.factors  # noqa: F401
from factorlab.calendar import month_end_dates, rebalance_dates, week_end_dates
from factorlab.evaluate import candidate_spec


def test_monthly_identical():
    days = pd.bdate_range("2020-01-01", "2021-06-30")
    assert rebalance_dates(days, "M").equals(month_end_dates(days))


def test_weekly_and_daily():
    days = pd.bdate_range("2024-01-01", "2024-01-31")          # 2024-01-31 是周三
    w = week_end_dates(days)
    assert list(w.strftime("%m-%d")) == ["01-05", "01-12", "01-19", "01-26"]   # 最后不完整的一周去掉
    assert all(d.weekday() == 4 for d in w)
    d = rebalance_dates(days, "D")
    assert len(d) == len(days) - 1 and d[-1] == days[-2]
    with pytest.raises(ValueError):
        rebalance_dates(days, "Q")


def test_frozen_candidate_hashes_unchanged():
    # L-038 / L-043 / L-045 预注册里冻结的配置哈希前缀
    assert candidate_spec("cn", "cn_sue")["config_hash"].startswith("efc06e526d76")
    assert candidate_spec("cn", "turnover_vol_20d")["config_hash"].startswith("97643c4fdcb6")
    assert candidate_spec("cn", "cn_multi4")["config_hash"].startswith("efc06e526d76")
    assert candidate_spec("hk", "hk_vqs52")["config_hash"].startswith("14a984b84f02")
    assert candidate_spec("cn", "cn_sue", rebalance="M")["config_hash"] == candidate_spec("cn", "cn_sue")["config_hash"]
    assert candidate_spec("cn", "cn_sue", rebalance="W")["config_hash"] != candidate_spec("cn", "cn_sue")["config_hash"]
