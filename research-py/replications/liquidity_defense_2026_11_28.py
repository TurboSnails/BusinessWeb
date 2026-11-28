"""L-047 A 股流动性踩踏防守（跌停潮 / 冲击成本飙升 → 减仓）独立第二实现。

只依据 docs/research/liquidity-defense-2026-11-28/PREREG.md 与输入数据写成，出数前未读 run.py。
运行：cd research-py && uv run python replications/liquidity_defense_2026_11_28.py --json <out>

约定：
- 日期索引 = 文件中 <= 2023-10-31 的全部日期（市场交易日）；"前一日" = 索引中上一行。
- 样本股（t 日）：is_st 非 True、is_suspended 非 True、amount > 0、截至 t（含）close_adj 非空天数 > 60。
- r = close_adj_t / close_adj_{t-1} - 1（任一缺失则 NaN）。
- M_t = Σ r·mcap_float_{t-1} / Σ mcap_float_{t-1}，样本股中 r 有限且 mcap_float_{t-1} > 0。
- LD_t = 样本股中 limit_down 为 True 的个数 / 样本股个数。
- illiq = |r| / amount（样本日、r 有限）；5 日滚动均值（至少 3 个观测）；
  ILLIQ_t = 按 mcap_float_t 加权（样本股、5 日均值有限、mcap_float_t > 0）。
  R_t = ILLIQ_t / 前 250 日（不含 t，至少 200 个）ILLIQ 中位数。
- M 净值 = cumprod(1+M)（NaN 当 0）；below20 = 净值 < 含当日 20 日均值（不足 20 日为 False）。
- C1：LD >= 0.05；C2：R >= 2 且 below20。触发日 t → 行 t+2..t+21 仓位 0.5，否则 1.0。
- 策略日收益 = e·M + (1-e)·cash − 0.001·|Δe|（主窗口内首日 Δe = 0），cash = 0.015/252。
- 夏普 = mean(ret−cash)/std(ddof=1)·√252；最大回撤按 cumprod 净值（不含起点 1）。
- 大跌段：主窗口 M 净值的峰谷，回撤 <= -20% 即成段，谷 = 回到新高（>= 旧峰）前的最低点；末段未修复则止于谷。
- 安慰剂：np.roll(e, k)，k = 250, 271, …, <= N−250；重算含成本收益与 ΔS；p = (#{ΔS_k >= ΔS}+1)/(K+1)；Holm(C1, C2)。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PRICES = ROOT / "research-py/factor-data/cn/prices.parquet"
LOCK_END = pd.Timestamp("2023-10-31")
MAIN_START = pd.Timestamp("2006-01-04")
HALF1 = (pd.Timestamp("2006-01-04"), pd.Timestamp("2014-12-31"))
HALF2 = (pd.Timestamp("2015-01-01"), pd.Timestamp("2023-10-31"))
CASH = 0.015 / 252
COST = 0.001
LOW = 0.5


def load() -> dict[str, pd.DataFrame]:
    cols = ["date", "code", "close_adj", "amount", "mcap_float", "limit_down", "is_st", "is_suspended"]
    df = pd.read_parquet(PRICES, columns=cols, filters=[("date", "<=", LOCK_END)])
    assert df["date"].max() <= LOCK_END, "lockbox violated"
    assert not df.duplicated(["date", "code"]).any()
    out = {}
    for c in cols[2:]:
        w = df.pivot(index="date", columns="code", values=c).sort_index()
        out[c] = w
    return out


def signals(d: dict[str, pd.DataFrame]) -> pd.DataFrame:
    close = d["close_adj"]
    idx, codes = close.index, close.columns
    amount = d["amount"].reindex(index=idx, columns=codes)
    mcap = d["mcap_float"].reindex(index=idx, columns=codes)

    def boolw(name: str) -> np.ndarray:
        w = d[name].reindex(index=idx, columns=codes)
        # null / NaN / missing row -> False
        return w.astype(object).eq(True).fillna(False).to_numpy(dtype=bool)

    st, susp, ld = boolw("is_st"), boolw("is_suspended"), boolw("limit_down")
    c = close.to_numpy(dtype=float)
    a = amount.to_numpy(dtype=float)
    mc = mcap.to_numpy(dtype=float)

    nobs = np.cumsum(~np.isnan(c), axis=0)
    elig = (~st) & (~susp) & (a > 0) & (nobs > 60)

    cprev = np.vstack([np.full((1, c.shape[1]), np.nan), c[:-1]])
    mprev = np.vstack([np.full((1, c.shape[1]), np.nan), mc[:-1]])
    with np.errstate(divide="ignore", invalid="ignore"):
        r = c / cprev - 1.0
    fin_r = np.isfinite(r)

    # M
    okm = elig & fin_r & (mprev > 0)
    wM = np.where(okm, mprev, 0.0)
    num = np.where(okm, r, 0.0) * wM
    den = wM.sum(axis=1)
    M = np.where(den > 0, num.sum(axis=1) / np.where(den > 0, den, 1.0), np.nan)

    # LD
    ne = elig.sum(axis=1)
    LD = np.where(ne > 0, (elig & ld).sum(axis=1) / np.where(ne > 0, ne, 1), np.nan)

    # Amihud
    with np.errstate(divide="ignore", invalid="ignore"):
        ill = np.where(elig & fin_r, np.abs(r) / a, np.nan)
    ill5 = pd.DataFrame(ill).rolling(5, min_periods=3).mean().to_numpy()
    oki = elig & np.isfinite(ill5) & (mc > 0)
    wI = np.where(oki, mc, 0.0)
    denI = wI.sum(axis=1)
    ILLIQ = np.where(denI > 0, (np.where(oki, ill5, 0.0) * wI).sum(axis=1) / np.where(denI > 0, denI, 1.0), np.nan)
    s = pd.Series(ILLIQ, index=idx)
    med = s.shift(1).rolling(250, min_periods=200).median()
    R = s / med

    out = pd.DataFrame({"M": M, "LD": LD, "ILLIQ": ILLIQ, "R": R.to_numpy(), "n_elig": ne}, index=idx)
    nav = (1 + out["M"].fillna(0.0)).cumprod()
    ma20 = nav.rolling(20).mean()
    out["below20"] = (nav < ma20).fillna(False) & ma20.notna()
    out["C1"] = out["LD"] >= 0.05
    out["C2"] = (out["R"] >= 2) & out["below20"]
    for k in ("C1", "C2"):
        trig = out[k].fillna(False).to_numpy()
        e = np.ones(len(out))
        for t in np.flatnonzero(trig):
            e[t + 2: t + 22] = LOW
        out["e_" + k] = e
    return out


def strat(e: np.ndarray, M: np.ndarray) -> np.ndarray:
    de = np.abs(np.diff(e, prepend=e[0]))
    return e * M + (1 - e) * CASH - COST * de


def sharpe(x: np.ndarray) -> float:
    ex = x - CASH
    return float(ex.mean() / ex.std(ddof=1) * np.sqrt(252))


def maxdd(x: np.ndarray) -> float:
    nav = np.cumprod(1 + x)
    return float((nav / np.maximum.accumulate(nav) - 1).min())


def episodes(M: np.ndarray, thr: float = -0.20) -> list[tuple[int, int]]:
    nav = np.cumprod(1 + M)
    eps = []
    pk, in_ep = 0, False
    for i in range(1, len(nav)):
        if nav[i] >= nav[pk]:
            if in_ep:
                tr = pk + int(np.argmin(nav[pk:i + 1]))
                eps.append((pk, tr))
                in_ep = False
            pk = i
        elif nav[i] / nav[pk] - 1 <= thr:
            in_ep = True
    if in_ep:
        eps.append((pk, pk + int(np.argmin(nav[pk:]))))
    return eps


def ep_losses(x: np.ndarray, eps: list[tuple[int, int]]) -> list[float]:
    nav = np.cumprod(1 + x)
    return [float(nav[t] / nav[p] - 1) for p, t in eps]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path)
    args = ap.parse_args()

    d = load()
    sig = signals(d)
    w = sig.loc[MAIN_START:LOCK_END]
    dates = w.index
    M = w["M"].fillna(0.0).to_numpy()
    N = len(M)
    b0 = strat(np.ones(N), M)
    S0 = sharpe(b0)
    eps = episodes(M)
    h1 = (dates >= HALF1[0]) & (dates <= HALF1[1])
    h2 = (dates >= HALF2[0]) & (dates <= HALF2[1])
    ks = list(range(250, N - 250 + 1, 21))

    res: dict = {
        "N_main": N,
        "main_start": str(dates[0].date()),
        "main_end": str(dates[-1].date()),
        "B0": {"sharpe": S0, "maxdd": maxdd(b0)},
        "episodes": [{"peak": str(dates[p].date()), "trough": str(dates[t].date()),
                      "M_loss": float(np.cumprod(1 + M)[t] / np.cumprod(1 + M)[p] - 1)} for p, t in eps],
        "B0_episode_losses": ep_losses(b0, eps),
        "K_placebo": len(ks),
        "candidates": {},
    }
    for c in ("C1", "C2"):
        e = w["e_" + c].to_numpy()
        x = strat(e, M)
        ebar = float(e.mean())
        bc = strat(np.full(N, ebar), M)
        S, Sc = sharpe(x), sharpe(bc)
        dS = S - S0
        lc, lb = ep_losses(x, eps), ep_losses(bc, eps)
        L = sum(lc) / sum(lb)
        dh1 = sharpe(x[h1]) - sharpe(b0[h1])
        dh2 = sharpe(x[h2]) - sharpe(b0[h2])
        dSk = np.array([sharpe(strat(np.roll(e, k), M)) - S0 for k in ks])
        p = float(((dSk >= dS).sum() + 1) / (len(ks) + 1))
        res["candidates"][c] = {
            "trigger_days_main": int(w[c].fillna(False).sum()),
            "sharpe": S, "sharpe_B0": S0, "sharpe_Bc": Sc, "dS": dS,
            "maxdd": maxdd(x), "maxdd_B0": maxdd(b0), "maxdd_Bc": maxdd(bc),
            "avg_exposure": ebar,
            "episode_losses": lc, "Bc_episode_losses": lb, "L": L,
            "dS_half1": dh1, "dS_half2": dh2,
            "p": p,
        }
    # Holm
    ps = {c: res["candidates"][c]["p"] for c in ("C1", "C2")}
    order = sorted(ps, key=lambda c: ps[c])
    adj, run = {}, 0.0
    for i, c in enumerate(order):
        run = max(run, min(1.0, (len(order) - i) * ps[c]))
        adj[c] = run
    for c in ("C1", "C2"):
        r = res["candidates"][c]
        r["p_holm"] = adj[c]
        g = {
            "G1": r["dS"] >= 0.05,
            "G2": (r["sharpe"] >= r["sharpe_Bc"]) and (r["maxdd"] - r["maxdd_Bc"] >= 0.03),
            "G3": r["L"] <= 0.90,
            "G4": (r["dS_half1"] > 0) and (r["dS_half2"] > 0),
            "G5": r["p_holm"] <= 0.10,
        }
        r["gates"] = {k: bool(v) for k, v in g.items()}
        if all(g.values()):
            v = "通过"
        elif g["G1"] and g["G2"] and g["G4"]:
            v = "部分成立"
        elif r["dS"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        r["verdict"] = v
    s = json.dumps(res, ensure_ascii=False, indent=2)
    print(s)
    if args.json:
        args.json.write_text(s)


if __name__ == "__main__":
    main()
