"""因子评估：前瞻收益、IC / RankIC、ICIR、Newey–West t、衰减、分组、前 20% 对股票池（市值加权为主口径）、
市值三档、换手、覆盖率、spanning 回归。

**对外入口只有 evaluate_factor**（经 data 层护栏读数据、每调用一次自动记入登记簿，不能关闭）与
candidate_spec（生成解封时冻结的候选身份）。下划线开头的 _forward_returns / _ic_series 与
backtest._backtest / _backtest_vs_universe 是内部工具：它们接受任意面板、不做锁箱截断也不记账，研究时不要直接调用。

前瞻收益口径：调仓日 t_i 的信号，在执行日（execution='open'：t_i 之后第一个交易日开盘，'close'：t_i 收盘）
买入，在 t_{i+1} 的执行日卖出；期间退市的补退市收益（默认 −100%）。期 (t_i, t_{i+1}] 按结束日 t_{i+1} 归层。

基准口径：「股票池」收益（tmu 的减数、回测的基准）都是**全部入池证券**（不论因子在该股是否有值），
与 backtest 的基准组合一致；分组与选股用 backtest.select_top / quantile_labels（并列按代码哈希）。
"""

from __future__ import annotations

import contextlib
import hashlib
import inspect
import json
import math
import traceback
from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

from . import data as data_mod
from .backtest import CostModel, _backtest_vs_universe, cost_model, quantile_labels, select_top, tie_keys
from .calendar import month_end_dates, trading_days
from .guard import CANDIDATE_FIELDS, Lockbox, TrialLedger, UnsealToken, split_codes, stable_hash, trial_key, \
    truncate_panel, verify_prereg
from .preprocess import standard_pipeline
from .registry import FactorSpec, get, params_hash
from .universe import AdvCache, UniverseSpec, build_universe

# 分段报告的切点（DESIGN.md 第五节：A 股按 2017 年前后、2024 年前后分段）
DEFAULT_SEGMENTS = {"cn": ("2017-01-01", "2024-01-01")}

PANEL_FIELDS = ["close_adj", "open", "high", "low", "close", "volume", "amount", "mcap_float",
                "limit_up", "limit_down", "is_suspended"]
MCAP_MIN_COVERAGE = 0.5


# ---------------------------------------------------------------- 前瞻收益
def execution_days(days: pd.DatetimeIndex, dates: pd.DatetimeIndex, execution: str) -> pd.Series:
    """每个调仓日对应的成交日（开盘执行 = 下一个交易日；越界为 NaT）。"""
    if execution == "close":
        return pd.Series(dates, index=dates)
    pos = days.searchsorted(dates, side="right")
    return pd.Series([days[p] if p < len(days) else pd.NaT for p in pos], index=dates)


def _forward_returns(panel: dict, dates, execution: str = "open", securities: pd.DataFrame | None = None,
                     delist_return: float = -1.0) -> tuple[pd.DataFrame, pd.Series]:
    """（内部）返回（前瞻收益 dates × 代码，每期结束日 t_{i+1}）。最后一个调仓日没有下一期，整行为空。

    买入价：成交日的 open_adj（开盘执行）或 close_adj（收盘执行），成交日没有价格（停牌）则为空；
    卖出价：成交日价格，停牌时用最后一个收盘价；没有下一成交日（数据末尾）时用 t_{i+1} 收盘。
    """
    close = panel["close_adj"]
    days = trading_days(close)
    dates = pd.DatetimeIndex(dates)
    has = close.notna()
    px = close.copy()
    if execution == "open" and "open_adj" in panel:
        o = panel["open_adj"].reindex_like(close)
        px = o.where(has & o.notna(), close)
    px_ff = px.where(has).combine_first(close.ffill())
    ex = execution_days(days, dates, execution)
    ends = pd.Series(list(dates[1:]) + [pd.NaT], index=dates)
    ex_end = pd.Series(list(ex.values[1:]) + [pd.NaT], index=dates)
    entry = px.where(has).reindex(ex.values)
    entry.index = dates
    exit_days = ex_end.where(ex_end.notna(), ends)
    exit_ = px_ff.reindex(ex_end.values)
    exit_.index = dates
    fallback = close.ffill().reindex(ends.values)
    fallback.index = dates
    exit_ = exit_.where(np.repeat(ex_end.notna().to_numpy()[:, None], exit_.shape[1], 1), fallback)
    fwd = exit_ / entry - 1
    if securities is not None and "delist_date" in securities:
        dl = pd.to_datetime(securities.drop_duplicates("code").set_index("code")["delist_date"]
                            .reindex(close.columns)).to_numpy()
        a = ex.to_numpy()[:, None]
        b = exit_days.to_numpy()[:, None]
        hit = (~pd.isna(dl))[None, :] & (dl[None, :] > a) & (dl[None, :] <= b)
        fwd = fwd.where(~hit, (1 + fwd) * (1 + delist_return) - 1)
    fwd[ends.isna().to_numpy()] = np.nan
    return fwd, ends


# ---------------------------------------------------------------- 统计工具
def nw_tstat(x, lag: int | None = None) -> float:
    """均值的 Newey–West t 值（lag 为空时用 floor(4 (T/100)^(2/9))）。只报告。"""
    x = pd.Series(x).dropna().to_numpy(float)
    if len(x) < 3 or np.std(x) == 0:
        return float("nan")
    lag = auto_lag(len(x)) if lag is None else lag
    res = sm.OLS(x, np.ones(len(x))).fit(cov_type="HAC", cov_kwds={"maxlags": int(lag)})
    return float(res.tvalues[0])


def auto_lag(T: int) -> int:
    return int(math.floor(4 * (T / 100) ** (2 / 9)))


def _rowcorr(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """逐行 Pearson 相关（a、b 已在同一位置置空）；任一边方差为 0 时为 NaN。"""
    with np.errstate(invalid="ignore", divide="ignore"):
        n = np.isfinite(a).sum(1)
        ma = np.nansum(a, 1) / np.maximum(n, 1)
        mb = np.nansum(b, 1) / np.maximum(n, 1)
        da, db = a - ma[:, None], b - mb[:, None]
        va, vb = np.nansum(da * da, 1), np.nansum(db * db, 1)
        cov = np.nansum(da * db, 1)
        r = cov / np.sqrt(va * vb)
    return np.where((va > 0) & (vb > 0), r, np.nan)


def _ic_series(f: pd.DataFrame, fwd: pd.DataFrame, min_obs: int = 20) -> pd.DataFrame:
    """（内部）每期 Pearson IC、Spearman RankIC（平均名次）与样本数。向量化实现。"""
    common = f.index[f.index.isin(fwd.index)]
    X = f.loc[common].to_numpy(float)
    Y = fwd.reindex(index=common, columns=f.columns).to_numpy(float)
    ok = np.isfinite(X) & np.isfinite(Y)
    n = ok.sum(1)
    Xm, Ym = np.where(ok, X, np.nan), np.where(ok, Y, np.nan)
    ic = _rowcorr(Xm, Ym)
    rx = pd.DataFrame(Xm).rank(axis=1).to_numpy()
    ry = pd.DataFrame(Ym).rank(axis=1).to_numpy()
    ric = _rowcorr(rx, ry)
    small = n < min_obs
    ic[small], ric[small] = np.nan, np.nan
    out = pd.DataFrame({"ic": ic, "rank_ic": ric, "n": n.astype(int)}, index=common)
    return out


def ic_summary(ic: pd.DataFrame, lag: int | None = None) -> dict:
    out = {}
    for c in ("ic", "rank_ic"):
        s = ic[c].dropna()
        sd = s.std(ddof=1)
        out[f"{c}_mean"] = float(s.mean()) if len(s) else float("nan")
        out[f"{c}_std"] = float(sd) if len(s) > 1 else float("nan")
        out[f"{c}_ir"] = float(s.mean() / sd) if len(s) > 1 and sd > 0 else float("nan")
        out[f"{c}_t_nw"] = nw_tstat(s, lag)
        out[f"{c}_pos"] = float((s > 0).mean()) if len(s) else float("nan")
    out["n_periods"] = int(ic["rank_ic"].notna().sum())
    return out


def spanning_regression(y: pd.Series, X: pd.DataFrame, nw_lag: int | None = None) -> dict:
    """spanning 回归：y（如前 20% 对股票池的月超额）对一组基准因子收益回归，看截距是否仍为正。"""
    df = pd.concat([pd.Series(y, name="y"), X], axis=1).dropna()
    if len(df) < X.shape[1] + 3:
        return {"n": len(df), "alpha": float("nan"), "alpha_t_nw": float("nan")}
    lag = auto_lag(len(df)) if nw_lag is None else nw_lag
    res = sm.OLS(df["y"], sm.add_constant(df.drop(columns="y"))).fit(cov_type="HAC", cov_kwds={"maxlags": lag})
    return {"n": len(df), "alpha": float(res.params["const"]), "alpha_t_nw": float(res.tvalues["const"]),
            "betas": {k: float(v) for k, v in res.params.drop("const").items()}, "r2": float(res.rsquared)}


def _wmean(r: np.ndarray, w: np.ndarray | None) -> float:
    if len(r) == 0:
        return np.nan
    if w is None:
        return float(r.mean())
    w = np.nan_to_num(w, nan=0.0)
    return float((r * w).sum() / w.sum()) if w.sum() > 0 else np.nan


def quantile_analysis(f: pd.DataFrame, fwd: pd.DataFrame, mcap: pd.DataFrame | None, n_q: int = 5,
                      direction: int = 1) -> tuple[pd.DataFrame, pd.DataFrame]:
    """每期分组收益（等权）与主序列：tmu_cap（前 1/n_q 市值加权 − 股票池市值加权）、tmu_ew、tmb_ew。

    fwd 须已按股票池置空：股票池收益用 fwd 当期全部非空的证券（= 全部入池证券，与回测基准一致），
    分组只在因子有值的证券里做（backtest.quantile_labels，并列按代码哈希）。"""
    q_rows, s_rows = {}, {}
    cols = f.columns
    keys = tie_keys(cols)
    F = f.to_numpy(float) * direction
    Y = fwd.reindex(index=f.index, columns=cols).to_numpy(float)
    W = None if mcap is None else mcap.reindex(index=f.index, columns=cols).to_numpy(float)
    for i, d in enumerate(f.index):
        y = Y[i]
        uni = np.isfinite(y)
        ok = np.isfinite(F[i]) & uni
        if ok.sum() < n_q * 2:
            continue
        lab = quantile_labels(np.where(ok, F[i], np.nan), keys, n_q)
        q_rows[d] = pd.Series({g: y[lab == g].mean() for g in range(1, n_q + 1)})
        top, bot = lab == n_q, lab == 1
        w = None if W is None else W[i]
        s_rows[d] = {"top_ew": y[top].mean(), "univ_ew": y[uni].mean(), "bottom_ew": y[bot].mean(),
                     "top_cap": _wmean(y[top], w[top]) if w is not None else np.nan,
                     "univ_cap": _wmean(y[uni], w[uni]) if w is not None else np.nan}
    qd = pd.DataFrame.from_dict(q_rows, orient="index")
    sd = pd.DataFrame.from_dict(s_rows, orient="index")
    if not sd.empty:
        sd["tmu_cap"] = sd["top_cap"] - sd["univ_cap"]
        sd["tmu_ew"] = sd["top_ew"] - sd["univ_ew"]
        sd["tmb_ew"] = sd["top_ew"] - sd["bottom_ew"]
    return qd, sd


def size_tiers(f: pd.DataFrame, fwd: pd.DataFrame, mcap: pd.DataFrame, n_q: int = 5, direction: int = 1) -> dict:
    """按每期市值三等分（小 / 中 / 大），各档内的 RankIC 均值与前 1/n_q 等权对本档等权的月超额均值。"""
    out = {}
    tier = np.ceil(mcap.reindex_like(f).where(f.notna()).rank(axis=1, pct=True) * 3).clip(1, 3)
    for k, label in ((1, "small"), (2, "mid"), (3, "large")):
        fk = f.where(tier == k)
        ic = _ic_series(fk, fwd, min_obs=10)
        _, sd = quantile_analysis(fk, fwd.where(tier.reindex_like(fwd) == k), None, n_q, direction)
        out[label] = {"rank_ic_mean": float(ic["rank_ic"].mean()),
                      "tmu_ew_mean": float(sd["tmu_ew"].mean()) if not sd.empty else float("nan"),
                      "n_periods": int(ic["rank_ic"].notna().sum())}
    return out


def top_turnover(f: pd.DataFrame, n_q: int = 5, direction: int = 1) -> pd.Series:
    """前 1/n_q 名单（与回测同一个 select_top）的换手：1 − |本期 ∩ 上期| / |本期|。"""
    prev, out = None, {}
    keys = tie_keys(f.columns)
    F = f.to_numpy(float) * direction
    for i, d in enumerate(f.index):
        if np.isfinite(F[i]).sum() < n_q:
            continue
        cur = set(np.flatnonzero(select_top(F[i], keys, 1 / n_q)).tolist())
        if prev is not None and cur:
            out[d] = 1 - len(cur & prev) / len(cur)
        prev = cur
    return pd.Series(out, dtype=float)


def cumulative_forward(fwd: pd.DataFrame, h: int) -> pd.DataFrame:
    """h 期累计前瞻收益（重叠），任一期缺失即为空。"""
    acc = 1 + fwd
    out = acc.copy()
    for j in range(1, h):
        out = out * acc.shift(-j)
    return out - 1


def decay_table(fz: pd.DataFrame, fwd: pd.DataFrame, in_zone: np.ndarray, mask: pd.DataFrame,
                max_horizon: int, lag: int | None) -> pd.DataFrame:
    """h 期累计收益的 RankIC。先按层截断（不在本层的期置空）再累计，最后只用**形成日**的股票池掩码；
    不能先用每期各自的股票池掩码再累计——那等于以「后几期仍在池内」为条件（前视）。"""
    zdates = fz.index
    fwd_zone = fwd.where(np.repeat(np.asarray(in_zone)[:, None], fwd.shape[1], 1))
    rows = []
    for h in range(1, max_horizon + 1):
        cum = cumulative_forward(fwd_zone, h).loc[zdates].where(mask.loc[zdates])
        ich = _ic_series(fz, cum)
        base_lag = auto_lag(max(int(ich["rank_ic"].notna().sum()), 1)) if lag is None else lag
        rows.append({"h": h, "rank_ic_mean": float(ich["rank_ic"].mean()),
                     "t_nw": nw_tstat(ich["rank_ic"], base_lag + h - 1),
                     "n": int(ich["rank_ic"].notna().sum())})
    return pd.DataFrame(rows).set_index("h")


# ---------------------------------------------------------------- 主入口
@dataclass
class EvalResult:
    summary: dict
    ic: pd.DataFrame
    quantiles: pd.DataFrame
    series: pd.DataFrame
    decay: pd.DataFrame
    tiers: dict
    backtests: dict = field(default_factory=dict)
    record: dict = field(default_factory=dict)
    factor: pd.DataFrame | None = None
    universe: pd.DataFrame | None = None
    segments: dict = field(default_factory=dict)   # 分段（期初日所在区间）的 RankIC 与主口径超额


def _frame_hash(df: pd.DataFrame) -> str:
    """DataFrame 因子的内容哈希（值、索引、列名；NaN 与 0 不同）。"""
    h = hashlib.sha256()
    h.update(pd.util.hash_pandas_object(df, index=True).to_numpy().tobytes())
    h.update(json.dumps([str(c) for c in df.columns]).encode())
    return "df:" + h.hexdigest()[:16]


def _source_hash(spec: FactorSpec | None, df: pd.DataFrame | None) -> str | None:
    if spec is not None:
        try:
            return stable_hash(inspect.getsource(spec.func))
        except (OSError, TypeError):
            return None
    return _frame_hash(df)


def _identity(market: str, factor, *, params=None, name=None, direction=None, universe=None, preprocess=None,
              n_quantiles=5, top_q=0.2, execution="open", delist_return=-1.0, costs=None, slippage="default",
              start=None, end=None, segments=None, min_universe=30, min_coverage=0.1):
    """因子与口径的身份：返回（spec 或 None，记录骨架，config）。evaluate_factor 与 candidate_spec 共用。"""
    params = dict(params or {})
    pp = {"mad_n": 5.0, "neutralize": None, "method": "zscore", **(preprocess or {})}
    spec = None
    if isinstance(factor, str):
        spec = get(factor)
    elif isinstance(factor, FactorSpec):
        spec = factor
    elif not isinstance(factor, pd.DataFrame):
        raise TypeError("factor 须为因子名、FactorSpec 或 DataFrame")
    fname = spec.name if spec else (name or "")
    if not fname:
        raise ValueError("DataFrame 因子必须给 name")
    version = spec.version if spec else 0
    direction = direction if direction is not None else (spec.direction if spec else 1)
    uspec = (universe or UniverseSpec()).resolved(market)
    config = {"universe": uspec.to_dict(), "preprocess": pp, "direction": direction, "n_quantiles": n_quantiles,
              "top_q": top_q, "weighting": "cap (main) + equal", "benchmark": "full universe",
              "tie_break": "sha256(tie:code)", "execution": execution,
              "delist_return": delist_return, "costs": asdict(costs or cost_model(market)),
              "slippage": "default" if slippage == "default" else (None if slippage is None else asdict(slippage)),
              "start": None if start is None else str(start), "end": None if end is None else str(end),
              "segments": None if segments is None else [str(x) for x in segments],
              "min_universe": min_universe, "min_coverage": min_coverage}
    p_hash = params_hash(fname, version, params)
    record = {"event": "evaluate", "factor": fname, "version": version, "params": params, "params_hash": p_hash,
              "config": config, "config_hash": stable_hash(config),
              "source_hash": _source_hash(spec, factor if spec is None else None),
              "factor_kind": "registered" if spec else "dataframe"}
    return spec, record, config, uspec, pp, params, direction


def candidate_spec(market: str, factor, **kw) -> dict:
    """解封时冻结的候选身份 {factor, source_hash, params_hash, config_hash}。kw 与 evaluate_factor 的口径参数
    相同（params / universe / preprocess / n_quantiles / top_q / execution / costs / slippage / start / end …），
    确认评估时必须给出完全相同的参数。DataFrame 因子不能做候选。"""
    if isinstance(factor, pd.DataFrame):
        raise TypeError("DataFrame（临时）因子不能做锁箱候选：请注册为因子并提交代码")
    _, rec, *_ = _identity(market, factor, **kw)
    return {k: rec[k] for k in CANDIDATE_FIELDS}


def _cap_weights(panel: dict, adv: AdvCache | None, dates, cols, mask: pd.DataFrame) -> tuple[pd.DataFrame | None, dict]:
    """主口径的加权基数：流通市值；某调仓日池内有市值的比例 < 50%（美股、港股早年）时该日改用
    t 之前 20 日成交额中位数作代理。返回（调仓日 × 代码 的基数，{'cap': 天数, 'adv_proxy': 天数}）。"""
    m = panel["mcap_float"].reindex(index=dates, columns=cols) if "mcap_float" in panel else None
    mk = mask.reindex(index=dates, columns=cols).to_numpy()
    if m is not None:
        mv = m.to_numpy(float)
        cov = (mk & np.isfinite(mv) & (mv > 0)).sum(1) / np.maximum(mk.sum(1), 1)
        use = cov < MCAP_MIN_COVERAGE
    else:
        mv = np.full(mk.shape, np.nan)
        use = np.ones(len(dates), dtype=bool)
    if use.any() and adv is not None:
        mv = mv.copy()
        mv[use] = adv.at(pd.DatetimeIndex(dates)[use], cols).to_numpy(float)
    applied = {"cap": int((~use).sum()), "adv_proxy": int(use.sum()) if adv is not None else 0}
    if m is None and adv is None:
        return None, applied
    return pd.DataFrame(mv, index=dates, columns=cols), applied


def evaluate_factor(market: str, factor, *, panel: dict | None = None, securities: pd.DataFrame | None = None,
                    mode: str = "explore", token: UnsealToken | None = None, prereg: str | None = None,
                    start=None, end=None, params: dict | None = None, name: str | None = None,
                    direction: int | None = None, universe: UniverseSpec | None = None,
                    preprocess: dict | None = None, n_quantiles: int = 5, top_q: float = 0.2,
                    execution: str = "open", delist_return: float = -1.0, nw_lag: int | None = None,
                    max_horizon: int = 6, segments=None, run_backtest: bool = True, costs: CostModel | None = None,
                    slippage="default", min_universe: int = 30, min_coverage: float = 0.1,
                    parent: str | None = None, family: str | None = None,
                    motivation: str = "mining", note: str = "", repo=None) -> EvalResult:
    """评估一个因子并自动记账（登记簿、锁箱配置路径固定，不能由调用方更换）。

    factor：已注册因子名、FactorSpec，或现成的 调仓日 × 代码 DataFrame（须给 name；只能用于 explore / validate）。
    mode：'explore'（70% 证券、锁箱前）| 'validate'（另 30%）
          | 'confirm'（锁箱，须 token，且（因子名、源码哈希、参数哈希、配置哈希）与解封时冻结的候选完全一致，
            每个候选只能确认一次）| 'forward'（前推区，须 prereg：真实提交、含列出本因子的预注册文件）。
    preprocess：{'mad_n': 5, 'neutralize': None | 'size' | 'size+industry', 'method': 'zscore' | 'rank' | 'raw'}。
    min_universe / min_coverage：层内平均股票池只数、因子平均覆盖率低于此值时报错（记 status='error'），
    不静默给出空结果。
    motivation：'literature'（文献）| 'mining'（挖掘）等，写进登记簿。
    segments：分段报告的切点（默认 A 股 2017-01-01、2024-01-01）。
    """
    ledger = TrialLedger()
    lockbox = Lockbox()
    spec, record, config, uspec, pp, params, direction = _identity(
        market, factor, params=params, name=name, direction=direction, universe=universe, preprocess=preprocess,
        n_quantiles=n_quantiles, top_q=top_q, execution=execution, delist_return=delist_return, costs=costs,
        slippage=slippage, start=start, end=end, segments=segments, min_universe=min_universe,
        min_coverage=min_coverage)
    fname, p_hash, c_hash = record["factor"], record["params_hash"], record["config_hash"]
    record.update(mode=mode, zone=mode, parent=parent, family=family or fname, motivation=motivation, note=note)

    if mode not in ("explore", "validate", "confirm", "forward"):
        raise ValueError(f"未知 mode：{mode}")
    if spec is not None and market not in spec.markets:
        raise ValueError(f"因子 {fname} 未声明适用于市场 {market}（markets={spec.markets}）")
    # confirm 全程持登记簿锁：「是否已确认过」的检查与记账之间不会有别的进程插进来（每个候选只确认一次）
    held = mode == "confirm"
    lock = ledger.locked() if held else contextlib.nullcontext()
    lock.__enter__()
    try:
        try:
            if mode in ("confirm", "forward") and spec is None:
                raise PermissionError(f"{mode} 不接受 DataFrame（临时）因子：候选必须是已注册、已提交代码的因子")
            if mode == "confirm":
                if token is None or not lockbox.is_valid(token, market):
                    raise PermissionError("confirm 需要本市场有效的批量解封凭证")
                key = trial_key(record)
                if key not in tuple(token.candidates):
                    same = [c for c in token.candidates if c[0] == fname]
                    if not same:
                        raise PermissionError(f"{fname} 不在批次 {token.batch_id} 的预注册候选里")
                    diff = [CANDIDATE_FIELDS[i] for i in range(1, 4) if same[0][i] != key[i]]
                    raise PermissionError(f"{fname} 与批次 {token.batch_id} 解封时冻结的写法不一致（{diff} 不同）")
                if ledger.confirmed(market, token.batch_id, key):
                    raise PermissionError(f"{fname} 已在批次 {token.batch_id} 确认过一次，不能重复确认")
                record.update(batch_id=token.batch_id, preregs=list(token.preregs))
            if mode == "forward":
                if not prereg:
                    raise PermissionError("forward 需要已提交的预注册（prereg）")
                record["prereg"] = verify_prereg(prereg, repo, [fname])[0]
                if token is not None:
                    record["batch_id"] = token.batch_id

            frac = lockbox.explore_frac
            if panel is None:
                fields = sorted(set(PANEL_FIELDS) | set(spec.needs if spec else ()) | {"open_adj"})
                md = data_mod.load_market(market, fields, mode, token, prereg=record.get("prereg"), repo=repo,
                                          log=False)
                panel, snapshot = md.panel, md.snapshot
                securities = (md.securities if securities is None else
                              data_mod.guard_securities(securities, mode, md.visible_end, md.hidden, frac))
            else:
                end_ex, hidden = lockbox.window(market, mode, token, prereg_ok=mode == "forward")
                panel = data_mod.add_open_adj(data_mod.restrict_codes(truncate_panel(panel, end_ex, hidden), mode, frac))
                securities = data_mod.guard_securities(securities, mode, end_ex, hidden, frac)
                snapshot = "external-panel"
            record["data_snapshot"] = snapshot

            days = trading_days(panel["close_adj"])
            dates = month_end_dates(days)
            adv = AdvCache(panel["amount"], uspec.amount_window) if "amount" in panel else None
            mask = build_universe(panel, dates, market, securities, uspec, adv=adv)
            record["universe_applied"] = {"size_screen": dict(mask.attrs.get("size_screen", {}))}
            part = split_codes(mask.columns, mode, frac)
            mask.loc[:, ~mask.columns.isin(part)] = False

            raw = spec(panel, dates, **params) if spec else factor.reindex(index=dates, columns=mask.columns)
            raw = raw.reindex(columns=mask.columns)
            log_size = None
            if pp["neutralize"] in ("size", "size+industry") and "mcap_float" in panel:
                m = panel["mcap_float"].reindex(index=dates, columns=mask.columns)
                log_size = np.log(m.where(m > 0))
            industry = panel.get("industry") if pp["neutralize"] == "size+industry" else None
            if pp["neutralize"] == "size+industry" and industry is None:
                record["preprocess_applied"] = "size only（没有点时行业）"
            f = standard_pipeline(raw, mask, pp["mad_n"], log_size,
                                  None if industry is None else industry.reindex(index=dates, columns=mask.columns),
                                  pp["method"])

            fwd, ends = _forward_returns(panel, dates, execution, securities, delist_return)
            in_zone = lockbox.period_in_zone(dates, ends.reindex(dates), market, mode)
            if start is not None:
                in_zone &= dates >= pd.Timestamp(start)
            if end is not None:
                in_zone &= (ends.reindex(dates) <= pd.Timestamp(end)).to_numpy()
            zdates = dates[in_zone]
            if len(zdates) < 3:
                raise ValueError(f"{mode} 层内可用的调仓期不足（{len(zdates)} 期）")
            mz = mask.loc[zdates]
            usize = float(mz.sum(axis=1).mean())
            if not usize >= min_universe:
                raise ValueError(f"{mode} 层内平均股票池只有 {usize:.1f} 只（< min_universe={min_universe}）："
                                 f"检查数据字段（市值 / 成交额 / 价格）与股票池口径 {record['universe_applied']}")
            fz, fwdz = f.loc[zdates], fwd.loc[zdates].where(mz)
            cov = (fz.notna() & mz).sum(axis=1) / mz.sum(axis=1).replace(0, np.nan)
            if not float(cov.mean()) >= min_coverage:
                raise ValueError(f"因子 {fname} 在股票池内的平均覆盖率只有 {float(cov.mean()):.1%}（< min_coverage={min_coverage}）")
            wbase, w_applied = _cap_weights(panel, adv, zdates, mask.columns, mask)
            record["weighting_applied"] = w_applied
            mcap = panel["mcap_float"].reindex(index=zdates, columns=mask.columns) if "mcap_float" in panel else None

            lag = nw_lag
            ic = _ic_series(fz, fwdz)
            summ = ic_summary(ic, lag)
            qd, sd = quantile_analysis(fz, fwdz, wbase, n_quantiles, direction)
            decay = decay_table(fz, fwd, in_zone, mask, max_horizon, lag)
            tiers = (size_tiers(fz, fwdz, mcap, n_quantiles, direction)
                     if mcap is not None and w_applied["adv_proxy"] == 0 else {})
            turn = top_turnover(fz, n_quantiles, direction)

            tmu = sd["tmu_cap"] if "tmu_cap" in sd else pd.Series(dtype=float)
            t_tmu = nw_tstat(tmu, lag)
            sr = float(tmu.mean() / tmu.std(ddof=1)) if tmu.notna().sum() > 2 and tmu.std(ddof=1) > 0 else float("nan")
            summ.update({
                "tmu_cap_mean": float(tmu.mean()), "tmu_cap_t_nw": t_tmu,
                "p_tmu": float(1 - stats.norm.cdf(t_tmu)) if np.isfinite(t_tmu) else float("nan"),
                "tmu_ew_mean": float(sd["tmu_ew"].mean()) if "tmu_ew" in sd else float("nan"),
                "tmb_ew_mean": float(sd["tmb_ew"].mean()) if "tmb_ew" in sd else float("nan"),
                "sr_period": sr, "top_turnover_mean": float(turn.mean()), "coverage_mean": float(cov.mean()),
                "universe_size_mean": usize,
                "first_period": str(zdates[0].date()), "last_period_end": str(ends[zdates[-1]].date()),
            })
            cuts = [pd.Timestamp(c) for c in (segments if segments is not None else DEFAULT_SEGMENTS.get(market, ()))]
            tiers_seg = {}
            if cuts:
                edges = [pd.Timestamp.min, *cuts, pd.Timestamp.max]
                for a, b in zip(edges[:-1], edges[1:]):
                    sel = [d for d in zdates if a <= d < b]
                    if sel:
                        label = f"{'' if a == pd.Timestamp.min else a.date()}–{'' if b == pd.Timestamp.max else b.date()}"
                        tiers_seg[label] = {"rank_ic_mean": float(ic["rank_ic"].reindex(sel).mean()),
                                            "tmu_cap_mean": float(tmu.reindex(sel).mean()), "n_periods": len(sel)}

            bts = {}
            if run_backtest:
                ex_end = execution_days(days, pd.DatetimeIndex([ends[zdates[-1]]]), execution).iloc[0]
                bt_end = ex_end if pd.notna(ex_end) else ends[zdates[-1]]
                bt_panel = panel if w_applied["adv_proxy"] == 0 or wbase is None else {**panel, "mcap_float": wbase}
                for wname in ("cap", "equal"):
                    bts[wname] = _backtest_vs_universe(
                        f.loc[zdates], bt_panel, market, mz, direction=direction, top_q=top_q,
                        weighting=wname, execution=execution, costs=costs, slippage=slippage,
                        securities=securities, delist_return=delist_return, end=bt_end, adv=adv)
                for wname, b in bts.items():
                    summ[f"bt_{wname}_excess_cagr"] = b["stats"]["excess_cagr"]
                    summ[f"bt_{wname}_excess_ir"] = b["stats"]["excess_ir"]
                    summ[f"bt_{wname}_top_cagr"] = b["stats"]["top"]["cagr"]
                    summ[f"bt_{wname}_top_sharpe"] = b["stats"]["top"]["sharpe"]
                    summ[f"bt_{wname}_top_maxdd"] = b["stats"]["top"]["maxdd"]
                    summ[f"bt_{wname}_turnover"] = b["stats"]["top"]["turnover_per_rebalance"]
                summ["capacity_median_pos_adv"] = bts["cap"]["stats"]["capacity"]["median"]

            series = sd.reindex(columns=["tmu_cap", "tmu_ew", "tmb_ew", "top_cap", "univ_cap", "top_ew", "univ_ew"])
            series["rank_ic"] = ic["rank_ic"]
            series.index = pd.DatetimeIndex([ends[d] for d in series.index], name="date")  # 以期末日期为索引
            trial_id = f"{pd.Timestamp.now(tz='UTC'):%Y%m%dT%H%M%S%f}-{fname}-{p_hash[:6]}-{c_hash[:6]}"
            record.update(trial_id=trial_id, status="ok",
                          sample={"first_period": summ["first_period"], "last_period_end": summ["last_period_end"],
                                  "n_periods": summ["n_periods"]},
                          stats={k: (None if isinstance(v, float) and not np.isfinite(v) else v) for k, v in summ.items()},
                          segments=tiers_seg,
                          series_path=ledger.save_series(market, trial_id, series))
            record = ledger.append(market, record, _locked=held)
            return EvalResult(summ, ic, qd, series, decay, tiers, bts, record, f, mask, tiers_seg)
        except Exception as e:
            record.update(status="refused" if isinstance(e, PermissionError) else "error",
                          error=f"{type(e).__name__}: {e}", trace=traceback.format_exc(limit=3)[-800:])
            ledger.append(market, record, _locked=held)
            raise
    finally:
        lock.__exit__(None, None, None)
