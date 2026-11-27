"""第八轮（R8）A 股组合因子（docs/research/factorlab/rounds/R8-2026-11-28.md，计划在跑之前提交）。

口径与 R3 组合因子完全相同（factors/composite.py 的 composite()：各成分乘事先方向 → 当日有价证券内 MAD 5 倍
+ zscore → 等权；2 个成分须都有值，3–4 个成分至少 2 个有值）。成分因子与取号写成字面量，改动会改变源码哈希。
"""

from __future__ import annotations

from ..registry import factor
from . import fundamental_cn, price2, surprise  # noqa: F401  确保成分已注册
from .composite import _lookback, _needs, composite

_M1 = ["cn_sue", "cn_sur"]
_M2 = ["cn_sue", "cn_sur", "turnover_vol_20d", "cn_ep_ttm"]


@factor("cn_pead2", needs=_needs(_M1), lookback=_lookback(_M1), markets=("cn",), direction=1,
        doc="R8 M1 盈余 + 营收惊喜（Jegadeesh–Livnat 2006）：zscore(cn_sue)、zscore(cn_sur) 等权（两个都要有值）")
def cn_pead2(panel, dates):
    return composite(panel, dates, (("cn_sue", 1), ("cn_sur", 1)))


@factor("cn_multi4", needs=_needs(_M2), lookback=_lookback(_M2), markets=("cn",), direction=1,
        doc="R8 M2（成分为事后挑选）惊喜 + 换手稳定 + 价值：cn_sue、cn_sur、−turnover_vol_20d、cn_ep_ttm 各自 "
            "zscore 后等权（至少 2 个有值）")
def cn_multi4(panel, dates):
    return composite(panel, dates, (("cn_sue", 1), ("cn_sur", 1), ("turnover_vol_20d", -1), ("cn_ep_ttm", 1)))
