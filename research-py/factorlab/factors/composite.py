"""第三轮（R3）组合因子（docs/research/factorlab/rounds/R3-2026-11-27.md，计划在跑之前提交）。

共同口径（写在跑之前）：
- 成分用已注册的因子函数原样计算（同一面板、同一批调仓日），先乘以成分事先写定的方向（R1 / R2 计划里的
  direction），使「越大越好」；
- 每个调仓日、每个成分单独做截面 MAD 5 倍去极值 + zscore（factorlab.preprocess），截面 = 面板里当日有
  复权收盘价的证券（因子函数拿不到股票池掩码；explore / validate 层面板本来就只有本层证券）；
- 等权平均：3–4 个成分的至少 2 个有值，2 个成分的两个都要有值，否则为空；
- 只用同一调仓日的成分值（每个成分本身只用当日及以前的数据，截面运算逐日进行），没有前视；
- 组合分数方向 +1；评估时引擎照常再做一次股票池内 MAD + zscore。

C4（cn_ep_resid）：zscore 后的 cn_ep_ttm 逐日对 [1, log 总市值, vol_60d] 做 OLS 取残差。log 总市值用 R2 的
点时总市值 fin_mcap（= mcap_total，退市股用实收资本后备；与 cn_ep_ttm 的分母一致），两个回归变量同样先做
MAD 5 倍去极值（线性缩放不影响残差，所以不再标准化）；三者缺一即为空，当日有效样本 < 10 时整行为空。

C4、C6 是「事后想到」（看过 R1 / R2 参考项后提出），评估时动机写 'post-hoc: R1/R2 reference'。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..preprocess import winsorize_mad, zscore
from ..registry import FACTORS, factor
from . import fundamental, fundamental_cn, price  # noqa: F401  确保成分已注册

MAD_N = 5.0
MIN_OBS_RESID = 10

def min_components(k: int) -> int:
    """至少要几个成分有值：2 个成分的两个都要，3–4 个成分的至少 2 个。"""
    return k if k <= 2 else 2


def _needs(names) -> list[str]:
    out = {"close_adj"}
    for n in names:
        out |= set(FACTORS[n].needs)
    return sorted(out)


def _lookback(names) -> int:
    return max(FACTORS[n].lookback for n in names)


def _alive(panel: dict, dates: pd.DatetimeIndex, cols: pd.Index) -> pd.DataFrame:
    """当日有复权收盘价的证券（组合内截面标准化的范围）。"""
    return panel["close_adj"].reindex(index=dates, columns=cols).notna()


def _prep(x: pd.DataFrame) -> pd.DataFrame:
    return zscore(winsorize_mad(x, MAD_N))


def component_scores(panel: dict, dates, comps) -> list[pd.DataFrame]:
    """各成分：计算 → 乘取号 → 只留当日有价格的证券 → 逐日 MAD 去极值 + zscore。"""
    dates = pd.DatetimeIndex(dates)
    cols = panel["close_adj"].columns
    alive = _alive(panel, dates, cols)
    out = []
    for name, sign in comps:
        raw = FACTORS[name](panel, dates).reindex(index=dates, columns=cols).astype(float)
        out.append(_prep((sign * raw).where(alive)))
    return out


def combine(scores: list[pd.DataFrame], min_k: int) -> pd.DataFrame:
    """等权平均；有值的成分少于 min_k 个的为空。"""
    arr = np.stack([s.to_numpy(float) for s in scores])
    ok = np.isfinite(arr)
    n = ok.sum(0)
    with np.errstate(invalid="ignore", divide="ignore"):
        m = np.where(ok, arr, 0.0).sum(0) / n
    m = np.where(n >= min_k, m, np.nan)
    return pd.DataFrame(m, index=scores[0].index, columns=scores[0].columns)


def composite(panel: dict, dates, comps) -> pd.DataFrame:
    """comps = ((成分因子名, 取号), ...)；取号 = 成分事先写定的方向。各因子函数体里把成分写成字面量，
    这样成分或取号的改动会改变因子源码哈希（登记簿 / 锁箱候选身份）。"""
    return combine(component_scores(panel, dates, comps), min_components(len(comps)))


def cross_section_resid(y: pd.DataFrame, xs: list[pd.DataFrame], min_obs: int = MIN_OBS_RESID) -> pd.DataFrame:
    """逐日 OLS：y ~ 1 + xs，返回残差；任一变量缺失的证券为空，有效样本不足时整行为空。"""
    out = np.full(y.shape, np.nan)
    Y = y.to_numpy(float)
    Xs = [x.reindex(index=y.index, columns=y.columns).to_numpy(float) for x in xs]
    for i in range(len(y.index)):
        cols = [np.ones(Y.shape[1])] + [x[i] for x in Xs]
        X = np.column_stack(cols)
        ok = np.isfinite(Y[i]) & np.isfinite(X).all(1)
        if ok.sum() < max(min_obs, X.shape[1] + 2):
            continue
        beta, *_ = np.linalg.lstsq(X[ok], Y[i, ok], rcond=None)
        out[i, ok] = Y[i, ok] - X[ok] @ beta
    return pd.DataFrame(out, index=y.index, columns=y.columns)


# ---------------------------------------------------------------- A 股
_C1 = ["cn_ep_ttm", "cn_bp", "vol_60d"]
_C2 = ["cn_ep_ttm", "rev_1m", "vol_60d", "turnover_20d"]
_C3 = ["cn_roe_ttm", "cn_gpa_ttm", "cn_accruals"]
_C4 = ["cn_ep_ttm", "vol_60d"]
_C5 = ["bm", "roe"]
_C6 = ["asset_growth", "net_issuance"]


@factor("cn_value_lowvol", needs=_needs(_C1), lookback=_lookback(_C1), markets=("cn",), direction=1,
        doc="R3 C1 价值 + 低波：zscore(cn_ep_ttm)、zscore(cn_bp)、zscore(−vol_60d) 等权（至少 2 个有值）")
def cn_value_lowvol(panel, dates):
    return composite(panel, dates, (("cn_ep_ttm", 1), ("cn_bp", 1), ("vol_60d", -1)))


@factor("cn_value_rev_lowvol", needs=_needs(_C2), lookback=_lookback(_C2), markets=("cn",), direction=1,
        doc="R3 C2 价值 + 反转 + 低波 + 低换手：cn_ep_ttm、rev_1m、−vol_60d、−turnover_20d 各自 zscore 后等权"
            "（至少 2 个有值）")
def cn_value_rev_lowvol(panel, dates):
    return composite(panel, dates, (("cn_ep_ttm", 1), ("rev_1m", 1), ("vol_60d", -1), ("turnover_20d", -1)))


@factor("cn_quality", needs=_needs(_C3), lookback=_lookback(_C3), markets=("cn",), direction=1,
        doc="R3 C3 质量（QMJ 简化）：cn_roe_ttm、cn_gpa_ttm、−cn_accruals 各自 zscore 后等权（至少 2 个有值）")
def cn_quality(panel, dates):
    return composite(panel, dates, (("cn_roe_ttm", 1), ("cn_gpa_ttm", 1), ("cn_accruals", -1)))


@factor("cn_ep_resid", needs=sorted(set(_needs(_C4)) | {"fin_mcap"}), lookback=_lookback(_C4), markets=("cn",),
        direction=1,
        doc="R3 C4（事后想到）盈利收益率残差：zscore(cn_ep_ttm) 逐日对 1、log 总市值（fin_mcap）、vol_60d "
            "（均 MAD 5 倍去极值）OLS 的残差")
def cn_ep_resid(panel, dates):
    dates = pd.DatetimeIndex(dates)
    cols = panel["close_adj"].columns
    alive = _alive(panel, dates, cols)
    ep = _prep(FACTORS["cn_ep_ttm"](panel, dates).reindex(index=dates, columns=cols).astype(float).where(alive))
    m = panel["fin_mcap"].reindex(index=dates, columns=cols).astype(float)
    lsize = winsorize_mad(np.log(m.where(m > 0)).where(alive), MAD_N)
    vol = winsorize_mad(FACTORS["vol_60d"](panel, dates).reindex(index=dates, columns=cols).astype(float)
                        .where(alive), MAD_N)
    return cross_section_resid(ep, [lsize, vol])


# ---------------------------------------------------------------- 美股
@factor("us_value_profit", needs=_needs(_C5), lookback=_lookback(_C5), markets=("us",), direction=1,
        doc="R3 C5 价值 + 盈利（Novy-Marx 2013）：zscore(bm)、zscore(roe) 等权（两个都要有值）")
def us_value_profit(panel, dates):
    return composite(panel, dates, (("bm", 1), ("roe", 1)))


@factor("us_investment", needs=_needs(_C6), lookback=_lookback(_C6), markets=("us",), direction=1,
        doc="R3 C6（事后想到；文献：FF CMA、发行异象）投资：zscore(−asset_growth)、zscore(−net_issuance) 等权"
            "（两个都要有值）")
def us_investment(panel, dates):
    return composite(panel, dates, (("asset_growth", -1), ("net_issuance", -1)))
