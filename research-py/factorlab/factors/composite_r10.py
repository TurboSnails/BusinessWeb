"""第十轮（R10）港股组合因子与 A 股对照（docs/research/factorlab/rounds/R10-2026-11-28.md，计划在跑之前提交）。

口径同 R3 / R8 的 composite()：成分乘事先方向 → 当日有价证券内 MAD 5 倍 + zscore → 等权；
3 个成分至少 2 个有值，4 个成分至少 2 个有值。成分与取号写成字面量（改动即改源码哈希）。
"""

from __future__ import annotations

from ..registry import factor
from . import fundamental_cn, fundamental_hk, price2, surprise  # noqa: F401  确保成分已注册
from .composite import _lookback, _needs, composite

_HA = ["hk_ep_ttm", "hk_roe_ttm", "hk_sue_h"]
_HB = ["hk_ep_ttm", "hk_roe_ttm", "hk_sue_h", "high_52w"]
_CA = ["cn_ep_ttm", "cn_roe_ttm", "cn_sue"]
_CB = ["cn_ep_ttm", "cn_roe_ttm", "cn_sue", "high_52w"]


@factor("hk_vqs", needs=_needs(_HA), lookback=_lookback(_HA), markets=("hk",), direction=1,
        doc="R10 HA（成分事后挑选）港股价值 + 质量 + 盈余惊喜：hk_ep_ttm、hk_roe_ttm、hk_sue_h 各自 zscore 后等权")
def hk_vqs(panel, dates):
    return composite(panel, dates, (("hk_ep_ttm", 1), ("hk_roe_ttm", 1), ("hk_sue_h", 1)))


@factor("hk_vqs52", needs=_needs(_HB), lookback=_lookback(_HB), markets=("hk",), direction=1,
        doc="R10 HB（成分事后挑选）HA + 52 周高点距离：hk_ep_ttm、hk_roe_ttm、hk_sue_h、high_52w 各自 zscore 后等权")
def hk_vqs52(panel, dates):
    return composite(panel, dates, (("hk_ep_ttm", 1), ("hk_roe_ttm", 1), ("hk_sue_h", 1), ("high_52w", 1)))


@factor("cn_vqs", needs=_needs(_CA), lookback=_lookback(_CA), markets=("cn",), direction=1,
        doc="R10 HA 的 A 股对照（跨市场复现用）：cn_ep_ttm、cn_roe_ttm、cn_sue 各自 zscore 后等权")
def cn_vqs(panel, dates):
    return composite(panel, dates, (("cn_ep_ttm", 1), ("cn_roe_ttm", 1), ("cn_sue", 1)))


@factor("cn_vqs52", needs=_needs(_CB), lookback=_lookback(_CB), markets=("cn",), direction=1,
        doc="R10 HB 的 A 股对照：cn_ep_ttm、cn_roe_ttm、cn_sue、high_52w 各自 zscore 后等权")
def cn_vqs52(panel, dates):
    return composite(panel, dates, (("cn_ep_ttm", 1), ("cn_roe_ttm", 1), ("cn_sue", 1), ("high_52w", 1)))
