"""截面预处理（逐个调仓日、只在股票池内）：MAD 去极值、标准化、排序归一、市值 / 行业中性化。

输入输出都是 调仓日 × 代码 的宽表；空值保持为空。
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from .universe import bool_values


def apply_mask(df: pd.DataFrame, mask: pd.DataFrame | None) -> pd.DataFrame:
    """股票池外的置空。"""
    if mask is None:
        return df
    return df.where(bool_values(mask.reindex(index=df.index, columns=df.columns)))


def winsorize_mad(df: pd.DataFrame, n: float = 5.0, consistent: bool = False) -> pd.DataFrame:
    """截到 中位数 ± n × MAD。MAD = median(|x - median|)；consistent=True 时乘 1.4826（对正态等于 σ）。

    MAD = 0（过半数取同一个值，例如离散 / 稀疏因子）时不能按 MAD 截，否则整行被压成常数、标准化后全空：
    这种日子改用标准差折算的宽度（n × 0.6745σ，对正态与 n × MAD 相当；consistent=True 时 n × σ）；
    标准差也为 0 = 整行真的是常数，不截。"""
    med = df.median(axis=1)
    mad = df.sub(med, axis=0).abs().median(axis=1)
    sd = df.std(axis=1)
    if consistent:
        mad = mad * 1.4826
        alt = sd
    else:
        alt = sd * 0.6745
    width = mad.where(mad > 0, alt)
    width = width.where(width > 0)          # 真常数行（或只有一个值）：不截
    lower = (med - n * width).fillna(-np.inf)
    upper = (med + n * width).fillna(np.inf)
    return df.clip(lower=lower, upper=upper, axis=0)


def zscore(df: pd.DataFrame) -> pd.DataFrame:
    """减截面均值、除截面标准差（ddof=1）；只有整行真的是常数（标准差为 0）或不足两个值时整行置空。"""
    sd = df.std(axis=1)
    sd = sd.where(sd > 0)
    return df.sub(df.mean(axis=1), axis=0).div(sd, axis=0)


def rank_normalize(df: pd.DataFrame, gaussian: bool = False) -> pd.DataFrame:
    """截面排序 → (rank - 0.5) / n，落在 (0, 1)，再减 0.5；gaussian=True 时改为正态分位数。"""
    n = df.notna().sum(axis=1)
    u = df.rank(axis=1).sub(0.5).div(n.replace(0, np.nan), axis=0)
    return pd.DataFrame(stats.norm.ppf(u), index=df.index, columns=df.columns) if gaussian else u - 0.5


def neutralize(df: pd.DataFrame, log_size: pd.DataFrame | None = None,
               industry: pd.DataFrame | None = None, min_obs: int = 10) -> pd.DataFrame:
    """逐日 OLS：因子 ~ 1 + log 市值 [+ 行业哑变量]，返回残差。

    log_size：调仓日 × 代码 的 log 市值（例如 size 因子）；industry：同形状的行业代码（可为空，
    只能是点时行业；没有就只做市值）。缺任一回归变量的股票该日结果为空。
    """
    if log_size is None and industry is None:
        return df.copy()
    out = pd.DataFrame(np.nan, index=df.index, columns=df.columns)
    for d in df.index:
        y = df.loc[d]
        cols = [pd.Series(1.0, index=df.columns, name="const")]
        if log_size is not None:
            cols.append(log_size.reindex(index=[d], columns=df.columns).iloc[0].rename("size"))
        X = pd.concat(cols, axis=1)
        ok = y.notna() & X.notna().all(axis=1)
        if industry is not None:
            ind = industry.reindex(index=[d], columns=df.columns).iloc[0]
            ok &= ind.notna()
            dummies = pd.get_dummies(ind[ok], drop_first=True, dtype=float)
            X = pd.concat([X[ok], dummies], axis=1)
        else:
            X = X[ok]
        if ok.sum() < max(min_obs, X.shape[1] + 2):
            continue
        beta, *_ = np.linalg.lstsq(X.to_numpy(float), y[ok].to_numpy(float), rcond=None)
        out.loc[d, ok[ok].index] = y[ok].to_numpy(float) - X.to_numpy(float) @ beta
    return out


def standard_pipeline(df: pd.DataFrame, mask: pd.DataFrame | None = None, mad_n: float | None = 5.0,
                      log_size: pd.DataFrame | None = None, industry: pd.DataFrame | None = None,
                      method: str = "zscore") -> pd.DataFrame:
    """默认流程：股票池掩码 → MAD 去极值 → （可选）中性化 → zscore / rank。"""
    x = apply_mask(df, mask)
    if mad_n:
        x = winsorize_mad(x, mad_n)
    if log_size is not None or industry is not None:
        x = neutralize(x, apply_mask(log_size, mask) if log_size is not None else None, industry)
    if method == "zscore":
        return zscore(x)
    if method == "rank":
        return rank_normalize(x)
    if method in (None, "none", "raw"):
        return x
    raise ValueError(f"未知的标准化方法：{method}")
