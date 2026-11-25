"""L-021 多资产降波动检验的主实现，严格按 docs/research/multi-asset-2026-11-25/PREREG.md。

口径沿用已逐层复现的 E1（engines/e1.py）：信号月月末定权重，次月第 3 个交易日收盘成交，期内每天按目标权重再平衡。
各资产对齐到标普交易日：国债与黄金用（总回报）指数在标普交易日上向前填充，某资产当天没有数据则当天收益为 0，
下一个有数据的日子补上累计变化。

用法（在 research-py/ 下）：uv run python -m engines.multi_asset
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from engines import e1
from engines.calibrate_b0 import cvar5, deepest3

RES = e1.REPO / "docs/research/multi-asset-2026-11-25"
PROC = e1.REPO / "research-py/data/processed"

WINDOW = 252
TRADE_COST = {"stock": 0.0010, "bond": 0.0005, "gold": 0.0015}
HOLD_FEE = {"stock": 0.0003, "bond": 0.0015, "gold": 0.0040}
GOLD_CAP = 1 / 3
BOND_DURATION = 4.5
NONINFERIOR_SR = -0.03
NONINFERIOR_TAIL = 0.05
SEED = 20261125
DRAWS = 10000
BLOCK = 12
SEGMENTS = {"train": ("1976-01", "1999-12"), "valid": ("2000-01", "2026-08")}
LOCKBOX = ("1963-01", "1972-12")
STRESS = [
    ("1976-01-01", "1981-12-31", "1976–1981 通胀与加息"),
    ("2007-10-01", "2009-03-31", "2007–2009 金融危机"),
    ("2020-02-01", "2020-03-31", "2020 年 2–3 月急跌"),
    ("2022-01-01", "2022-12-31", "2022 年股债双杀"),
]


# ---------- 数据 ----------
@dataclass
class Market:
    dates: np.ndarray
    stock_px: np.ndarray  # 标普价格日收益（不含股息，用于估波动）
    bond: np.ndarray  # 国债日总回报（对齐后）
    gold: np.ndarray  # 黄金日收益（对齐后，1975 年以前为 nan）
    dy: np.ndarray  # 5 年期收益率日变化（小数，对齐后）
    infl: np.ndarray  # 当日 CPI 通胀（月度变化按标普交易日平均分摊）


def load_market(inp: e1.Inputs) -> Market:
    dates = inp.closes.index.to_numpy()
    closes = inp.closes.to_numpy()
    stock_px = np.concatenate([[np.nan], closes[1:] / closes[:-1] - 1])

    bond = pd.read_csv(PROC / "bond5_daily.csv", index_col=0)
    bond.index = bond.index.astype(str)
    idx = (1 + bond["ret"].fillna(0)).cumprod()
    aligned_idx = idx.reindex(idx.index.union(dates)).ffill().reindex(dates)
    bond_ret = aligned_idx.pct_change().to_numpy()
    y = bond["yield"].reindex(bond.index.union(dates)).ffill().reindex(dates) / 100
    dy = y.diff().to_numpy()

    gold = pd.read_csv(PROC / "gold_daily.csv", index_col=0)["price"]
    gold.index = gold.index.astype(str)
    g = gold.reindex(gold.index.union(dates)).ffill().reindex(dates)
    gold_ret = g.pct_change().to_numpy()

    cpi = pd.read_csv(PROC / "cpi_monthly.csv", index_col=0)["cpi"]
    cpi.index = cpi.index.astype(str)
    full = pd.period_range(cpi.index[0], cpi.index[-1], freq="M").strftime("%Y-%m")
    cpi = cpi.reindex(full)
    cpi = np.exp(np.log(cpi).interpolate())  # 缺月（2025-10）几何插值
    mchg = cpi.pct_change()
    months = np.array([d[:7] for d in dates])
    counts = pd.Series(months).value_counts()
    infl = np.array([mchg.get(m, np.nan) / counts[m] for m in months])
    return Market(dates=dates, stock_px=stock_px, bond=bond_ret, gold=gold_ret, dy=dy, infl=infl)


def ann_vol(x: np.ndarray) -> float:
    x = x[~np.isnan(x)]
    return float(np.std(x, ddof=1) * np.sqrt(252))


# ---------- 权重 ----------
def inv_vol_weights(vols: dict[str, float], assets: list[str], cap_gold: bool = True) -> dict[str, float]:
    raw = {a: 1 / vols[a] for a in assets}
    total = sum(raw.values())
    w = {a: raw[a] / total for a in assets}
    if cap_gold and "gold" in w and w["gold"] > GOLD_CAP:
        excess = w["gold"] - GOLD_CAP
        others = [a for a in assets if a != "gold"]
        tot_o = sum(w[a] for a in others)
        for a in others:
            w[a] += excess * w[a] / tot_o
        w["gold"] = GOLD_CAP
    return w


def targets(kind: str, tier_weight: float, vols: dict[str, float], has_gold: bool) -> dict[str, float]:
    if kind == "B0":
        return {"stock": tier_weight}
    if kind == "REF":  # 参考行：v2.2 + 剩余全放国债
        return {"stock": tier_weight, "bond": 1 - tier_weight}
    if kind == "C1":
        rest = 1 - tier_weight
        if not has_gold:
            return {"stock": tier_weight, "bond": rest}
        # 债金之间纯按波动倒数分；黄金上限只作用于整个组合中的黄金占比（预注册），不在这一步截断
        sub = inv_vol_weights(vols, ["bond", "gold"], cap_gold=False)
        w = {"stock": tier_weight, "bond": rest * sub["bond"], "gold": rest * sub["gold"]}
        if w["gold"] > GOLD_CAP:  # 黄金上限：超出部分按比例分给股票和国债
            excess = w["gold"] - GOLD_CAP
            tot = w["stock"] + w["bond"]
            w["stock"] += excess * w["stock"] / tot
            w["bond"] += excess * w["bond"] / tot
            w["gold"] = GOLD_CAP
        return w
    if kind == "C2":
        return inv_vol_weights(vols, ["stock", "bond", "gold"] if has_gold else ["stock", "bond"])
    raise ValueError(kind)


# ---------- 模拟 ----------
def simulate(kind: str, inp: e1.Inputs, mk: Market, periods: pd.DataFrame, *, c: float = 1.0, has_gold: bool = True,
             bond: np.ndarray | None = None, gold: np.ndarray | None = None) -> dict:
    """返回逐日净收益（扣持有费与当期换手成本）、每期净/毛收益、平均权重、年换手。

    bond/gold 只替换收益序列（去漂移检验用）；权重始终按原始序列的波动计算，保持组合结构不变。
    """
    closes = inp.closes.to_numpy()
    bond = mk.bond if bond is None else bond
    gold = mk.gold if gold is None else gold
    daily_dates, daily_net, per_net, per_gross, per_cash, weights_log = [], [], [], [], [], []
    prev: dict[str, float] | None = None
    turnover = 0.0
    for p in periods.itertuples(index=False):
        t = p.i0  # 成交日；权重按信号月最后一个交易日的波动算
        last_signal_day = int(np.searchsorted(mk.dates, p.start)) - 1
        while mk.dates[last_signal_day][:7] != p.signal:
            last_signal_day -= 1
        lo = last_signal_day - WINDOW + 1
        vols = {
            "stock": ann_vol(mk.stock_px[lo:last_signal_day + 1]),
            "bond": ann_vol(mk.bond[lo:last_signal_day + 1]),
            "gold": ann_vol(mk.gold[lo:last_signal_day + 1]) if has_gold else np.nan,
        }
        w = targets(kind, p.weight, vols, has_gold)
        if kind == "B0":
            w = {"stock": w["stock"] * c}
        assets = ["stock", "bond", "gold"]
        trade = 0.0 if prev is None else sum(TRADE_COST[a] * abs(w.get(a, 0) - prev.get(a, 0)) for a in assets)
        turnover += 0.0 if prev is None else sum(abs(w.get(a, 0) - prev.get(a, 0)) for a in assets)
        prev = w
        cash_w = 1 - sum(w.values())
        idx = np.arange(p.i0 + 1, p.i1 + 1)
        stock = closes[idx] / closes[idx - 1] - 1 + p.div / p.n
        cash_d = p.cash / p.n
        gross = w.get("stock", 0) * stock + w.get("bond", 0) * np.nan_to_num(bond[idx]) + w.get("gold", 0) * np.nan_to_num(gold[idx]) + cash_w * cash_d
        fee = sum(w.get(a, 0) * HOLD_FEE[a] for a in assets) / 252
        net = gross - fee
        net[0] = (1 + net[0]) * (1 - trade) - 1
        daily_dates.append(mk.dates[idx])
        daily_net.append(net)
        per_net.append(float(np.prod(1 + net) - 1))
        per_gross.append(float(np.prod(1 + gross) - 1))
        per_cash.append(p.cash)
        weights_log.append(w)
    years = sum(len(x) for x in daily_net) / 252
    return {
        "dates": np.concatenate(daily_dates), "net": np.concatenate(daily_net),
        "perNet": np.array(per_net), "perGross": np.array(per_gross), "perCash": np.array(per_cash),
        "avgWeights": {a: float(np.mean([w.get(a, 0) for w in weights_log])) for a in ["stock", "bond", "gold"]},
        "turnoverPerYear": turnover / years,
    }


def metrics(sim: dict) -> dict:
    ex = sim["perNet"] - sim["perCash"]
    nav = np.cumprod(1 + sim["net"])
    navf = np.concatenate([[1.0], nav])
    return {
        "periods": int(len(ex)),
        "sharpe": float(np.sqrt(12) * ex.mean() / ex.std(ddof=1)),
        "vol": ann_vol(sim["net"]),
        "cvar5": cvar5(sim["perNet"]),
        "deepest3": deepest3(sim["perNet"]),
        "dailyMaxDd": float((navf / np.maximum.accumulate(navf) - 1).min()),
        "cagr": float(np.prod(1 + sim["perNet"]) ** (12 / len(ex)) - 1),
        "avgWeights": sim["avgWeights"],
        "turnoverPerYear": sim["turnoverPerYear"],
    }


def align_b0(inp, mk, periods, target_vol: float, has_gold: bool) -> tuple[float, dict, bool]:
    """二分法求 c，使 B0 的年化波动等于候选。返回 (c, B0 模拟, 是否需要杠杆)。"""
    hi_sim = simulate("B0", inp, mk, periods, c=1.0, has_gold=has_gold)
    if ann_vol(hi_sim["net"]) < target_vol:
        return 1.0, hi_sim, True
    lo, hi = 0.0, 1.0
    for _ in range(50):
        mid = (lo + hi) / 2
        if ann_vol(simulate("B0", inp, mk, periods, c=mid, has_gold=has_gold)["net"]) < target_vol:
            lo = mid
        else:
            hi = mid
    c = (lo + hi) / 2
    return c, simulate("B0", inp, mk, periods, c=c, has_gold=has_gold), False


def compare(cand: dict, base: dict) -> dict:
    return {
        "dSharpe": cand["sharpe"] - base["sharpe"],
        "cvar5Rel": cand["cvar5"] / base["cvar5"] - 1,  # 负数 = 候选更浅
        "deepest3Rel": cand["deepest3"] / base["deepest3"] - 1,
    }


def noninferior(cmp: dict) -> bool:
    return cmp["dSharpe"] >= NONINFERIOR_SR and cmp["cvar5Rel"] <= NONINFERIOR_TAIL and cmp["deepest3Rel"] <= NONINFERIOR_TAIL


def window_stats(sim: dict, start: str, end: str) -> dict:
    m = (sim["dates"] >= start) & (sim["dates"] <= end)
    r = sim["net"][m]
    nav = np.concatenate([[1.0], np.cumprod(1 + r)])
    years = len(r) / 252
    return {"cum": float(nav[-1] - 1), "maxDd": float((nav / np.maximum.accumulate(nav) - 1).min()), "ann": float(nav[-1] ** (1 / years) - 1)}


def dedrift(mk: Market, periods: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """去漂移：黄金实际漂移为 0；国债扣掉该区间收益率长期变化带来的资本利得。均值按区间内持有日计算。"""
    span = np.zeros(len(mk.dates), dtype=bool)
    for p in periods.itertuples(index=False):
        span[p.i0 + 1:p.i1 + 1] = True
    gold = mk.gold.copy()
    g_mean = np.nanmean(gold[span])
    gold = gold - g_mean + mk.infl
    bond = mk.bond.copy()
    dy_mean = np.nanmean(mk.dy[span])
    bond = bond - BOND_DURATION * (-dy_mean)
    return bond, gold


def boot_dsharpe(x: np.ndarray, y: np.ndarray) -> dict:
    rng = np.random.default_rng(SEED)
    n = len(x)
    sr = lambda a: np.sqrt(12) * a.mean() / a.std(ddof=1)  # noqa: E731
    draws = np.empty(DRAWS)
    for b in range(DRAWS):
        idx = []
        while len(idx) < n:
            s = rng.integers(0, n)
            idx.extend(((s + np.arange(BLOCK)) % n).tolist())
        idx = np.array(idx[:n])
        draws[b] = sr(x[idx]) - sr(y[idx])
    p = min(1.0, 2 * min((draws <= 0).mean(), (draws >= 0).mean()))
    return {"point": float(sr(x) - sr(y)), "low": float(np.quantile(draws, 0.025)), "high": float(np.quantile(draws, 0.975)), "p": float(p)}


def run() -> dict:
    inp = e1.load_inputs()
    mk = load_market(inp)
    calib = json.loads((RES / "calibration.json").read_text(encoding="utf-8"))
    thr = {s: {k: calib["segments"][s][k]["threshold"] for k in ("cvar5", "deepest3")} for s in SEGMENTS}
    result: dict = {"prereg": "docs/research/multi-asset-2026-11-25/PREREG.md", "thresholds": thr, "candidates": {}}

    seg_periods = {s: e1.build_periods(inp, first=a, last=b) for s, (a, b) in SEGMENTS.items()}
    full_periods = e1.build_periods(inp, first=SEGMENTS["train"][0], last=SEGMENTS["valid"][1])

    holdout = json.loads((RES / "holdout-tiers.json").read_text(encoding="utf-8"))["tiers"]
    inp_lock = e1.Inputs(tiers=pd.concat([pd.Series({d: t for d, t in holdout}), inp.tiers]), spx_ret=inp.spx_ret, cash=inp.cash, price=inp.price, closes=inp.closes)
    lock_periods = e1.build_periods(inp_lock, first=LOCKBOX[0], last=LOCKBOX[1])

    for kind in ["C1", "C2", "REF"]:
        out: dict = {"segments": {}, "dedrift": {}, "stress": [], "lockbox": None}
        for s, periods in seg_periods.items():
            cand = simulate(kind, inp, mk, periods)
            cm = metrics(cand)
            c, b0, lev = align_b0(inp, mk, periods, cm["vol"], True)
            bm = metrics(b0)
            cmp = compare(cm, bm)
            out["segments"][s] = {"candidate": cm, "b0": bm, "c": c, "needsLeverage": lev, "cmp": cmp,
                                  "noninferior": noninferior(cmp),
                                  "tailImproved": cmp["cvar5Rel"] <= -thr[s]["cvar5"] and cmp["deepest3Rel"] <= -thr[s]["deepest3"]}
            for start, end, label in STRESS:
                seg_start, seg_end = periods["start"].iloc[0], periods["end"].iloc[-1]
                # 压力期与本区间有重叠就检验，截到区间内（1976–1981 的起点早于净值起点 1976-02-04）
                if start <= seg_end and end >= seg_start:
                    cw, bw = window_stats(cand, max(start, seg_start), min(end, seg_end)), window_stats(b0, max(start, seg_start), min(end, seg_end))
                    ok = cw["cum"] >= bw["cum"] - 0.02 and cw["maxDd"] >= bw["maxDd"] - 0.02
                    if label.startswith("1976"):
                        ok = ok and cw["ann"] >= bw["ann"] - 0.01
                    out["stress"].append({"window": label, "candidate": cw, "b0": bw, "ok": bool(ok)})
            # 去漂移
            bond_d, gold_d = dedrift(mk, periods)
            cand_d = simulate(kind, inp, mk, periods, bond=bond_d, gold=gold_d)
            cmd = metrics(cand_d)
            c_d, b0_d, _ = align_b0(inp, mk, periods, cmd["vol"], True)
            cmp_d = compare(cmd, metrics(b0_d))
            out["dedrift"][s] = {"cmp": cmp_d, "noninferior": noninferior(cmp_d), "c": c_d}
        # 锁箱 B-1（无黄金）
        cand_l = simulate(kind, inp_lock, mk, lock_periods, has_gold=False)
        cml = metrics(cand_l)
        c_l, b0_l, lev_l = align_b0(inp_lock, mk, lock_periods, cml["vol"], False)
        cmp_l = compare(cml, metrics(b0_l))
        out["lockbox"] = {"candidate": cml, "b0": metrics(b0_l), "c": c_l, "needsLeverage": lev_l, "cmp": cmp_l, "noninferior": noninferior(cmp_l)}
        # 全样本 ΔSR 自助法（只报告）：B0 用全样本对齐
        cand_f = simulate(kind, inp, mk, full_periods)
        _, b0_f, _ = align_b0(inp, mk, full_periods, metrics(cand_f)["vol"], True)
        out["bootstrap"] = boot_dsharpe(cand_f["perNet"] - cand_f["perCash"], b0_f["perNet"] - b0_f["perCash"])
        segs = out["segments"]
        checks = {
            "1_noninferior": all(segs[s]["noninferior"] for s in SEGMENTS),
            "2_tailImproved": all(segs[s]["tailImproved"] for s in SEGMENTS),
            "3_stress": all(x["ok"] for x in out["stress"]),
            "4_dedrift": all(out["dedrift"][s]["noninferior"] for s in SEGMENTS),
            "5_lockbox": out["lockbox"]["noninferior"],
        }
        out["checks"] = checks
        out["pass"] = all(checks.values()) if kind != "REF" else None
        result["candidates"][kind] = out

    ps = {k: result["candidates"][k]["bootstrap"]["p"] for k in ("C1", "C2")}
    order = sorted(ps, key=ps.get)
    running = 0.0
    for i, k in enumerate(order):
        running = max(running, min(1.0, (2 - i) * ps[k]))
        result["candidates"][k]["bootstrap"]["holm"] = running
    passed = [k for k in ("C1", "C2") if result["candidates"][k]["pass"]]
    result["verdict"] = {"passed": passed, "pick": max(passed, key=lambda k: -result["candidates"][k]["segments"]["train"]["cmp"]["deepest3Rel"]) if passed else None}
    return result


def main() -> None:
    result = run()
    (RES / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2, default=float) + "\n", encoding="utf-8")
    pct = lambda x: f"{x * 100:+.1f}%"  # noqa: E731
    for kind, out in result["candidates"].items():
        print(f"\n== {kind} {'（参考行）' if kind == 'REF' else ''}")
        for s, seg in out["segments"].items():
            cm, bm, cmp = seg["candidate"], seg["b0"], seg["cmp"]
            print(f"{s}: 波动 {cm['vol'] * 100:.1f}% c={seg['c']:.3f}{'（需杠杆）' if seg['needsLeverage'] else ''} | 夏普 {cm['sharpe']:.3f} vs {bm['sharpe']:.3f} | CVaR {cm['cvar5'] * 100:.2f}% vs {bm['cvar5'] * 100:.2f}%（{pct(cmp['cvar5Rel'])}）| 最深3段 {cm['deepest3'] * 100:.1f}% vs {bm['deepest3'] * 100:.1f}%（{pct(cmp['deepest3Rel'])}）| 按日回撤 {cm['dailyMaxDd'] * 100:.1f}% vs {bm['dailyMaxDd'] * 100:.1f}% | 年化 {cm['cagr'] * 100:.1f}% vs {bm['cagr'] * 100:.1f}% | 权重 {', '.join(f'{a} {w:.2f}' for a, w in cm['avgWeights'].items())}")
        for x in out["stress"]:
            print(f"  压力 {x['window']}：累计 {pct(x['candidate']['cum'])} vs {pct(x['b0']['cum'])}，回撤 {pct(x['candidate']['maxDd'])} vs {pct(x['b0']['maxDd'])} → {'✓' if x['ok'] else '✗'}")
        for s, d in out["dedrift"].items():
            print(f"  去漂移 {s}：ΔSR {d['cmp']['dSharpe']:+.3f} CVaR {pct(d['cmp']['cvar5Rel'])} 最深3段 {pct(d['cmp']['deepest3Rel'])} → {'不劣' if d['noninferior'] else '劣'}")
        lb = out["lockbox"]
        print(f"  锁箱 1963–1972：ΔSR {lb['cmp']['dSharpe']:+.3f} CVaR {pct(lb['cmp']['cvar5Rel'])} 最深3段 {pct(lb['cmp']['deepest3Rel'])} → {'不劣' if lb['noninferior'] else '劣'}")
        bs = out["bootstrap"]
        print(f"  全样本 ΔSR {bs['point']:+.3f} [{bs['low']:+.3f}, {bs['high']:+.3f}] p {bs['p']:.3f}" + (f" Holm {bs['holm']:.3f}" if "holm" in bs else ""))
        print(f"  条件：{out['checks']} → {'通过' if out['pass'] else ('不通过' if out['pass'] is False else '参考行')}")
    print("\n结论：", result["verdict"])


if __name__ == "__main__":
    main()
