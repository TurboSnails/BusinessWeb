"""L-029 期权保护防急跌：按 PREREG.md 计算 C1（PPUT）、C2（CLLZ）与探索项。

股票含息日收益与现金日收益沿用 research-py/engines/e1.py 的输入与股息反推口径。
用法：cd research-py && uv run python ../docs/research/option-hedge-2026-11-26/run.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import brentq

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "research-py"))
from engines import e1  # noqa: E402

START, END = "1986-07-01", "2026-10-30"
BASE_DAY = "1986-06-30"
SENS_START = "1990-01-02"
CLL_SPLICE = "2020-07-10"
EXPLORE_FROM = {"PUT": "2007-01-03"}
SPLIT = "2006-01-01"
CAP = 0.8
WINDOW = 60
DEPTH = -0.15
EXTRA_COST = 0.005
CONFIRM = ["PPUT", "CLLZ"]
EXPLORE = ["VXTH", "PPUT3M", "CLL_SPLICED", "PUT", "BXM"]


def daily_base() -> tuple[pd.DataFrame, pd.Index]:
    """标普含息日收益与现金日收益（E1 口径：月股息、月现金按当月交易日平均分摊）。"""
    inp = e1.load_inputs()
    closes = inp.closes
    df = pd.DataFrame({"close": closes})
    df["month"] = df.index.str[:7]
    df["n"] = df.groupby("month")["close"].transform("size")

    def dividend(m: str) -> float:
        return float(inp.spx_ret[m] - (inp.price[m] / inp.price[e1.month_after(m, -1)] - 1))

    months = df["month"].unique()
    div = {m: dividend(m) for m in months if m in inp.spx_ret.index and e1.month_after(m, -1) in inp.price.index}
    df["stock"] = df["close"].pct_change() + df["month"].map(div) / df["n"]
    df["cash"] = df["month"].map(inp.cash.astype(float)) / df["n"]
    return df.loc[START:END, ["stock", "cash"]], df.index


def load_cboe() -> tuple[pd.DataFrame, str]:
    path = HERE / "inputs/processed/cboe_daily.csv"
    raw = path.read_bytes()
    df = pd.read_csv(path)
    date_col = df.columns[0]
    df[date_col] = pd.to_datetime(df[date_col]).dt.strftime("%Y-%m-%d")
    df = df.set_index(date_col).sort_index()
    # CLL 拼接：2020-07-10 及以前用旧站快照，之后用现行文件（水平在拼接日两版相同，按收益拼接）
    legacy, cur = df["CLL_legacy"], df["CLL"]
    r = pd.concat([legacy.loc[:CLL_SPLICE].pct_change(), cur.loc[CLL_SPLICE:].pct_change().iloc[1:]])
    df["CLL_SPLICED"] = (1 + r.fillna(0)).cumprod().where(pd.concat([legacy.loc[:CLL_SPLICE], cur.loc[CLL_SPLICE:].iloc[1:]]).notna())
    return df, hashlib.sha256(raw).hexdigest()


def stats_of(r: np.ndarray, cash: np.ndarray, dates: np.ndarray) -> dict:
    nav = np.cumprod(1 + r)
    years = len(r) / 252
    peak = np.maximum.accumulate(np.concatenate([[1.0], nav]))
    month = pd.Series(dates).str[:7].to_numpy()
    mret = pd.Series(r).groupby(month).apply(lambda x: float(np.prod(1 + x) - 1))
    mcash = pd.Series(cash).groupby(month).apply(lambda x: float(np.prod(1 + x) - 1))
    ex = (mret - mcash).to_numpy()
    return {
        "cagr": float(nav[-1] ** (1 / years) - 1),
        "vol": float(np.std(r, ddof=1) * math.sqrt(252)),
        "maxDd": float((np.concatenate([[1.0], nav]) / peak - 1).min()),
        "sharpe": float(math.sqrt(12) * ex.mean() / ex.std(ddof=1)),
    }


def find_events(v: np.ndarray, dates: np.ndarray) -> list[dict]:
    """60 个交易日内跌幅 ≥ 15% 的急跌，贪心取最深、去掉重叠窗口。"""
    n = len(v)
    cands = []
    for j in range(1, n):
        lo = max(0, j - WINDOW)
        i = lo + int(np.argmax(v[lo:j]))
        d = v[j] / v[i] - 1
        if d <= DEPTH:
            cands.append((d, i, j))
    cands.sort()
    events = []
    for d, i, j in cands:
        if any(not (j < e["i"] or i > e["j"]) for e in events):
            continue
        events.append({"i": i, "j": j, "peak": dates[i], "trough": dates[j], "depth": float(d)})
    return sorted(events, key=lambda e: e["i"])


def window_ret(r: np.ndarray, e: dict) -> float:
    # 高点收盘到低点收盘：日收益 i+1 … j
    return float(np.prod(1 + r[e["i"] + 1 : e["j"] + 1]) - 1)


def same_vol_weight(target_vol: float, stock: np.ndarray, cash: np.ndarray) -> float:
    f = lambda w: np.std(w * stock + (1 - w) * cash, ddof=1) - target_vol  # noqa: E731
    return float(brentq(f, 0.0, 2.0))


def monthly(r: np.ndarray, dates: np.ndarray) -> np.ndarray:
    month = pd.Series(dates).str[:7].to_numpy()
    return pd.Series(r).groupby(month).apply(lambda x: float(np.prod(1 + x) - 1)).to_numpy()


def evaluate(name: str, idx_ret: np.ndarray, base: pd.DataFrame, mask: np.ndarray, events: list[dict], extra_cost: float = 0.0, drop: tuple = ()) -> dict:
    dates = base.index.to_numpy()[mask]
    stock = base["stock"].to_numpy()[mask]
    cash = base["cash"].to_numpy()[mask]
    leg = idx_ret[mask] - extra_cost / 252
    cand = CAP * leg + (1 - CAP) * cash
    w = same_vol_weight(np.std(cand, ddof=1), stock, cash)
    m = w * stock + (1 - w) * cash
    b80 = CAP * stock + (1 - CAP) * cash
    ev = [e for e in events if e["peak"] >= dates[0] and e["trough"] <= dates[-1] and e["peak"][:4] not in drop]
    pos = {d: k for k, d in enumerate(dates)}
    idx = [{"i": pos[e["peak"]], "j": pos[e["trough"]]} for e in ev]

    def ev_rows(series: dict) -> list[dict]:
        return [{"peak": e["peak"], "trough": e["trough"], "depth": e["depth"],
                 **{k: window_ret(r, ee) for k, r in series.items()}} for e, ee in zip(ev, idx)]

    def L(rs, a="cand", b="m"):
        num = sum(math.log1p(x[a]) for x in rs)
        den = sum(math.log1p(x[b]) for x in rs)
        return None if not rs or den == 0 else num / den

    rows = ev_rows({"cand": cand, "m": m, "b80": b80})
    for x, ee in zip(rows, idx):
        after = {"i": ee["j"], "j": min(ee["j"] + 60, len(cand) - 1)}
        x["after60"] = window_ret(cand, after) - window_ret(m, after)
        x["ratio"] = math.log1p(x["cand"]) / math.log1p(x["m"])

    s_c, s_m, s_b = stats_of(cand, cash, dates), stats_of(m, cash, dates), stats_of(b80, cash, dates)
    first = [x for x in rows if x["peak"] < SPLIT]
    second = [x for x in rows if x["peak"] >= SPLIT]

    def alt(w2: float) -> dict:
        m2 = w2 * stock + (1 - w2) * cash
        r2 = ev_rows({"cand": cand, "m": m2})
        return {"w": w2, "L": L(r2), "wins": sum(x["cand"] > x["m"] for x in r2), "deltaA": s_c["cagr"] - stats_of(m2, cash, dates)["cagr"]}

    sens = {}
    if rows:
        mc = monthly(cand, dates)
        # M 每日再平衡：月收益取 M 日收益在当月连乘（第二实现指出原写法相当于按月再平衡，已改正）
        w_mon = float(brentq(lambda x: np.std(monthly(x * stock + (1 - x) * cash, dates), ddof=1) - np.std(mc, ddof=1), 0.0, 2.0))
        keep = np.ones(len(cand), bool)
        for ee in idx:
            keep[ee["i"] + 1 : ee["j"] + 1] = False
        w_ex = same_vol_weight(np.std(cand[keep], ddof=1), stock[keep], cash[keep])
        target = sum(math.log1p(x["cand"]) for x in rows)
        w_L = float(brentq(lambda x: sum(math.log1p(window_ret(x * stock + (1 - x) * cash, ee)) for ee in idx) - target, 0.0, 2.0))
        loo = [L([x for k, x in enumerate(rows) if k != drop_k]) for drop_k in range(len(rows))] if len(rows) > 1 else []
        sens = {"Mmon": alt(w_mon), "Mex": alt(w_ex), "sameLoss": alt(w_L),
                "looRange": [min(loo), max(loo)] if loo else None, "ratioMedian": float(np.median([x["ratio"] for x in rows]))}
    out = {
        "name": name, "from": dates[0], "to": dates[-1], "w": w, "events": rows,
        "L": L(rows), "wins": sum(x["cand"] > x["m"] for x in rows), "n": len(rows),
        "deltaA": s_c["cagr"] - s_m["cagr"], "deltaSharpe": s_c["sharpe"] - s_m["sharpe"],
        "Lfirst": L(first), "Lsecond": L(second), "nFirst": len(first), "nSecond": len(second),
        "cand": s_c, "M": s_m, "B80": s_b, "report": sens,
    }
    return out


def gates(main: dict, costly: dict) -> dict:
    g = {
        "G1": main["L"] is not None and main["L"] <= 0.85,
        "G2": main["n"] > 0 and main["wins"] >= 0.7 * main["n"],
        "G3": main["deltaA"] >= -0.005,
        "G4": all(x is not None and x <= 0.95 for x in (main["Lfirst"], main["Lsecond"])),
        "G5": costly["L"] is not None and costly["L"] <= 0.85 and costly["deltaA"] >= -0.005,
    }
    if not g["G1"]:
        verdict = "不起作用"
    elif all(g.values()):
        verdict = "通过"
    elif g["G2"] and g["G4"] and (not g["G3"] or not g["G5"]):
        verdict = "有保护作用，但比直接调低上限贵"
    else:
        verdict = "部分成立"
    if main["n"] < 5 and verdict in ("通过", "有保护作用，但比直接调低上限贵"):
        verdict = "部分成立"
    return {"gates": g, "verdict": verdict}


def main() -> None:
    base, calendar = daily_base()
    cboe, sha = load_cboe()
    if base.isna().any().any():
        raise SystemExit(f"基础数据有缺失：{base[base.isna().any(axis=1)].index[:5].tolist()}")
    v = np.cumprod(1 + base["stock"].to_numpy())
    dates = base.index.to_numpy()
    events = find_events(v, dates)

    results = {"study": "L-029", "inputSha256": {"cboe_daily.csv": sha}, "events": events, "confirm": {}, "explore": {}}
    for name in CONFIRM + EXPLORE:
        if name not in cboe.columns:
            results["explore" if name in EXPLORE else "confirm"][name] = {"missing": True}
            continue
        px = cboe[name].reindex(calendar)
        first = max(px.first_valid_index(), BASE_DAY, EXPLORE_FROM.get(name, BASE_DAY))
        last = min(px.last_valid_index(), END)
        seg = px.loc[first:last]
        gaps = seg[seg.isna()].index.tolist()
        # 缺收盘的交易日用前一日收盘填充（当天收益 0，次日补回）
        ret = seg.ffill().pct_change(fill_method=None).reindex(base.index).to_numpy()
        mask = (base.index > first) & (base.index <= last)
        main_r = evaluate(name, ret, base, mask, events)
        main_r["filledDays"] = gaps
        main_r["eventsOnFilledDays"] = [e["peak"] for e in main_r["events"] if e["peak"] in gaps or e["trough"] in gaps]
        if name in CONFIRM:
            costly = evaluate(name, ret, base, mask, events, EXTRA_COST)
            late = evaluate(name, ret, base, mask & (base.index >= SENS_START), events)
            no87 = evaluate(name, ret, base, mask, events, drop=("1987",))
            results["confirm"][name] = {
                **main_r, "costly": {k: costly[k] for k in ("L", "deltaA", "deltaSharpe", "w")},
                "from1990": {k: late[k] for k in ("from", "L", "wins", "n", "deltaA", "deltaSharpe", "w")},
                "drop1987": {k: no87[k] for k in ("L", "wins", "n")},
                **gates(main_r, costly),
            }
        else:
            results["explore"][name] = main_r

    (HERE / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"急跌事件 {len(events)} 个：" + "、".join(f"{e['peak']}→{e['trough']} {e['depth']:.1%}" for e in events))
    for sect in ("confirm", "explore"):
        for name, r in results[sect].items():
            if "L" not in r:
                print(name, r)
                continue
            line = f"{name} {r['from']}–{r['to']} w={r['w']:.3f} L={r['L']} 胜 {r['wins']}/{r['n']} ΔA={r['deltaA']:+.4f} Δ夏普={r['deltaSharpe']:+.3f}"
            if sect == "confirm":
                line += f" L前/后={r['Lfirst']}/{r['Lsecond']} 加成本 L={r['costly']['L']} ΔA={r['costly']['deltaA']:+.4f} → {r['verdict']} {r['gates']} 1990起 {r['from1990']} 去87 {r['drop1987']} 填充 {r['filledDays']}"
            print(line)


if __name__ == "__main__":
    main()
