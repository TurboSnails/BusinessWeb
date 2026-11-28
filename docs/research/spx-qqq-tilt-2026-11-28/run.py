"""L-049 主实现（Python）。严格按 PREREG.md（15b95bb2）与 manager 口径裁定执行。

  cd research-py && uv run python ../docs/research/spx-qqq-tilt-2026-11-28/run.py
"""
from __future__ import annotations

import hashlib
import json
import math
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = (HERE.parents[2] / "data-raw" / "spx-qqq-tilt" / "raw").resolve()
SOURCES = RAW.parent / "SOURCES.md"
OUT = HERE / "results.json"
SCHEMA_NOTE = HERE / "results.schema.json"

SEED = 20261128
FEE_Y = 0.001
COST = 0.0005  # 单边
SPREAD_MAIN = 0.015
SPREAD_HI = 0.03
FIXED_FIN = 0.06
YEAR_LEN = 365.2425

MAIN_W = ("1927-01-03", "1972-12-29")
HALF1 = ("1927-01-03", "1949-12-31")
HALF2 = ("1950-01-01", "1972-12-29")
VETO_KF = ("1973-01-02", "1984-12-31")
VETO_ETF = ("1999-03-10", "2026-11-27")
REPORT_NDX = ("1985-10-01", "1999-03-09")


# ───────────── IO ─────────────
def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def read_kf_daily(zip_name: str) -> pd.DataFrame:
    with zipfile.ZipFile(RAW / zip_name) as z:
        text = z.read(z.namelist()[0]).decode("latin-1")
    lines = text.splitlines()
    i = None
    for k, l in enumerate(lines):
        if not l.startswith(","):
            continue
        nxt = lines[k + 1] if k + 1 < len(lines) else ""
        if nxt[:8].isdigit() and len(nxt.split(",")[0].strip()) == 8:
            i = k
            break
    assert i is not None, zip_name
    cols = [c.strip() for c in lines[i].split(",")][1:]
    rows = []
    for l in lines[i + 1 :]:
        parts = [p.strip() for p in l.split(",")]
        if len(parts) < 2 or not parts[0].isdigit() or len(parts[0]) != 8:
            break
        rows.append([parts[0]] + [float(x) for x in parts[1:]])
    df = pd.DataFrame(rows, columns=["date"] + cols)
    df["date"] = pd.to_datetime(df["date"], format="%Y%m%d")
    df = df.set_index("date").sort_index()
    df = df.mask(df <= -99.99 + 1e-6)
    return df / 100.0


def read_yahoo(name: str) -> pd.Series:
    df = pd.read_csv(RAW / f"yahoo_{name}_daily.csv", parse_dates=["date"])
    df = df.dropna(subset=["adjclose"]).set_index("date").sort_index()
    px = df["adjclose"].astype(float)
    r = px.pct_change()
    return r.dropna()


def window_meta(idx: pd.DatetimeIndex) -> dict:
    start, end = idx[0], idx[-1]
    n = len(idx)
    years = (end - start).days / YEAR_LEN
    A = n / years if years > 0 else float("nan")
    return {
        "start": start.strftime("%Y-%m-%d"),
        "end": end.strftime("%Y-%m-%d"),
        "nDays": int(n),
        "years": float(years),
        "A": float(A),
    }


def slice_df(df: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    return df.loc[start:end]


# ───────────── metrics ─────────────
def max_dd(nav: np.ndarray) -> tuple[float, int]:
    peak = nav[0]
    mdd = 0.0
    start_i = 0
    best = (0.0, 0)
    for i, v in enumerate(nav):
        if v >= peak:
            peak = v
            start_i = i
        dd = v / peak - 1.0
        if dd < mdd:
            mdd = dd
            best = (mdd, i - start_i)
    return float(best[0]), int(best[1])


def daily_metrics(r: np.ndarray, rf: np.ndarray, A: float, years: float | None = None) -> dict:
    nav = np.cumprod(1.0 + r)
    # 年化收益 = (终值/初值)^(1/年数)−1；年数用日历年（若未传入则用 N/A）
    y = years if years is not None else (len(r) / A if A else float("nan"))
    cagr = float(nav[-1] ** (1.0 / y) - 1.0) if y and y > 0 and len(r) else float("nan")
    vol = float(np.std(r, ddof=1) * math.sqrt(A)) if len(r) > 1 else float("nan")
    ex = r - rf
    sharpe = float(np.mean(ex) / np.std(ex, ddof=1) * math.sqrt(A)) if np.std(ex, ddof=1) > 0 else float("nan")
    mdd, mdd_days = max_dd(nav)
    return {"nDays": int(len(r)), "cagr": cagr, "vol": vol, "sharpeDaily": sharpe, "maxDd": mdd, "maxDdDays": mdd_days}


def month_compound(r: pd.Series) -> pd.Series:
    g = (1.0 + r).groupby(r.index.to_period("M")).prod() - 1.0
    g.index = g.index.to_timestamp()
    return g


def monthly_metrics(rm: np.ndarray, rfm: np.ndarray) -> dict:
    if len(rm) < 2:
        return {"nMonths": int(len(rm)), "sharpe": float("nan"), "cerG5": float("nan"), "cerG3": float("nan")}
    ex = rm - rfm
    sd = float(np.std(ex, ddof=1))
    sharpe = float(np.mean(ex) / sd * math.sqrt(12)) if sd > 0 else float("nan")

    def cer(gamma: float) -> float:
        if np.any(1.0 + rm <= 0):
            return float("-inf")
        u = np.mean((1.0 + rm) ** (1.0 - gamma))
        if u <= 0:
            return float("-inf")
        m = u ** (1.0 / (1.0 - gamma)) - 1.0
        return float((1.0 + m) ** 12 - 1.0)

    return {"nMonths": int(len(rm)), "sharpe": sharpe, "cerG5": cer(5.0), "cerG3": cer(3.0)}


def tracking_error_annual(ra: pd.Series, rb: pd.Series) -> float:
    d = (ra - rb).dropna()
    if len(d) < 2:
        return float("nan")
    return float(np.std(d.to_numpy(), ddof=1) * math.sqrt(12))


def worst_rolling36(rel: pd.Series) -> dict:
    # rel = cumulative relative wealth month-end ratio growth: compound (1+ra)/(1+rb)-1 over 36m
    if len(rel) < 36:
        return {"rel": float("nan"), "from": None, "to": None}
    wealth = (1.0 + rel).cumprod()
    best = (0.0, None, None)
    for i in range(35, len(wealth)):
        v = wealth.iloc[i] / wealth.iloc[i - 35] - 1.0
        if best[1] is None or v < best[0]:
            best = (float(v), wealth.index[i - 35].strftime("%Y-%m"), wealth.index[i].strftime("%Y-%m"))
    return {"rel": best[0], "from": best[1], "to": best[2]}


# ───────────── tails ─────────────
def prior_high_segments(I: np.ndarray, dates: pd.DatetimeIndex, min_drop: float = -0.10) -> list[tuple]:
    """回到前高为一段结束；返回 (peak_i, trough_i, drop)。"""
    segs = []
    peak_i = 0
    peak = I[0]
    trough_i = 0
    trough = I[0]
    in_dd = False
    for i in range(1, len(I)):
        if I[i] >= peak:
            if in_dd and trough / peak - 1.0 <= min_drop:
                segs.append((peak_i, trough_i, trough / peak - 1.0))
            peak, peak_i = I[i], i
            trough, trough_i = I[i], i
            in_dd = False
        else:
            in_dd = True
            if I[i] < trough:
                trough, trough_i = I[i], i
    if in_dd and trough / peak - 1.0 <= min_drop:
        segs.append((peak_i, trough_i, trough / peak - 1.0))
    segs.sort(key=lambda x: x[2])
    return segs[:6]


def polyline_segments(I: np.ndarray, min_drop: float = -0.10, rebound: float = 0.20) -> list[tuple]:
    """折线法：低点反弹≥20%后再下跌算新段；取跌幅≥10%最深6段。"""
    n = len(I)
    if n < 3:
        return []
    segs = []
    peak_i = 0
    peak = I[0]
    trough_i = 0
    trough = I[0]
    state = "down"  # after peak looking for trough, or after trough looking for rebound then new peak
    i = 1
    while i < n:
        if state == "down":
            if I[i] >= peak:
                peak, peak_i = I[i], i
                trough, trough_i = I[i], i
            elif I[i] < trough:
                trough, trough_i = I[i], i
            # rebound from trough?
            if trough < peak and I[i] >= trough * (1.0 + rebound):
                drop = trough / peak - 1.0
                if drop <= min_drop:
                    segs.append((peak_i, trough_i, drop))
                # new local peak search starts from current
                peak, peak_i = I[i], i
                trough, trough_i = I[i], i
                state = "down"
        i += 1
    # unfinished
    if trough < peak:
        drop = trough / peak - 1.0
        if drop <= min_drop:
            segs.append((peak_i, trough_i, drop))
    # unique by trough, keep deepest
    segs.sort(key=lambda x: x[2])
    return segs[:6]


def L_ratio(cand_nav: np.ndarray, bench_nav: np.ndarray, segs: list[tuple]) -> tuple[float, list]:
    events = []
    sum_c = 0.0
    sum_b = 0.0
    for p, t, _ in segs:
        dc = cand_nav[t] / cand_nav[p] - 1.0
        db = bench_nav[t] / bench_nav[p] - 1.0
        sum_c += dc
        sum_b += db
        events.append((p, t, dc, db))
    L = (sum_c / sum_b) if sum_b != 0 else float("nan")
    return float(L), events


def ath_episodes(I: np.ndarray) -> list[tuple[int, int, int, float]]:
    """独立回撤段：峰 → 谷 → 回到前高。返回 (peak_i, trough_i, recovery_i, drop)。未恢复则 recovery=末日前。"""
    episodes: list[tuple[int, int, int, float]] = []
    peak_i, peak = 0, I[0]
    trough_i, trough = 0, I[0]
    in_dd = False
    for i in range(1, len(I)):
        if not in_dd:
            if I[i] >= peak:
                peak_i, peak = i, I[i]
                trough_i, trough = i, I[i]
            else:
                in_dd = True
                trough_i, trough = i, I[i]
        else:
            if I[i] < trough:
                trough_i, trough = i, I[i]
            if I[i] >= peak:
                episodes.append((peak_i, trough_i, i, float(trough / peak - 1.0)))
                peak_i, peak = i, I[i]
                trough_i, trough = i, I[i]
                in_dd = False
    if in_dd:
        episodes.append((peak_i, trough_i, len(I) - 1, float(trough / peak - 1.0)))
    return episodes


def cer_monthly_series(rm: pd.Series, rfm: pd.Series) -> float:
    com = rm.index.intersection(rfm.index)
    return monthly_metrics(rm.loc[com].to_numpy(), rfm.loc[com].to_numpy())["cerG5"]


def read_shiller() -> pd.DataFrame:
    df = pd.read_csv(RAW / "shiller.csv", parse_dates=["date"])
    df = df.set_index("date").sort_index()
    df["yield_ann"] = df["D"] / df["P"]
    return df


def dividend_augmented_returns(price_r: pd.Series, kind: str, shiller: pd.DataFrame, A: float) -> pd.Series:
    """价格收益 + 股息近似。GSPC：Shiller 年化股息率按月摊到日；NDX：0.6%/年 ÷ A。"""
    r = price_r.copy()
    if kind == "ndx":
        return r + (0.006 / A)
    # gspc
    out = r.to_numpy().copy()
    idx = r.index
    for ym, grp in r.groupby(idx.to_period("M")):
        month_ts = ym.to_timestamp()
        # Shiller 月度行：取当月或此前最近
        sh = shiller.loc[: month_ts]
        if len(sh) == 0:
            yld = 0.0
        else:
            yld = float(sh["yield_ann"].iloc[-1])
        n = len(grp)
        daily = (yld / 12.0) / n if n else 0.0
        out[r.index.get_indexer(grp.index)] = r.loc[grp.index].to_numpy() + daily
    return pd.Series(out, index=idx)


# ───────────── engine（CLARIFY-2：每日处理顺序） ─────────────
@dataclass
class PathResult:
    r: pd.Series
    turnover: float
    rebalances: int
    extra: dict


def apply_leg_fee(r: pd.Series, A: float) -> pd.Series:
    return r - FEE_Y / A


LEV = 1.30
DRIFT_LO, DRIFT_HI = 1.25, 1.35
LIQ_EXPO = 2.0


def simulate(
    legs: list[np.ndarray],
    weights: list[float],
    rf: np.ndarray,
    A: float,
    *,
    fee: bool = True,
    spread: float = SPREAD_MAIN,
    fixed_fin: float | None = None,
    cost: float = COST,
    band: tuple[float, float] | None = None,
    yearend: np.ndarray | None = None,
    state: np.ndarray | None = None,
    drift: bool = True,
    dates: pd.DatetimeIndex | None = None,
    log_trades: bool = False,
    init_lev: bool = False,
) -> dict:
    """CLARIFY-2 §1 每日 t 收盘顺序：
    1 各腿 S_i ← S_i(1+r_i,t − fee/A)；2 现金 C≥0 按 RF 计息，C<0（负债）按 RF+利差/A（或固定利率/A）；
    3 NAV；4 执行 t−1 收盘产生的指令（目标 = 目标权重 × NAV_t × 目标暴露，成本 = cost×Σ|ΔS| 从现金扣）；
    5 强平（NAV≤0 或 ΣS/NAV≥2.0 → 收盘清仓，此后持现金）；6 用第 4 步后的持仓与 t 收盘数据产生信号，t+1 执行。

    首日建仓：窗口首日前收盘按目标权重持有、NAV=1、不计成本（首日即承担首日收益）。
    band=(lo,hi)：第二条腿的内部比例 S_1/ΣS 越界 → 指令调回目标比例（K1）。
    yearend[i]：日历年最后交易日收盘产生再平衡指令（E3 年度）。
    state[i]：K2 信号状态（True=应加杠杆）。状态由 False→True 产生进入指令（→1.30），True→False 产生退出指令（→1.00），
    保持 True 且暴露越出 [1.25,1.35] 产生漂移调回指令（→1.30）；同日退出与漂移只执行退出。
    任一指令都按目标权重重设各腿（E6 两腿 70/30 同比放大），带状/年度指令的目标暴露 = 当前状态的目标暴露。
    """
    n = len(rf)
    k = len(legs)
    feed = FEE_Y / A if fee else 0.0
    L = [np.asarray(x, dtype=float).tolist() for x in legs]
    rfl = np.asarray(rf, dtype=float).tolist()
    sp = spread / A
    fx = (fixed_fin / A) if fixed_fin is not None else None
    st = None if state is None else np.asarray(state, dtype=bool).tolist()
    ye = None if yearend is None else np.asarray(yearend, dtype=bool).tolist()
    w = list(weights)
    e0 = LEV if init_lev else 1.0  # 补充裁定 8：起步状态为加杠杆时以 1.30 倍建仓（不计成本）
    S = [wj * e0 for wj in w]
    C = 1.0 - e0
    nav_arr = [0.0] * n
    expo_arr = [0.0] * n
    poslev_arr = [False] * n
    order: float | None = None
    order_act: str | None = None
    cur_lev = bool(init_lev)  # 信号层面的杠杆状态（已发出进入指令、未发出退出指令）
    pos_lev = bool(init_lev)  # 持仓层面（进入指令已执行、退出指令未执行）
    turn_day = [0.0] * n
    act_day: list[str | None] = [None] * n
    turn_sum = 0.0
    n_exec = 0
    n_enter_exit = 0
    liquidated = False
    liq_i: int | None = None
    trades: list[dict] = []
    for i in range(n):
        # 1 持仓随行情
        for j in range(k):
            S[j] *= 1.0 + L[j][i] - feed
        # 2 现金与负债计息
        if C >= 0.0:
            C *= 1.0 + rfl[i]
        else:
            C *= 1.0 + (fx if fx is not None else rfl[i] + sp)
        # 3 净值
        stock = 0.0
        for j in range(k):
            stock += S[j]
        nav = stock + C
        # 4 执行昨日指令
        if order is not None:
            tv = 0.0
            for j in range(k):
                new = w[j] * nav * order
                d = new - S[j]
                tv += abs(d)
                C -= d
                S[j] = new
            c = cost * tv
            C -= c
            turn_sum += tv / nav if nav > 0 else 0.0
            turn_day[i] = tv / nav if nav > 0 else 0.0
            act_day[i] = order_act
            n_exec += 1
            if order_act == "enter":
                pos_lev = True
                n_enter_exit += 1
            elif order_act == "exit":
                pos_lev = False
                n_enter_exit += 1
            stock = 0.0
            for j in range(k):
                stock += S[j]
            nav = stock + C
            order = None
            order_act = None
        # 5 强平（补充裁定 7：清仓成交额 Σ|S| 按同一成本率计成本）
        if not liquidated and (nav <= 0.0 or stock / nav >= LIQ_EXPO):
            liq_tv = 0.0
            for j in range(k):
                liq_tv += abs(S[j])
            C = nav - cost * liq_tv
            nav = C
            S = [0.0] * k
            stock = 0.0
            liquidated = True
            liq_i = i
            pos_lev = False
        nav_arr[i] = nav
        expo_arr[i] = stock / nav if nav > 0 else float("nan")
        poslev_arr[i] = pos_lev
        if liquidated or i == n - 1:
            continue
        # 6 信号
        act = None
        tgt = None
        if st is not None:
            want = st[i]
            if want and not cur_lev:
                act, tgt, cur_lev = "enter", LEV, True
            elif (not want) and cur_lev:
                act, tgt, cur_lev = "exit", 1.0, False
            elif want and cur_lev and drift:
                e = stock / nav
                if e < DRIFT_LO or e > DRIFT_HI:
                    act, tgt = "rebalance", LEV
        if act is None and band is not None and stock > 0:
            w1 = S[1] / stock
            if w1 < band[0] or w1 > band[1]:
                act, tgt = "band", (LEV if cur_lev else 1.0)
        if act is None and ye is not None and ye[i]:
            act, tgt = "yearend", (LEV if cur_lev else 1.0)
        if act is not None:
            order, order_act = tgt, act
            if log_trades and dates is not None:
                trades.append({
                    "signalDate": str(dates[i].date()),
                    "execDate": str(dates[i + 1].date()),
                    "action": act,
                    "exposure": float(tgt),
                    "_ei": i + 1,
                })
    nav_np = np.array(nav_arr)
    r = np.empty(n)
    prev = 1.0
    for i in range(n):
        cur = nav_np[i]
        if prev <= 0.0:
            r[i] = 0.0
        elif cur <= 0.0:
            r[i] = -1.0
        else:
            r[i] = cur / prev - 1.0
        prev = cur
    for t in trades:
        ei = t.pop("_ei")
        t["nav"] = float(nav_np[ei])
        t["navPrev"] = float(nav_np[ei - 1])
        t["navChange"] = float(nav_np[ei] / nav_np[ei - 1] - 1.0) if nav_np[ei - 1] > 0 else None
        t["exposureAfter"] = float(expo_arr[ei])
    return {
        "r": r,
        "nav": nav_np,
        "exposure": np.array(expo_arr),
        "posLev": np.array(poslev_arr, dtype=bool),
        "turnDay": np.array(turn_day),
        "actDay": act_day,
        "turnSum": turn_sum,
        "nExec": n_exec,
        "nEnterExit": n_enter_exit,
        "liquidated": liquidated,
        "liqIndex": liq_i,
        "trades": trades,
    }


def year_end_flags(idx: pd.DatetimeIndex) -> np.ndarray:
    yrs = idx.year.to_numpy()
    flags = np.zeros(len(idx), dtype=bool)
    flags[:-1] = yrs[:-1] != yrs[1:]
    # 窗口末日若恰为日历年最后交易日，其指令落在窗口外，不执行（simulate 末日不产生指令）
    flags[-1] = True
    return flags


def run_k1(
    m: pd.Series,
    g: pd.Series,
    rf: pd.Series,
    A: float,
    band: float | None = 0.05,
    target_g: float = 0.30,
    cost: float = COST,
    fee: bool = True,
    yearend: bool = False,
) -> PathResult:
    """M/G 两腿按目标比例建仓后漂移；band 越界或（yearend=True 时）年末产生指令，t+1 收盘调回。band=None 且 yearend=False 即从不再平衡。"""
    idx = m.index.intersection(g.index).intersection(rf.index)
    m, g, rf = m.loc[idx], g.loc[idx], rf.loc[idx]
    sim = simulate(
        [m.to_numpy(), g.to_numpy()],
        [1.0 - target_g, target_g],
        rf.to_numpy(),
        A,
        fee=fee,
        cost=cost,
        band=(target_g - band, target_g + band) if band is not None else None,
        yearend=year_end_flags(idx) if yearend else None,
    )
    years = len(idx) / A
    return PathResult(
        pd.Series(sim["r"], index=idx),
        sim["turnSum"] / years / 2.0 if years else float("nan"),
        sim["nExec"],
        {"liquidated": sim["liquidated"], "turnDay": pd.Series(sim["turnDay"], index=idx),
         "actDay": pd.Series(sim["actDay"], index=idx, dtype=object)},
    )


def k2_signal_frame(level: pd.Series) -> pd.DataFrame:
    """信号序列 I（含息总收益指数，全历史）；高点 = 起点以来滚动最大；SMA200 含当日；前 200 日为 NaN。"""
    I = level.to_numpy(dtype=float)
    peak = np.maximum.accumulate(I)
    sma = level.rolling(200, min_periods=200).mean().to_numpy()
    return pd.DataFrame({"I": I, "dd": I / peak - 1.0, "sma": sma}, index=level.index)


def k2_state(sig: pd.DataFrame, dd_enter: float = -0.20, dd_exit: float = -0.05, use_ma: bool = True) -> np.ndarray:
    """K2 信号状态序列（从 sig 首日、未加杠杆起算）。相等时状态不变；SMA 缺失（前 200 日）不进入。"""
    I = sig["I"].to_numpy()
    dd = sig["dd"].to_numpy()
    sma = sig["sma"].to_numpy()
    n = len(I)
    out = np.zeros(n, dtype=bool)
    lev = False
    for i in range(n):
        has = not math.isnan(sma[i])
        if not lev:
            if dd[i] <= dd_enter and (not use_ma or (has and I[i] > sma[i])):
                lev = True
        else:
            if (use_ma and has and I[i] < sma[i]) or dd[i] > dd_exit:
                lev = False
        out[i] = lev
    return out


def k2_window_state(sig_full: pd.DataFrame, idx: pd.DatetimeIndex, dd_enter: float = -0.20, dd_exit: float = -0.05,
                    use_ma: bool = True) -> tuple[np.ndarray, bool]:
    """补充裁定 8：状态机在全历史信号上从头跑；窗口内状态为其切片，起步状态 = 窗口首日前一个收盘的状态。"""
    st_full = k2_state(sig_full, dd_enter, dd_exit, use_ma)
    pos = sig_full.index.get_indexer(idx)
    assert (pos >= 0).all() and (np.diff(pos) == 1).all(), "窗口须是信号序列的连续切片"
    init = bool(st_full[pos[0] - 1]) if pos[0] > 0 else False
    return st_full[pos], init


def run_k2(
    m_leg: pd.Series,
    rf: pd.Series,
    A: float,
    sig: pd.DataFrame,
    dd_enter: float = -0.20,
    dd_exit: float = -0.05,
    use_ma: bool = True,
    spread: float = SPREAD_MAIN,
    fixed_fin: float | None = None,
    cost: float = COST,
    fee: bool = True,
    drift: bool = True,
    state: np.ndarray | None = None,
) -> PathResult:
    """sig 为全历史信号帧（不要预先切片）。"""
    idx = m_leg.index.intersection(rf.index).intersection(sig.index)
    sig_full = sig
    m_leg, rf, sig = m_leg.loc[idx], rf.loc[idx], sig.loc[idx]
    if state is None:
        st, init = k2_window_state(sig_full, idx, dd_enter, dd_exit, use_ma)
    else:
        st, init = state, False
    sim = simulate(
        [m_leg.to_numpy()], [1.0], rf.to_numpy(), A,
        fee=fee, spread=spread, fixed_fin=fixed_fin, cost=cost,
        state=st, drift=drift, dates=idx, log_trades=True, init_lev=init,
    )
    years = len(idx) / A
    liq = sim["liquidated"]
    return PathResult(
        pd.Series(sim["r"], index=idx),
        sim["turnSum"] / years / 2.0 if years else float("nan"),
        sim["nEnterExit"],
        {
            "liquidated": liq,
            "liqDate": str(idx[sim["liqIndex"]].date()) if liq else None,
            "trades": sim["trades"],
            "lever_mask": pd.Series(sim["posLev"], index=idx),
            "state": st,
            "exposure": pd.Series(sim["exposure"], index=idx),
            "I": sig["I"],
            "dd": sig["dd"],
            "nav": pd.Series(sim["nav"], index=idx),
            "nExec": sim["nExec"],
            "initLev": init,
            "turnDay": pd.Series(sim["turnDay"], index=idx),
            "actDay": pd.Series(sim["actDay"], index=idx, dtype=object),
            "liqIndex": sim["liqIndex"],
        },
    )


def run_e6(m: pd.Series, g: pd.Series, rf: pd.Series, A: float, sig: pd.DataFrame) -> PathResult:
    """E6：70/30 两腿 + K1 带状 + K2 状态（两腿同比放大）。"""
    idx = m.index.intersection(g.index).intersection(rf.index).intersection(sig.index)
    st, init = k2_window_state(sig, idx)
    sim = simulate(
        [m.loc[idx].to_numpy(), g.loc[idx].to_numpy()], [0.70, 0.30], rf.loc[idx].to_numpy(), A,
        band=(0.25, 0.35), state=st, dates=idx, log_trades=True, init_lev=init,
    )
    years = len(idx) / A
    return PathResult(
        pd.Series(sim["r"], index=idx),
        sim["turnSum"] / years / 2.0,
        sim["nEnterExit"],
        {"liquidated": sim["liquidated"], "nExec": sim["nExec"], "lever_mask": pd.Series(sim["posLev"], index=idx)},
    )


def month_starts(idx: pd.DatetimeIndex) -> np.ndarray:
    p = idx.year.to_numpy() * 12 + idx.month.to_numpy()
    return np.flatnonzero(np.r_[True, p[1:] != p[:-1]])


def cer5_fast(r: np.ndarray, starts: np.ndarray, rfm: np.ndarray) -> float:
    rm = np.multiply.reduceat(1.0 + r, starts) - 1.0
    return monthly_metrics(rm, rfm)["cerG5"]


def mstar_daily(r_m: pd.Series, rf: pd.Series, r_cand: pd.Series, mode: str, A: float, spread: float = SPREAD_MAIN) -> tuple[pd.Series, float]:
    """M* 每日再平衡。mode=monthly|daily 决定 k。"""
    idx = r_m.index.intersection(rf.index).intersection(r_cand.index)
    rm, rf, rc = r_m.loc[idx], rf.loc[idx], r_cand.loc[idx]
    if mode == "monthly":
        mm = month_compound(rm)
        mc = month_compound(rc)
        k = float(np.std(mc.to_numpy(), ddof=1) / np.std(mm.to_numpy(), ddof=1)) if np.std(mm.to_numpy(), ddof=1) > 0 else 1.0
    else:
        k = float(np.std(rc.to_numpy(), ddof=1) / np.std(rm.to_numpy(), ddof=1)) if np.std(rm.to_numpy(), ddof=1) > 0 else 1.0
    # daily: k*M + (1-k)*cash; if k>1 cash negative with funding
    out = np.zeros(len(idx))
    for i in range(len(idx)):
        if k <= 1.0:
            out[i] = k * rm.iloc[i] + (1.0 - k) * rf.iloc[i]
        else:
            borrow = k - 1.0
            fin = rf.iloc[i] + spread / A
            out[i] = k * rm.iloc[i] - borrow * fin
    return pd.Series(out, index=idx), k


def pack_window(name: str, r: pd.Series, rf: pd.Series, r_m: pd.Series, r_ms: pd.Series, k: float, A: float, I_m: np.ndarray, extras: dict) -> dict:
    idx = r.index
    d_c = daily_metrics(r.to_numpy(), rf.loc[idx].to_numpy(), A)
    d_m = daily_metrics(r_m.loc[idx].to_numpy(), rf.loc[idx].to_numpy(), A)
    d_s = daily_metrics(r_ms.loc[idx].to_numpy(), rf.loc[idx].to_numpy(), A)
    rm = month_compound(r)
    rmm = month_compound(r_m.loc[idx])
    rms = month_compound(r_ms.loc[idx])
    rfm = month_compound(rf.loc[idx])
    # align months
    common = rm.index.intersection(rmm.index).intersection(rfm.index)
    m_c = monthly_metrics(rm.loc[common].to_numpy(), rfm.loc[common].to_numpy())
    m_m = monthly_metrics(rmm.loc[common].to_numpy(), rfm.loc[common].to_numpy())
    m_s = monthly_metrics(rms.loc[common].intersection(common).loc[common].to_numpy() if False else rms.loc[common].to_numpy(), rfm.loc[common].to_numpy())

    nav_c = np.cumprod(1.0 + r.to_numpy())
    nav_m = np.cumprod(1.0 + r_m.loc[idx].to_numpy())
    nav_s = np.cumprod(1.0 + r_ms.loc[idx].to_numpy())
    # tails on M index
    segs_p = polyline_segments(I_m)
    segs_h = prior_high_segments(I_m, idx)
    Lp, ev_p = L_ratio(nav_c, nav_s, segs_p)
    Lh, ev_h = L_ratio(nav_c, nav_s, segs_h)
    dates = idx

    def ev_list(segs, evs, method):
        out = []
        for (p, t, _), (pp, tt, dc, db) in zip(segs, evs):
            out.append({
                "peak": str(dates[p].date()),
                "trough": str(dates[t].date()),
                "method": method,
                "dropM": float(I_m[t] / I_m[p] - 1.0),
                "dropCandidate": float(dc),
                "dropBenchmark": float(db),
            })
        return out

    rel = (1 + rm.loc[common]) / (1 + rmm.loc[common]) - 1
    # actually worst rolling of cumulative relative: use monthly relative returns
    rel_r = rm.loc[common] - rmm.loc[common]
    # wealth relative
    wrel = ((1 + rm.loc[common]) / (1 + rmm.loc[common])).cumprod() - 1
    # rolling 36m relative total return
    wr = {"rel": float("nan"), "from": None, "to": None}
    if len(common) >= 36:
        best = None
        for i in range(35, len(common)):
            a, b = common[i - 35], common[i]
            v = ((1 + rm.loc[a:b]).prod() / (1 + rmm.loc[a:b]).prod()) - 1.0
            if best is None or v < best[0]:
                best = (float(v), a.strftime("%Y-%m"), b.strftime("%Y-%m"))
        wr = {"rel": best[0], "from": best[1], "to": best[2]}

    return {
        "window": name,
        "K1" if "K1" in extras.get("kind", "K1") else "K2": None,  # filled by caller
        "_daily_c": d_c,
        "_daily_m": d_m,
        "_daily_s": d_s,
        "_monthly_c": m_c,
        "_monthly_m": m_m,
        "_monthly_s": m_s,
        "k": float(k),
        "L": float(Lp),
        "tailPolyline": ev_list(segs_p, ev_p, "polyline"),
        "tailPriorHigh": ev_list(segs_h, ev_h, "priorHigh"),
        "trackingError": tracking_error_annual(rm.loc[common], rmm.loc[common]),
        "worstRolling36": wr,
        "nav_c": nav_c,
        "nav_m": nav_m,
        "nav_s": nav_s,
        "idx": idx,
        "I_m": I_m,
    }


def holm(pvals: list[float]) -> list[float]:
    m = len(pvals)
    order = np.argsort(pvals)
    adj = [0.0] * m
    prev = 0.0
    for rank, i in enumerate(order):
        val = min(1.0, pvals[i] * (m - rank))
        val = max(val, prev)
        adj[i] = val
        prev = val
    return adj


def bootstrap_sharpe_diff(ex_a: np.ndarray, ex_b: np.ndarray, block: int = 12, n: int = 10000, seed: int = SEED) -> float:
    """补充裁定 14：月超额收益成对循环分块自助（块长 12，起点在 [0,T) 均匀，拼接截到 T）；
    ΔS*_b = 夏普(a*) − 夏普(b*)（年化 √12）；单边 p = (1 + #{ΔS*_b − ΔS_obs ≥ ΔS_obs}) ÷ (1 + N)。"""
    rng = np.random.default_rng(seed)

    def sh(x):
        s = np.std(x, ddof=1)
        return (np.mean(x) / s * math.sqrt(12)) if s > 0 else 0.0

    obs = sh(ex_a) - sh(ex_b)
    T = len(ex_a)
    nblocks = int(math.ceil(T / block))
    count = 0
    for _ in range(n):
        starts = rng.integers(0, T, size=nblocks)
        idx = np.concatenate([np.arange(s, s + block) % T for s in starts])[:T]
        d = sh(ex_a[idx]) - sh(ex_b[idx])
        if d - obs >= obs:
            count += 1
    return float((1 + count) / (1 + n))


# ───────────── main ─────────────
def main():
    notes = [
        "口径裁定：年数=(末日-首日)日历天/365.2425；A=N/年数；费与融资利差按 rate/A 逐日；月收益=日净值自然月复利；M* 按日 k 常数每日再平衡。",
        "FRED DTB4WK 本机不可得：1999 窗口在 KF RF 结束后沿用 2026-09 最后一日 RF。",
        "CLARIFY-2 记账：每日 t 收盘 ①各腿随行情（扣费）②现金按 RF、负债按 RF+利差（或固定 6%）计息 ③NAV ④执行 t−1 指令（目标=权重×NAV×目标暴露，成本 0.05%×Σ|ΔS| 从现金扣，不足记负债）⑤强平（NAV≤0 或暴露≥2）⑥用第④步后持仓产生信号，t+1 收盘执行；指标用第④步后（含当日成本）NAV。",
        "首日建仓：窗口首日前收盘按目标权重建仓、NAV=1、不计成本，首日即承担当日收益（与 M 基准同口径）。窗口末日产生的指令落在窗口外，不执行。",
        "K2 信号：I 为 Mkt-RF+RF 日度复利（不扣费），高点与 SMA200 自 1926-07-01 全历史起算后按窗口切片（SPY 自 1993-01-29）；窗口首日 K2 未加杠杆。",
        "K2 安慰剂（主与条件）均对 K2 信号状态序列做替换，再走与 K2 相同的完整模拟；用实际状态序列复现 K2 逐日收益（代码内断言）。",
        "E6：M/G 两腿 70/30 + K1 带状 + K2 状态，任一指令按 70/30 与当前目标暴露重设两腿；对照 M。",
        "补充裁定 7：强平按清仓成交额 Σ|S| 计 0.05% 成本。补充裁定 8：前后半为全窗口模拟的切片（逐日费用/融资费率沿用全窗口 A，年化与 M* 的 k 按半窗口各自计算）；单独模拟窗口在首日前一收盘建仓，起步 K2 状态取全历史状态机在该收盘的状态（加杠杆则以 1.30 建仓，不计成本）。安慰剂序列起步一律未加杠杆。",
    ]
    inputs = {}
    for p in sorted(RAW.iterdir()):
        if p.is_file() and p.name != ".download_utc.txt":
            inputs[p.name] = sha(p)

    ff = read_kf_daily("F-F_Research_Data_Factors_daily_CSV.zip")
    p6 = read_kf_daily("6_Portfolios_2x3_daily_CSV.zip")
    m_raw = ff["Mkt-RF"] + ff["RF"]  # total market, no fee yet
    rf = ff["RF"]
    g_raw = p6["BIG LoBM"]

    spy = read_yahoo("SPY")
    qqq = read_yahoo("QQQ")
    gspc = read_yahoo("GSPC")
    ndx = read_yahoo("NDX")

    # align KF
    common = m_raw.index.intersection(g_raw.index).intersection(rf.index)
    m_raw, g_raw, rf = m_raw.loc[common], g_raw.loc[common], rf.loc[common]
    # K2 信号（PREREG：高点自 1926-07-01 起算、SMA200 按交易日，均用全历史后再按窗口切片）
    sig_kf = k2_signal_frame((1.0 + m_raw).cumprod())
    sig_kf_price = k2_signal_frame((1.0 + ff["Mkt-RF"].loc[common]).cumprod())  # E5 价格口径代理（KF 无不含息市场收益）
    _spy_px = pd.read_csv(RAW / "yahoo_SPY_daily.csv", parse_dates=["date"]).dropna(subset=["adjclose"]).set_index("date").sort_index()["adjclose"].astype(float)
    sig_spy = k2_signal_frame(_spy_px / _spy_px.iloc[0])  # SPY 复权收盘，自 1993-01-29 起算

    def eval_k1(start, end, m_src, g_src, rf_src, fee_legs=True, label="", band=0.05, target_g=0.30, yearend=False, slice_of=None) -> dict:
        """slice_of：补充裁定 8——前后半为全窗口那次模拟的切片（逐日收益、成交直接截取，费用/融资的逐日费率沿用全窗口 A；
        年化与 M* 的 k 按本窗口各自计算）。"""
        m = m_src.loc[start:end]
        g = g_src.loc[start:end]
        rfv = rf_src.loc[start:end]
        idx = m.index.intersection(g.index).intersection(rfv.index)
        m, g, rfv = m.loc[idx], g.loc[idx], rfv.loc[idx]
        meta = window_meta(idx)
        A = meta["A"]
        y = meta["years"]
        if slice_of is not None:
            A_sim = slice_of["_meta"]["A"]
            pp = slice_of["_path"]
            ad = pp.extra["actDay"].loc[idx]
            path = PathResult(pp.r.loc[idx], float(pp.extra["turnDay"].loc[idx].sum()) / (len(idx) / A) / 2.0,
                              int(ad.notna().sum()), {"liquidated": pp.extra["liquidated"]})
        else:
            A_sim = A
            path = run_k1(m, g, rfv, A, fee=fee_legs, band=band, target_g=target_g, yearend=yearend)
        m_fee = apply_leg_fee(m, A_sim) if fee_legs else m
        I_m_fee = np.cumprod(1.0 + m_fee.to_numpy())
        ms, k = mstar_daily(m_fee, rfv, path.r, "monthly", A_sim)
        d_c = daily_metrics(path.r.to_numpy(), rfv.to_numpy(), A, y)
        d_m = daily_metrics(m_fee.to_numpy(), rfv.to_numpy(), A, y)
        d_s = daily_metrics(ms.to_numpy(), rfv.loc[ms.index].to_numpy(), A, y)
        rm, rmm, rms, rfm = month_compound(path.r), month_compound(m_fee), month_compound(ms), month_compound(rfv)
        com = rm.index.intersection(rmm.index).intersection(rms.index).intersection(rfm.index)
        mc, mm, ms_m = monthly_metrics(rm.loc[com].to_numpy(), rfm.loc[com].to_numpy()), monthly_metrics(rmm.loc[com].to_numpy(), rfm.loc[com].to_numpy()), monthly_metrics(rms.loc[com].to_numpy(), rfm.loc[com].to_numpy())
        nav_c = np.cumprod(1 + path.r.to_numpy())
        nav_s = np.cumprod(1 + ms.to_numpy())
        segs_p = polyline_segments(I_m_fee)
        segs_h = prior_high_segments(I_m_fee, m.index)
        Lp, ev_p = L_ratio(nav_c, nav_s, segs_p)
        Lh, ev_h = L_ratio(nav_c, nav_s, segs_h)
        dates = m.index

        def el(segs, evs, method):
            return [{
                "peak": str(dates[p].date()), "trough": str(dates[t].date()), "method": method,
                "dropM": float(I_m_fee[t] / I_m_fee[p] - 1), "dropCandidate": float(dc), "dropBenchmark": float(db),
            } for (p, t, _), (_, _, dc, db) in zip(segs, evs)]

        wr = {"rel": float("nan"), "from": None, "to": None}
        if len(com) >= 36:
            best = None
            for i in range(35, len(com)):
                a, b = com[i - 35], com[i]
                v = float((1 + rm.loc[a:b]).prod() / (1 + rmm.loc[a:b]).prod() - 1)
                if best is None or v < best[0]:
                    best = (v, a.strftime("%Y-%m"), b.strftime("%Y-%m"))
            wr = {"rel": best[0], "from": best[1], "to": best[2]}

        sharpe_diff = mc["sharpe"] - mm["sharpe"]
        checks = {
            "sharpeVsM": {"value": sharpe_diff, "threshold": 0.03, "pass": bool(sharpe_diff >= 0.03)},
            "maxDdVsMstar": {"value": d_c["maxDd"] - d_s["maxDd"], "threshold": -0.01, "pass": bool(d_c["maxDd"] >= d_s["maxDd"] - 0.01)},
            "L": {"value": Lp, "threshold": 1.0, "pass": bool(Lp <= 1.0 + 1e-12)},
        }
        return {
            "window": label or f"{start}:{end}",
            "K1": {"daily": d_c, "monthly": mc},
            "M": {"daily": d_m, "monthly": mm},
            "Mstar": {"daily": d_s, "monthly": ms_m},
            "k": k,
            "L": Lp,
            "tailPolyline": el(segs_p, ev_p, "polyline"),
            "tailPriorHigh": el(segs_h, ev_h, "priorHigh"),
            "turnoverPerYear": path.turnover,
            "rebalanceCount": path.rebalances,
            "trackingError": tracking_error_annual(rm.loc[com], rmm.loc[com]),
            "worstRolling36": wr,
            "checks": checks,
            "_path": path,
            "_rm": rm.loc[com],
            "_rmm": rmm.loc[com],
            "_rfm": rfm.loc[com],
            "_meta": meta,
        }


    def eval_k2(start, end, m_src, rf_src, fee_legs=True, label="", use_ma=True, dd_enter=-0.20, spread=SPREAD_MAIN, sig=None, cost=COST, drift=True, path_fn=None, slice_of=None) -> dict:
        """sig：全历史信号帧（KF 自 1926-07-01、SPY 自 1993-01-29 起算高点与均线），按窗口切片。"""
        assert sig is not None
        m = m_src.loc[start:end]
        rfv = rf_src.loc[start:end]
        idx = m.index.intersection(rfv.index).intersection(sig.index)
        m, rfv = m.loc[idx], rfv.loc[idx]
        meta = window_meta(idx)
        A = meta["A"]
        y = meta["years"]
        A_sim = A
        if slice_of is not None:
            # 补充裁定 8：前后半 = 全窗口模拟的切片
            A_sim = slice_of["_A"]
            pp = slice_of["_path"]
            ad = pp.extra["actDay"].loc[idx]
            liq_i = pp.extra.get("liqIndex")
            path = PathResult(
                pp.r.loc[idx],
                float(pp.extra["turnDay"].loc[idx].sum()) / (len(idx) / A) / 2.0,
                int(ad.isin(["enter", "exit"]).sum()),
                {"liquidated": bool(pp.extra["liquidated"] and liq_i is not None and pp.r.index[liq_i] <= idx[-1]),
                 "lever_mask": pp.extra["lever_mask"].loc[idx]},
            )
        elif path_fn is not None:
            path = path_fn(idx, A)
        else:
            path = run_k2(m, rfv, A, sig, dd_enter=dd_enter, use_ma=use_ma, spread=spread, fee=fee_legs, cost=cost, drift=drift)
        m_fee = apply_leg_fee(m, A_sim) if fee_legs else m
        ms, k = mstar_daily(m_fee, rfv, path.r, "daily", A_sim, spread=spread)
        d_c = daily_metrics(path.r.to_numpy(), rfv.to_numpy(), A, y)
        d_m = daily_metrics(m_fee.to_numpy(), rfv.to_numpy(), A, y)
        d_s = daily_metrics(ms.to_numpy(), rfv.loc[ms.index].to_numpy(), A, y)
        rm, rmm, rms, rfm = month_compound(path.r), month_compound(m_fee), month_compound(ms), month_compound(rfv)
        com = rm.index.intersection(rmm.index).intersection(rms.index).intersection(rfm.index)
        mc = monthly_metrics(rm.loc[com].to_numpy(), rfm.loc[com].to_numpy())
        mm = monthly_metrics(rmm.loc[com].to_numpy(), rfm.loc[com].to_numpy())
        ms_m = monthly_metrics(rms.loc[com].to_numpy(), rfm.loc[com].to_numpy())
        if path.extra.get("liquidated"):
            mc["cerG5"] = float("-inf")
        dCer_s = (mc["cerG5"] - ms_m["cerG5"]) if math.isfinite(mc["cerG5"]) else float("-inf")
        dCer_m = (mc["cerG5"] - mm["cerG5"]) if math.isfinite(mc["cerG5"]) else float("-inf")
        I_m = np.cumprod(1.0 + m.to_numpy())
        nav_c = np.cumprod(1 + path.r.to_numpy())
        nav_m = np.cumprod(1 + m_fee.to_numpy())
        segs_p = polyline_segments(I_m)
        segs_h = prior_high_segments(I_m, m.index)
        # L for K2 vs M (not M*)
        Lp, ev_p = L_ratio(nav_c, nav_m, segs_p)
        Lh, ev_h = L_ratio(nav_c, nav_m, segs_h)
        dates = m.index

        def el(segs, evs, method):
            return [{
                "peak": str(dates[p].date()), "trough": str(dates[t].date()), "method": method,
                "dropM": float(I_m[t] / I_m[p] - 1), "dropCandidate": float(dc), "dropBenchmark": float(db),
            } for (p, t, _), (_, _, dc, db) in zip(segs, evs)]

        checks = {
            "deltaCerVsMstar": {"value": dCer_s, "threshold": 0.002, "pass": bool(isinstance(dCer_s, float) and dCer_s >= 0.002)},
            "deltaCerVsM_nonneg": {"value": dCer_m, "threshold": 0.0, "pass": bool(isinstance(dCer_m, float) and dCer_m >= 0.0)},
            "maxDdVsM": {"value": d_c["maxDd"] - d_m["maxDd"], "threshold": -0.01, "pass": bool(d_c["maxDd"] >= d_m["maxDd"] - 0.01)},
            "L": {"value": Lp, "threshold": 1.0, "pass": bool(Lp <= 1.0 + 1e-12)},
            "liquidated": {"value": path.extra.get("liquidated"), "threshold": False, "pass": not path.extra.get("liquidated")},
        }
        return {
            "window": label or f"{start}:{end}",
            "K2": {"daily": d_c, "monthly": mc},
            "M": {"daily": d_m, "monthly": mm},
            "Mstar": {"daily": d_s, "monthly": ms_m},
            "k": k,
            "L": Lp,
            "deltaCerVsMstar": dCer_s,
            "deltaCerVsM": dCer_m,
            "tailPolyline": el(segs_p, ev_p, "polyline"),
            "tailPriorHigh": el(segs_h, ev_h, "priorHigh"),
            "liquidated": bool(path.extra.get("liquidated")),
            "checks": checks,
            "_path": path,
            "_meta": meta,
            "_rm": rm.loc[com],
            "_rmm": rmm.loc[com],
            "_rfm": rfm.loc[com],
            "_m_fee": m_fee,
            "_rf": rfv,
            "_A": A,
        }

    # Proxy quality
    def proxy(a: pd.Series, b: pd.Series, start, end):
        x = a.loc[start:end].dropna()
        y = b.loc[start:end].dropna()
        idx = x.index.intersection(y.index)
        x, y = x.loc[idx], y.loc[idx]
        if len(idx) < 10:
            return {"corr": None, "beta": None, "volRatio": None, "start": start, "end": end}
        corr = float(np.corrcoef(x, y)[0, 1])
        beta = float(np.cov(x, y, ddof=1)[0, 1] / np.var(y, ddof=1))
        vol_r = float(np.std(x, ddof=1) / np.std(y, ddof=1))
        return {"corr": corr, "beta": beta, "volRatio": vol_r, "start": str(idx[0].date()), "end": str(idx[-1].date())}

    gspc_r, ndx_r = gspc, ndx
    proxy_quality = {
        "kf1927_1972": proxy(g_raw, m_raw, "1927-01-03", "1972-12-29"),
        "ndx_vs_gspc_1985_2026": proxy(ndx_r, gspc_r, "1985-10-01", "2026-11-27"),
        "qqq_vs_spy_1985_2026": proxy(qqq, spy, "1985-10-01", "2026-11-27"),
        "qqq_vs_spy_1999_2026": proxy(qqq, spy, "1999-03-10", "2026-11-27"),
        # 兼容旧键
        "ndx1985_2026": None,
        "qqq_spy_1999_2026": None,
    }
    proxy_quality["ndx1985_2026"] = proxy_quality["ndx_vs_gspc_1985_2026"]
    proxy_quality["qqq_spy_1999_2026"] = proxy_quality["qqq_vs_spy_1999_2026"]

    print("eval K1 main...")
    k1_main = eval_k1(*MAIN_W, m_raw, g_raw, rf, label="main_1927_1972")
    k1_h1 = eval_k1(*HALF1, m_raw, g_raw, rf, label="half_1927_1949", slice_of=k1_main)
    k1_h2 = eval_k1(*HALF2, m_raw, g_raw, rf, label="half_1950_1972", slice_of=k1_main)
    k1_v1 = eval_k1(*VETO_KF, m_raw, g_raw, rf, label="veto_kf_1973_1984")
    # ETF veto: extend RF（KF 截止后用末日 RF 常数填充）
    last_rf = float(rf.iloc[-1])
    etf_idx = spy.index.intersection(qqq.index)
    etf_idx = etf_idx[(etf_idx >= VETO_ETF[0]) & (etf_idx <= VETO_ETF[1])]
    rf_etf = rf.reindex(etf_idx)
    rf_etf = rf_etf.fillna(last_rf)
    # 对齐 SPY/QQQ 到同一日历
    spy_e = spy.loc[etf_idx]
    qqq_e = qqq.loc[etf_idx]
    k1_v2 = eval_k1(VETO_ETF[0], VETO_ETF[1], spy_e, qqq_e, rf_etf, fee_legs=False, label="veto_spy_qqq_1999_2026")

    # K1 halves sharpe checks
    for h in (k1_h1, k1_h2):
        diff = h["K1"]["monthly"]["sharpe"] - h["M"]["monthly"]["sharpe"]
        h["checks"]["sharpeVsM_half"] = {"value": diff, "threshold": -0.02, "pass": bool(diff >= -0.02)}

    print("eval K2 main...")
    k2_main = eval_k2(*MAIN_W, m_raw, rf, label="main_1927_1972", sig=sig_kf)
    k2_h1 = eval_k2(*HALF1, m_raw, rf, label="half_1927_1949", sig=sig_kf, slice_of=k2_main)
    k2_h2 = eval_k2(*HALF2, m_raw, rf, label="half_1950_1972", sig=sig_kf, slice_of=k2_main)
    k2_v1 = eval_k2(*VETO_KF, m_raw, rf, label="veto_kf_1973_1984", sig=sig_kf)
    spy_v = spy.loc[VETO_ETF[0]:VETO_ETF[1]]
    rf_spy = rf.reindex(spy_v.index).fillna(last_rf)
    k2_v2 = eval_k2(VETO_ETF[0], VETO_ETF[1], spy_v, rf_spy, fee_legs=False, label="veto_spy_1999_2026", sig=sig_spy)

    for h in (k2_h1, k2_h2):
        h["checks"]["deltaCerVsMstar_half"] = {
            "value": h["deltaCerVsMstar"],
            "threshold": -0.002,
            "pass": bool(isinstance(h["deltaCerVsMstar"], float) and h["deltaCerVsMstar"] >= -0.002),
        }

    # ───── K2 安慰剂（主：循环平移；条件：DD≤−20% 内随机放置）——均用与 K2 完全相同的完整模拟 ─────
    # 「加杠杆 / 不加杠杆」日序列 = K2 的信号状态序列（t 收盘状态，t+1 收盘执行）；把它替换成安慰剂序列后
    # 走同一个 simulate（进入/退出/漂移调回、成本、融资、强平）。用实际状态序列跑出的结果与 K2 逐日相同（下方断言）。
    print("placebo (full simulation)...")
    path = k2_main["_path"]
    mask = path.extra["lever_mask"].to_numpy()  # 持仓层面加杠杆日（集中度统计用）
    state_act = np.asarray(path.extra["state"], dtype=bool)
    m_win = m_raw.loc[path.r.index]
    m_win_np = m_win.to_numpy()
    m_fee = k2_main["_m_fee"].to_numpy()
    rfv = k2_main["_rf"].to_numpy()
    A = k2_main["_A"]
    idx = path.r.index
    dd_arr = path.extra["dd"].to_numpy()
    n = len(state_act)
    starts_m = month_starts(idx)
    rfm_np = np.multiply.reduceat(1.0 + rfv, starts_m) - 1.0
    base_cer = cer5_fast(m_fee, starts_m, rfm_np)

    def placebo_eval(st: np.ndarray) -> tuple[float, float]:
        sim = simulate([m_win_np], [1.0], rfv, A, state=st)
        if sim["liquidated"]:
            return float("-inf"), float(np.mean(sim["r"] - m_fee))
        c = cer5_fast(sim["r"], starts_m, rfm_np)
        return (c - base_cer if math.isfinite(c) else float("-inf")), float(np.mean(sim["r"] - m_fee))

    assert not path.extra["initLev"]  # 主窗口起步未加杠杆（1926-12-31 无均线）
    _chk = simulate([m_win_np], [1.0], rfv, A, state=state_act)
    assert np.array_equal(_chk["r"], path.r.to_numpy()), "安慰剂引擎用实际状态必须复现 K2"
    act_dcer, act_ex = placebo_eval(state_act)
    shifts = list(range(21, n, 21))
    N = len(shifts)
    ge = 0
    ge_ex = 0
    for s_ in shifts:
        d, ex = placebo_eval(np.roll(state_act, s_))
        if d >= act_dcer:
            ge += 1
        if ex >= act_ex:
            ge_ex += 1
    p_cer = (1 + ge) / (1 + N)
    p_ex = (1 + ge_ex) / (1 + N)

    # 条件安慰剂（报告）
    print("conditional placebo (full simulation, 5000)...")

    def runs_of(b: np.ndarray) -> list[tuple[int, int]]:
        """返回 True 的连续段 [start, end)。"""
        out: list[tuple[int, int]] = []
        i = 0
        nn = len(b)
        while i < nn:
            if b[i]:
                j = i
                while j < nn and b[j]:
                    j += 1
                out.append((i, j))
                i = j
            else:
                i += 1
        return out

    seg_lens = [e - s_ for s_, e in runs_of(state_act)]
    elig = dd_arr <= -0.20
    elig_runs = runs_of(elig)
    max_run = max((e - s_ for s_, e in elig_runs), default=0)
    assert max(seg_lens) <= max_run, f"最长杠杆段 {max(seg_lens)} 天 > 最长 DD≤−20% 区间 {max_run} 天，无法放置"

    def place_once(rng: np.random.Generator) -> np.ndarray | None:
        """按长度降序依次放置；每段在所有可行起点中等概率抽取。可行 = 整段落在同一 DD≤−20% 连续区间内、
        与已放段不重叠且不相邻（相邻会并成一段，段数就变了）。任一段放不下 → 返回 None（整次重抽）。"""
        free = list(elig_runs)  # 半开区间 [s, e)
        out = np.zeros(n, dtype=bool)
        for Lg in sorted(seg_lens, reverse=True):
            cnt = np.array([max(0, e - s_ - Lg + 1) for s_, e in free], dtype=np.int64)
            tot = int(cnt.sum())
            if tot == 0:
                return None
            u = int(rng.integers(tot))
            fi = int(np.searchsorted(np.cumsum(cnt), u, side="right"))
            s_, e = free[fi]
            a = s_ + (u - int(cnt[:fi].sum()))
            out[a:a + Lg] = True
            new_free = free[:fi]
            if a - 1 > s_:
                new_free.append((s_, a - 1))
            if a + Lg + 1 < e:
                new_free.append((a + Lg + 1, e))
            new_free.extend(free[fi + 1:])
            free = new_free
        return out

    rng_cond = np.random.default_rng(SEED)
    N_cond = 5000
    cond_dcers = np.empty(N_cond)
    ge_cond = 0
    redraws = 0
    for t in range(N_cond):
        st_p = place_once(rng_cond)
        while st_p is None:
            redraws += 1
            st_p = place_once(rng_cond)
        dcer_p, _ = placebo_eval(st_p)
        cond_dcers[t] = dcer_p
        if dcer_p >= act_dcer:
            ge_cond += 1
    p_cond = (1 + ge_cond) / (1 + N_cond)
    finite = cond_dcers[np.isfinite(cond_dcers)]
    cond_dist = {
        "mean": float(np.mean(finite)) if len(finite) else float("nan"),
        "std": float(np.std(finite, ddof=1)) if len(finite) > 1 else float("nan"),
        "min": float(np.min(finite)) if len(finite) else float("nan"),
        "q05": float(np.quantile(finite, 0.05)) if len(finite) else float("nan"),
        "q50": float(np.quantile(finite, 0.50)) if len(finite) else float("nan"),
        "q95": float(np.quantile(finite, 0.95)) if len(finite) else float("nan"),
        "max": float(np.max(finite)) if len(finite) else float("nan"),
    }
    e1_for_cond = eval_k2(*MAIN_W, m_raw, rf, use_ma=False, label="E1_for_cond", sig=sig_kf)
    e1_dcer_full = e1_for_cond["deltaCerVsM"]
    conditional_block = {
        "N": N_cond,
        "seed": SEED,
        "nSegments": len(seg_lens),
        "totalLeverDays": int(sum(seg_lens)),
        "eligibleDays": int(elig.sum()),
        "redraws": redraws,
        "nInfinite": int(N_cond - len(finite)),
        "actualDeltaCer": act_dcer,
        "e1DeltaCer": e1_dcer_full,
        "e1DeltaCerFullEngine": e1_dcer_full,
        "maIncrementVsE1": (act_dcer - e1_dcer_full) if math.isfinite(act_dcer) and math.isfinite(e1_dcer_full) else float("nan"),
        "p": p_cond,
        "nGeActual": ge_cond,
        "distribution": cond_dist,
        "note": "CLARIFY-2 §4：与 K2 完全相同的完整模拟（漂移带、成本、融资、强平）。放置对象为 K2 信号状态序列的加杠杆段（段数、各段长度同 K2）；"
                "每段整段落在同一 DD≤−20% 连续区间内、段间不重叠且不相邻；按长度降序逐段在可行起点中等概率抽取，任一段放不下则整次重抽。"
                "单边 p=(1+#{ΔCER≥实际})/(1+N)；ΔCER 相对 M；maIncrementVsE1=实际−E1（同一完整引擎）。",
    }

    # Bootstrap K1
    ex_a = (k1_main["_rm"] - k1_main["_rfm"]).to_numpy()
    ex_b = (k1_main["_rmm"] - k1_main["_rfm"]).to_numpy()
    p_k1 = bootstrap_sharpe_diff(ex_a, ex_b)
    p_k2 = p_cer
    adj = holm([p_k1, p_k2])

    # Decisions K1
    cond_k1 = [
        {"id": "main_sharpe", "pass": k1_main["checks"]["sharpeVsM"]["pass"], "detail": f"Δ夏普={k1_main['checks']['sharpeVsM']['value']}"},
        {"id": "half1_sharpe", "pass": k1_h1["checks"]["sharpeVsM_half"]["pass"], "detail": f"Δ={k1_h1['checks']['sharpeVsM_half']['value']}"},
        {"id": "half2_sharpe", "pass": k1_h2["checks"]["sharpeVsM_half"]["pass"], "detail": f"Δ={k1_h2['checks']['sharpeVsM_half']['value']}"},
        {"id": "maxDd", "pass": k1_main["checks"]["maxDdVsMstar"]["pass"], "detail": f"ΔDD={k1_main['checks']['maxDdVsMstar']['value']}"},
        {"id": "L", "pass": k1_main["checks"]["L"]["pass"], "detail": f"L={k1_main['L']}"},
    ]
    veto_k1 = False
    for v, lab in ((k1_v1, "kf1973"), (k1_v2, "spyqqq")):
        bad = (v["K1"]["monthly"]["sharpe"] < v["M"]["monthly"]["sharpe"] - 0.03) or (v["K1"]["daily"]["maxDd"] < v["Mstar"]["daily"]["maxDd"] - 0.05)
        cond_k1.append({"id": f"veto_{lab}", "pass": not bad, "detail": "否决触发" if bad else "否决未触发"})
        veto_k1 = veto_k1 or bad
    core_k1 = all(c["pass"] for c in cond_k1 if c["id"] in ("main_sharpe", "half1_sharpe", "half2_sharpe", "maxDd", "L"))
    if core_k1 and not veto_k1:
        grade_k1 = "通过"
    elif core_k1 and veto_k1:
        grade_k1 = "部分成立"
    else:
        grade_k1 = "不通过"

    # K2 decision
    cond_k2 = [
        {"id": "deltaCer_mstar", "pass": k2_main["checks"]["deltaCerVsMstar"]["pass"], "detail": str(k2_main["deltaCerVsMstar"])},
        {"id": "deltaCer_m", "pass": k2_main["checks"]["deltaCerVsM_nonneg"]["pass"], "detail": str(k2_main["deltaCerVsM"])},
        {"id": "half1", "pass": k2_h1["checks"]["deltaCerVsMstar_half"]["pass"], "detail": str(k2_h1["deltaCerVsMstar"])},
        {"id": "half2", "pass": k2_h2["checks"]["deltaCerVsMstar_half"]["pass"], "detail": str(k2_h2["deltaCerVsMstar"])},
        {"id": "maxDd", "pass": k2_main["checks"]["maxDdVsM"]["pass"], "detail": str(k2_main["checks"]["maxDdVsM"]["value"])},
        {"id": "L", "pass": k2_main["checks"]["L"]["pass"], "detail": str(k2_main["L"])},
        {"id": "placebo", "pass": bool(p_cer <= 0.10), "detail": f"p={p_cer}, N={N}"},
        {"id": "liquidated", "pass": not k2_main["liquidated"], "detail": str(k2_main["liquidated"])},
    ]
    # concentration by independent ATH-recovery episodes（leave-one-out ΔCER 贡献）
    I = path.extra["I"].to_numpy()
    dates = path.r.index
    r_k2 = path.r
    r_m_fee = k2_main["_m_fee"]
    rfm_full = k2_main["_rfm"]
    # 独立回撤段：回到前高为界，且峰谷跌幅 ≥20%（与预注册「约 4–6 段」一致）
    # 高点自 1926-07-01 起算：在全历史 I（截到窗口末）上分段，再把峰位截到窗口首日
    _I_hist = sig_kf["I"].loc[:dates[-1]].to_numpy()
    _off = len(_I_hist) - len(dates)
    episodes = []
    for _p, _t, _rec, _drop in ath_episodes(_I_hist):
        if _drop <= -0.20 and _rec >= _off:
            # 段内交易日 = 峰之后一日至回到前高当日 (peak, recovery]；峰在窗口前则从窗口首日起
            episodes.append((max(_p - _off, 0), max(_t - _off, 0), _rec - _off, _drop, (_p - _off + 1) if _p >= _off else 0))
    dcer_full = k2_main["deltaCerVsM"] if math.isfinite(k2_main["deltaCerVsM"]) else float("nan")
    lev_seg = []
    contribs = []
    # 补充裁定 12：c_i = Σ_{t∈段i}[ln(1+r_K2,t) − ln(1+r_M,t)]；C = 全窗口同式之和；s_i = c_i ÷ C；集中度 = max_i s_i
    logdiff = np.log1p(r_k2.to_numpy()) - np.log1p(r_m_fee.loc[r_k2.index].to_numpy())
    C_total = float(np.sum(logdiff))
    log_contribs = []
    for p, t, rec, drop, s0 in episodes:
        sl = slice(s0, rec + 1)
        days = int(mask[sl].sum())
        log_contribs.append(float(np.sum(logdiff[sl])))
        entries = sum(
            1
            for tr in path.extra.get("trades", [])
            if tr["action"] == "enter" and str(dates[s0].date()) <= tr["signalDate"] <= str(dates[rec].date())
        )
        seg_idx = dates[s0 : rec + 1]
        cum_k = float((1.0 + r_k2.loc[seg_idx]).prod() - 1.0)
        cum_m = float((1.0 + r_m_fee.loc[seg_idx]).prod() - 1.0)
        cum_diff = float((1.0 + cum_k) / (1.0 + cum_m) - 1.0) if (1.0 + cum_m) != 0 else float("nan")
        # leave-one-out: 将该段日收益换成 M，其余保持 K2
        hybrid = r_k2.copy()
        hybrid.loc[seg_idx] = r_m_fee.loc[seg_idx]
        rm_h = month_compound(hybrid)
        cer_h = cer_monthly_series(rm_h, month_compound(k2_main["_rf"].loc[r_k2.index]))
        cer_m = k2_main["M"]["monthly"]["cerG5"]
        dcer_wo = (cer_h - cer_m) if math.isfinite(cer_h) and math.isfinite(cer_m) else float("nan")
        contrib = (dcer_full - dcer_wo) if math.isfinite(dcer_full) and math.isfinite(dcer_wo) else float("nan")
        contribs.append(contrib)
        lev_seg.append({
            "peak": str(dates[p].date()),
            "trough": str(dates[t].date()),
            "recoveryAth": str(dates[rec].date()),
            "drop": drop,
            "entries": entries,
            "leveredDays": days,
            "cumDiffVsM": cum_diff,
            "logDiffContrib": log_contribs[-1],
            "deltaCerShare": None,
            "deltaCerContribLeaveOneOut": contrib,
        })
    max_share = float("nan")
    if C_total != 0.0:
        shares = [c / C_total for c in log_contribs]
        for i, sh in enumerate(shares):
            lev_seg[i]["deltaCerShare"] = sh
        max_share = max(shares) if shares else float("nan")
    conc_pass = bool(max_share <= 0.50 + 1e-12)
    cond_k2.append({
        "id": "concentration",
        "pass": conc_pass,
        "detail": f"maxShare={max_share:.6f}（补充裁定 12：对数收益差份额 c_i/C），C={C_total:.6f}, nEpisodes={len(lev_seg)}, ΔCER={dcer_full}",
    })

    veto_k2 = False
    for v, lab in ((k2_v1, "kf1973"), (k2_v2, "spy")):
        bad = (isinstance(v["deltaCerVsM"], float) and v["deltaCerVsM"] < -0.005) or (v["K2"]["daily"]["maxDd"] < v["M"]["daily"]["maxDd"] - 0.01)
        cond_k2.append({"id": f"veto_{lab}", "pass": not bad, "detail": "否决触发" if bad else "否决未触发"})
        veto_k2 = veto_k2 or bad
    # 判定逻辑不变：集中度只在核心已通过时把上限压到「部分成立」
    if k2_main["liquidated"]:
        grade_k2 = "不通过"
    else:
        core_k2 = all(c["pass"] for c in cond_k2 if c["id"] not in ("veto_kf1973", "veto_spy", "concentration"))
        if core_k2 and not veto_k2:
            grade_k2 = "通过" if conc_pass else "部分成立"
        elif core_k2 and veto_k2:
            grade_k2 = "部分成立"
        else:
            grade_k2 = "不通过"

    # Exploratory E1–E6 (main window)
    print("exploratory...")
    e1 = eval_k2(*MAIN_W, m_raw, rf, use_ma=False, label="E1", sig=sig_kf)
    e1_path = e1["_path"]
    nav = e1_path.extra["nav"].to_numpy()
    expos_e1 = e1_path.extra["exposure"]
    sub = (e1_path.r.index >= "1929-01-01") & (e1_path.r.index <= "1932-12-31")
    path_pts = []
    sub_idx = e1_path.r.index[sub]
    e1_exec_days = {t["execDate"] for t in e1_path.extra.get("trades", [])}
    for i, d in enumerate(e1_path.r.index):
        if not sub[i]:
            continue
        # 月初附近 + 月末 + 进出日
        # 月末 + 进出/调回执行日（完整覆盖 1929–32，不截断）
        is_month_edge = (i + 1 < len(e1_path.r.index) and e1_path.r.index[i + 1].month != d.month) or (str(d.date()) in e1_exec_days)
        if is_month_edge or d == sub_idx[-1] or d == sub_idx[0]:
            path_pts.append({
                "date": str(d.date()),
                "nav": float(nav[i]),
                "exposure": float(expos_e1.iloc[i]),
                "levered": bool(e1_path.extra["lever_mask"].iloc[i]),
            })
    e2_15 = eval_k2(*MAIN_W, m_raw, rf, dd_enter=-0.15, label="E2_15", sig=sig_kf)
    e2_25 = eval_k2(*MAIN_W, m_raw, rf, dd_enter=-0.25, label="E2_25", sig=sig_kf)
    meta = window_meta(m_raw.loc[MAIN_W[0]:MAIN_W[1]].index)
    mw_m = m_raw.loc[MAIN_W[0]:MAIN_W[1]]
    mw_g = g_raw.loc[MAIN_W[0]:MAIN_W[1]]
    mw_rf = rf.loc[MAIN_W[0]:MAIN_W[1]]
    # E1『不调回』强平（进入后不做带内再平衡）
    e1_noband = run_k2(mw_m, mw_rf, meta["A"], sig_kf, use_ma=False, drift=False)
    e1_liq = {"hit": bool(e1_noband.extra.get("liquidated")), "date": e1_noband.extra.get("liqDate"), "rule": "no_band_rebalance（进入 1.30 后不做漂移调回；退出/强平同 K2）"}
    e3_b3 = eval_k1(*MAIN_W, m_raw, g_raw, rf, label="E3_band3", band=0.03)
    e3_b10 = eval_k1(*MAIN_W, m_raw, g_raw, rf, label="E3_band10", band=0.10)
    e3_ann = eval_k1(*MAIN_W, m_raw, g_raw, rf, label="E3_annual", band=None, yearend=True)
    e3_never = eval_k1(*MAIN_W, m_raw, g_raw, rf, label="E3_never", band=None)
    e4_20 = eval_k1(*MAIN_W, m_raw, g_raw, rf, label="E4_tilt20", target_g=0.20)
    e4_40 = eval_k1(*MAIN_W, m_raw, g_raw, rf, label="E4_tilt40", target_g=0.40)

    def path_monthly_pack(pr: PathResult, m_leg: pd.Series, rfv: pd.Series, A: float, years: float):
        idxp = pr.r.index
        m_fee = apply_leg_fee(m_leg.loc[idxp], A)
        d = daily_metrics(pr.r.to_numpy(), rfv.loc[idxp].to_numpy(), A, years)
        rm = month_compound(pr.r)
        rfm = month_compound(rfv.loc[idxp])
        com = rm.index.intersection(rfm.index)
        mo = monthly_metrics(rm.loc[com].to_numpy(), rfm.loc[com].to_numpy())
        return {"daily": d, "monthly": mo, "turnoverPerYear": pr.turnover, "rebalanceCount": pr.rebalances}


    # 1985–1999 股息近似（只报告）
    print("approx 1985-1999...")
    shiller = read_shiller()
    idx85_px = gspc_r.loc[REPORT_NDX[0]:REPORT_NDX[1]].index.intersection(ndx_r.loc[REPORT_NDX[0]:REPORT_NDX[1]].index)
    meta85_pre = window_meta(idx85_px)
    gspc_tr = dividend_augmented_returns(gspc_r.loc[idx85_px], "gspc", shiller, meta85_pre["A"])
    ndx_tr = dividend_augmented_returns(ndx_r.loc[idx85_px], "ndx", shiller, meta85_pre["A"])
    rf85 = rf.reindex(idx85_px).ffill()
    last_rf_val = float(rf.iloc[-1]) if len(rf) else 0.0
    rf85 = rf85.fillna(last_rf_val)
    g85, n85, r85 = gspc_tr, ndx_tr, rf85
    meta85 = window_meta(idx85_px)
    k1_85 = run_k1(g85, n85, r85, meta85["A"], fee=False)
    k2_85 = run_k2(g85, r85, meta85["A"], k2_signal_frame((1.0 + g85).cumprod()), fee=False)
    approx_1985 = {
        "window": meta85,
        "note": "价格收益 + 股息近似（GSPC=Shiller D/P 月摊日；NDX=0.6%/年÷A）；只报告非证据",
        "buyHold": {
            "GSPC": daily_metrics(g85.to_numpy(), r85.to_numpy(), meta85["A"], meta85["years"]),
            "NDX": daily_metrics(n85.to_numpy(), r85.to_numpy(), meta85["A"], meta85["years"]),
        },
        "K1_70_30": path_monthly_pack(k1_85, g85, r85, meta85["A"], meta85["years"]),
        "K2_on_GSPC": path_monthly_pack(k2_85, g85, r85, meta85["A"], meta85["years"]),
        "proxy": proxy(n85, g85, REPORT_NDX[0], REPORT_NDX[1]),
    }
    # E5 price signal = Mkt-RF only as proxy for price
    e5 = eval_k2(*MAIN_W, m_raw, rf, label="E5", sig=sig_kf_price)
    # E6: K1 日收益作腿，信号仍用市场 I
    k1p = k1_main["_path"]
    e6 = eval_k2(*MAIN_W, m_raw, rf, label="E6_K1plusK2", sig=sig_kf,
                 path_fn=lambda ix, AA: run_e6(m_raw.loc[ix], g_raw.loc[ix], rf.loc[ix], AA, sig_kf))

    # 融资敏感性
    print("funding sensitivity...")
    k2_sp30 = eval_k2(*MAIN_W, m_raw, rf, spread=SPREAD_HI, label="spread_3pct", sig=sig_kf)
    # 固定 6%：把融资改成 6%/A（无 RF）——临时 patch 用 spread 技巧不够，直接重跑简易路径
    def k2_fixed6():
        pr = run_k2(mw_m, mw_rf, meta["A"], sig_kf, fixed_fin=FIXED_FIN)
        rm = month_compound(pr.r)
        rfm = month_compound(mw_rf.loc[pr.r.index])
        com = rm.index.intersection(rfm.index)
        return monthly_metrics(rm.loc[com].to_numpy(), rfm.loc[com].to_numpy())

    k2_fix6 = k2_fixed6()
    # 成本敏感性：COST=0.002
    e_cost20 = run_k2(mw_m, mw_rf, meta["A"], sig_kf, cost=0.002)
    cost20_pack = path_monthly_pack(e_cost20, mw_m, mw_rf, meta["A"], meta["years"])

    def strip(o):
        if not isinstance(o, dict):
            return o
        return {k: strip(v) for k, v in o.items() if not str(k).startswith("_")}

    def sub_mdd(path_r: pd.Series, a: str, b: str) -> dict | None:
        sl = path_r.loc[a:b]
        sm = k2_main["_m_fee"].loc[a:b]
        if len(sl) < 2:
            return None
        return {
            "from": a, "to": b,
            "maxDd": float(max_dd(np.cumprod(1.0 + sl.to_numpy()))[0]),
            "cumReturn": float(np.prod(1.0 + sl.to_numpy()) - 1.0),
            "M_maxDd": float(max_dd(np.cumprod(1.0 + sm.to_numpy()))[0]),
            "M_cumReturn": float(np.prod(1.0 + sm.to_numpy()) - 1.0),
        }

    k2_mdd_2932 = sub_mdd(k2_main["_path"].r, "1929-01-01", "1932-12-31")
    k2_mdd_3738 = sub_mdd(k2_main["_path"].r, "1937-01-01", "1938-12-31")
    k2_te = tracking_error_annual(k2_main["_rm"], k2_main["_rmm"])
    k2_rel_m = (1.0 + k2_main["_rm"]) / (1.0 + k2_main["_rmm"]) - 1.0
    k2_worst36 = worst_rolling36(k2_rel_m)

    first = (
        f"K1 主窗口年化波动 {k1_main['K1']['daily']['vol']:.2%}（M {k1_main['M']['daily']['vol']:.2%}），"
        f"最大回撤 {k1_main['K1']['daily']['maxDd']:.2%}（M {k1_main['M']['daily']['maxDd']:.2%}）；"
        f"同波动效率需把股票暴露调到约 {k1_main['k']:.2f} 倍。"
        f"K2 最大回撤 {k2_main['K2']['daily']['maxDd']:.2%}。"
    )

    windows = {
        "main": k1_main["_meta"],
        "half1": k1_h1["_meta"],
        "half2": k1_h2["_meta"],
        "veto_kf": k1_v1["_meta"],
        "veto_etf": k1_v2["_meta"],
    }

    # trade details filter
    def filter_trades(trades, a, b):
        out = []
        for t in trades:
            sd = t.get("signalDate") or t.get("execDate")
            if sd and a <= sd <= b:
                out.append(t)
        return out

    trades = path.extra.get("trades", [])
    trade_details = {
        "1930_spring": filter_trades(trades, "1930-01-01", "1930-06-30"),
        "1932_summer": filter_trades(trades, "1932-04-01", "1932-09-30"),
        "1937": filter_trades(trades, "1937-01-01", "1938-12-31"),
    }

    results = {
        "meta": {
            "ledger": "L-049",
            "preregCommit": "15b95bb2",
            "preregPath": "docs/research/spx-qqq-tilt-2026-11-28/PREREG.md",
            "impl": "main-python",
            "seed": SEED,
            "notes": notes,
        },
        "inputs": inputs,
        "proxyQuality": proxy_quality,
        "windows": windows,
        "K1": {
            "main": strip(k1_main),
            "halves": {"1927_1949": strip(k1_h1), "1950_1972": strip(k1_h2)},
            "veto": {"kf1973_1984": strip(k1_v1), "spyQqq1999_2026": strip(k1_v2)},
            "decision": {"grade": grade_k1, "conditions": cond_k1},
        },
        "K2": {
            "main": strip(k2_main),
            "halves": {"1927_1949": strip(k2_h1), "1950_1972": strip(k2_h2)},
            "veto": {"kf1973_1984": strip(k2_v1), "spy1999_2026": strip(k2_v2)},
            "leverageByPeakSegment": lev_seg,
            "tradeDetails": trade_details,
            "placebo": {
                "N": N,
                "pDeltaCer": p_cer,
                "pMeanDailyExcessDiff": p_ex,
                "conditionalP": p_cond,
                "conditional": conditional_block,
            },
            "decision": {"grade": grade_k2, "conditions": cond_k2},
        },
        "exploratory": {
            "E1": {"main": strip(e1), "path1929_1932": path_pts, "liquidateIfNoRebalance": e1_liq},
            "E2": {"dd15": strip(e2_15), "dd25": strip(e2_25)},
            "E3": {
                "band3": strip(e3_b3),
                "band10": strip(e3_b10),
                "annual": {**strip(e3_ann), "note": "日历年最后一个交易日收盘产生指令，下一交易日收盘调回 70/30（CLARIFY-2 §2）；窗口末日指令落在窗口外不执行"},
                "never": {**strip(e3_never), "note": "只在首日建仓"},
            },
            "E4": {"tilt20": strip(e4_20), "tilt40": strip(e4_40)},
            "E5": strip(e5),
            "E6": strip(e6),
        },
        "report": {
            "headlineAbsoluteRisk": {
                "K1_volVsM": k1_main["K1"]["daily"]["vol"] - k1_main["M"]["daily"]["vol"],
                "K1_maxDdVsM": k1_main["K1"]["daily"]["maxDd"] - k1_main["M"]["daily"]["maxDd"],
                "K1_kForSameVol": k1_main["k"],
                "K2_maxDd": k2_main["K2"]["daily"]["maxDd"],
                "K2_1929_32": k2_mdd_2932,
                "K2_1937_38": k2_mdd_3738,
            },
            "alwaysReport": {
                "K1": {
                    "trackingError": k1_main["trackingError"],
                    "worstRolling36": k1_main["worstRolling36"],
                    "turnoverPerYear": k1_main["turnoverPerYear"],
                    "rebalanceCount": k1_main["rebalanceCount"],
                    "tailPolyline": k1_main["tailPolyline"],
                    "tailPriorHigh": k1_main["tailPriorHigh"],
                },
                "K2": {
                    "trackingError": k2_te,
                    "worstRolling36": k2_worst36,
                    "turnoverPerYear": k2_main["_path"].turnover,
                    "rebalanceCount": k2_main["_path"].rebalances,
                    "tailPolyline": k2_main["tailPolyline"],
                    "tailPriorHigh": k2_main["tailPriorHigh"],
                    "concentrationMaxShare": max_share,
                    "leverageByPeakSegment": lev_seg,
                },
            },
            "knownResult1999_2026": {
                "note": "已知结果，不是证据",
                "K1": strip(k1_v2),
                "K2": strip(k2_v2),
            },
            "approx1985_1999": approx_1985,
            "costSensitivity": {
                "cost05bps": {"note": "主口径单边 0.05%", "K2_cerG5": k2_main["K2"]["monthly"]["cerG5"]},
                "cost20bps": {"note": "单边 0.20%", "K2": cost20_pack},
            },
            "fundingSensitivity": {
                "rfPlus15": {"note": "主口径 RF+1.5%", "deltaCerVsMstar": k2_main["deltaCerVsMstar"], "deltaCerVsM": k2_main["deltaCerVsM"]},
                "rfPlus30": {"deltaCerVsMstar": k2_sp30["deltaCerVsMstar"], "deltaCerVsM": k2_sp30["deltaCerVsM"], "cerG5": k2_sp30["K2"]["monthly"]["cerG5"]},
                "fixed6pct": {"cerG5": k2_fix6["cerG5"], "sharpe": k2_fix6["sharpe"]},
            },
            "holm": {"pK1": p_k1, "pK2": p_k2, "adjusted": {"pK1": adj[0], "pK2": adj[1]}},
        },
        "verdict": {"K1": grade_k1, "K2": grade_k2, "firstSentence": first},
    }

    def default(o):
        if isinstance(o, (np.floating,)):
            x = float(o)
            if math.isnan(x):
                return None
            if math.isinf(x):
                return "-inf" if x < 0 else "inf"
            return x
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, np.bool_):
            return bool(o)
        raise TypeError(type(o))

    OUT.write_text(json.dumps(results, indent=2, ensure_ascii=False, default=default) + "\n", encoding="utf-8")
    print("wrote", OUT)
    print("VERDICT", grade_k1, grade_k2)
    print(first)


if __name__ == "__main__":
    main()
