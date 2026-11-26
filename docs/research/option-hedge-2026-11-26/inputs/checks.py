"""数据完整性与口径核对（只输出布尔/日期/误差量级，不输出任何收益水平或策略表现）。

用法（仓库根目录）：
    cd research-py && uv run python ../docs/research/option-hedge-2026-11-26/inputs/checks.py

核对项：
1. 重复日、非正值/空值、连续相同收盘（≥3 天）；
2. 与仓库标普日历对齐：指数缺失的标普交易日、指数有而标普没有的日期；
3. 单日 |变动| > 15% 的日期，以及标普同日是否也大幅变动（|标普日变动| > 5%）、是否跨越了数据缺口；
4. 稀疏段：相邻两条记录间隔 > 7 个日历日；
5. 旧站 CLL 快照与现行 CLL 文件重叠段的水平一致性；CBOE SPX 与仓库标普水平一致性；
6. 股息口径：PPUT / CLLZ 在「保护腿几乎无价值」窗口里更接近标普价格收益还是总收益（只报平均绝对偏差量级与回归斜率）。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.dont_write_bytecode = True  # 不在 inputs/ 下留 __pycache__
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import REPO, load_all, load_spx_repo  # noqa: E402

INPUTS_JSON = REPO / "docs/research/macro-significance-2026-11-25/inputs.json"
JUMP = 0.15
SPX_BIG = 0.05


def integrity(name: str, s: pd.Series, spx: pd.Series) -> None:
    print(f"\n## {name}")
    dup = s.index[s.index.duplicated()].unique()
    bad = s[(s <= 0) | s.isna()]
    print(f"rows={len(s)}  {s.index.min()} → {s.index.max()}  duplicates={len(dup)}  nonpositive_or_nan={len(bad)}")
    s = s[~s.index.duplicated(keep="last")].sort_index()

    # 连续相同收盘
    same = s.eq(s.shift())
    runs, start, length = [], None, 0
    for d, flag in same.items():
        if flag:
            length += 1
            start = start or prev
        else:
            if length >= 2:
                runs.append((start, length + 1))
            start, length = None, 0
        prev = d
    if length >= 2:
        runs.append((start, length + 1))
    print(f"flat_runs(>=3 identical closes)={len(runs)}  sample={runs[:5]}")

    # 日历对齐
    lo, hi = s.index.min(), min(s.index.max(), spx.index.max())
    cal = spx.index[(spx.index >= lo) & (spx.index <= hi)]
    idx = s.index[(s.index >= lo) & (s.index <= hi)]
    missing = cal.difference(idx)
    extra = idx.difference(cal)
    by_year = pd.Series([d[:4] for d in missing]).value_counts().sort_index()
    print(f"spx_days_missing_in_index={len(missing)}  by_year={dict(by_year)}" if len(missing) else "spx_days_missing_in_index=0")
    if len(missing):
        print(f"  sample={list(missing[:8])}{' …' if len(missing) > 8 else ''}")
    print(f"index_days_not_in_spx={len(extra)}  sample={list(extra[:8])}")

    # 稀疏段
    dt = pd.to_datetime(pd.Series(s.index))
    gaps = dt.diff().dt.days
    big = [(s.index[i - 1], s.index[i], int(gaps[i])) for i in np.where(gaps > 7)[0]]
    print(f"gaps>7_calendar_days={len(big)}  sample={big[:8]}")

    # 大跳变（只列日期与布尔）
    r = s.pct_change()
    spx_r = spx.pct_change()
    jumps = r[r.abs() > JUMP]
    rows = []
    for d in jumps.index:
        i = s.index.get_loc(d)
        prev_d = s.index[i - 1]
        gap = (pd.Timestamp(d) - pd.Timestamp(prev_d)).days
        spx_big = bool(abs(spx_r.get(d, np.nan)) > SPX_BIG) if d in spx_r.index else None
        rows.append((d, f"spx_same_day_|move|>5%={spx_big}", f"after_gap_days={gap}" if gap > 4 else "no_gap"))
    print(f"daily_|change|>15%={len(rows)}")
    for row in rows:
        print("  ", *row)


def level_match(a: pd.Series, b: pd.Series, label: str) -> None:
    a = a[~a.index.duplicated(keep="last")]
    b = b[~b.index.duplicated(keep="last")]
    common = a.index.intersection(b.index)
    rel = (a[common] / b[common] - 1).abs()
    print(f"{label}: common_days={len(common)}  max_rel_level_diff={rel.max():.2e}  days_rel_diff>1e-4={int((rel > 1e-4).sum())}")
    if (rel > 1e-4).any():
        print("  first_mismatch_dates=", list(rel[rel > 1e-4].index[:8]))


def roll_dates(cal: pd.Index) -> list[str]:
    """每月第三个周五；若当天不是标普交易日，取之前最近的交易日。"""
    cal_set = set(cal)
    out = []
    for p in pd.period_range(cal[0][:7], cal[-1][:7], freq="M"):
        first = pd.Timestamp(p.start_time)
        fri = first + pd.Timedelta(days=int((4 - first.weekday()) % 7 + 14))
        d = fri
        while d.strftime("%Y-%m-%d") not in cal_set and d >= first:
            d -= pd.Timedelta(days=1.0)
        ds = d.strftime("%Y-%m-%d")
        if ds in cal_set:
            out.append(ds)
    return out


def dividend_check(name: str, idx: pd.Series, spx: pd.Series, band: tuple[float, float]) -> None:
    """在每个换仓周期的后半段（换仓后第 10 个交易日 → 下次换仓前一日），若标普收盘始终处于
    [band[0], band[1]] × 换仓日收盘之间（PPUT：≥ 换仓价 → 5% 价外看跌只剩不到两周、几乎无价值），
    比较指数区间收益与「标普价格收益」「价格收益 + 按交易日分摊的月股息」的平均绝对偏差。
    只打印偏差量级与回归斜率，不打印任何收益水平。"""
    raw = json.loads(INPUTS_JSON.read_text(encoding="utf-8"))
    tr = pd.DataFrame(raw["returns"], columns=["m", "tr", "cash"]).set_index("m")["tr"]
    px = pd.Series({m: v for m, v in raw["price"]})
    div_m = (tr - px / px.shift(1) + 1).dropna()  # 与 research-py/engines/e1.py 相同：月股息 = 月含息收益 − 月均价涨跌
    days_in_month = pd.Series([d[:7] for d in spx.index]).value_counts()

    idx = idx[~idx.index.duplicated(keep="last")]
    cal = spx.index[(spx.index >= idx.index.min()) & (spx.index <= idx.index.max())]
    rolls = roll_dates(cal)
    pos = {d: i for i, d in enumerate(cal)}
    dev_px, dev_tr, x_div, y_gap = [], [], [], []
    for r0, r1 in zip(rolls[:-1], rolls[1:]):
        i0, i1 = pos[r0], pos[r1]
        a, b = i0 + 10, i1 - 1
        if b - a < 3:
            continue
        window = cal[a : b + 1]
        path = spx.loc[cal[i0 : b + 1]] / spx.loc[r0]
        if path.min() < band[0] or path.max() > band[1]:
            continue
        if window.isin(idx.index).sum() != len(window):
            continue
        m_ok = all(d[:7] in div_m.index for d in window[1:])
        if not m_ok:
            continue
        r_idx = idx[window[-1]] / idx[window[0]] - 1
        r_px = spx[window[-1]] / spx[window[0]] - 1
        d = sum(div_m[x[:7]] / days_in_month[x[:7]] for x in window[1:])
        dev_px.append(r_idx - r_px)
        dev_tr.append(r_idx - (r_px + d))
        x_div.append(d)
        y_gap.append(r_idx - r_px)
    dev_px, dev_tr, x_div, y_gap = map(np.asarray, (dev_px, dev_tr, x_div, y_gap))
    n = len(dev_px)
    mad_px, mad_tr = np.mean(np.abs(dev_px)) * 1e4, np.mean(np.abs(dev_tr)) * 1e4
    slope = float(np.polyfit(x_div, y_gap, 1)[0]) if n > 5 else float("nan")
    closer = "总收益" if mad_tr < mad_px else "价格收益"
    print(f"{name}: windows={n}  MAD(vs 价格)={mad_px:.1f}bp  MAD(vs 总收益)={mad_tr:.1f}bp  "
          f"→ 更接近{closer}；(指数−价格) 对 分摊股息 的回归斜率={slope:.2f}（≈1 为含息，≈0 为价格）")


def dividend_check_by_period(name: str, idx: pd.Series, spx: pd.Series, band: tuple[float, float]) -> None:
    for lo, hi in (("1986-01-01", "1999-12-31"), ("2000-01-01", "2026-12-31")):
        sub = idx[(idx.index >= lo) & (idx.index <= hi)]
        if len(sub) > 300:
            dividend_check(f"{name} [{lo[:4]}–{hi[:4]}]", sub, spx, band)


def daily_change_agreement(a: pd.Series, b: pd.Series, label: str) -> None:
    """两条同名序列在重叠段的逐日变动是否一致（只报一致天数占比与水平比值的漂移范围）。"""
    common = a.index.intersection(b.index)
    a, b = a[common], b[common]
    da, db = a.pct_change(), b.pct_change()
    diff = (da - db).abs().dropna()
    ratio = a / b
    print(f"{label}: days={len(diff)}  |Δ差|<1bp 占比={(diff < 1e-4).mean():.1%}  |Δ差|>10bp 天数={int((diff > 1e-3).sum())}  "
          f"水平比值范围=[{ratio.min():.3f}, {ratio.max():.3f}]（恒定=仅重定基，漂移=历史被改算）")
    yrs = pd.Series([d[:4] for d in diff[diff > 1e-3].index]).value_counts().sort_index()
    print(f"  |Δ差|>10bp 按年={dict(yrs)}")


def daily_dividend_regression(name: str, idx: pd.Series, spx: pd.Series, tr: pd.Series,
                              band: tuple[float, float] | None, skip: int = 5) -> None:
    """逐日检验：y = 指数日变动 − 标普价格日变动；d = 标普总收益日变动 − 价格日变动（即当日除息点数/前收）。
    在换仓后第 skip 个交易日起、下次换仓前（排除换仓日）且标普处于 band×换仓日收盘内的日子，回归
        y = a + b·d + c·r_tr + e·r_tr²
    期权按远期定价、除息日本身不跳，所以期权腿的反应用 r_tr（而非 r_px）控制：c≈期权腿 delta 份额，e 吸收 gamma。
    若股票腿含息：y ≈ d + c·r_tr → b≈1；若为价格口径：y ≈ c·r_tr → b≈0。
    （旧设定用 r_px 作控制时 b 会被系统性拉向 1+delta，见 AUDIT.md。）只报 b、其标准误，不报任何收益水平。"""
    idx = idx[~idx.index.duplicated(keep="last")]
    cal = spx.index[(spx.index >= max(idx.index.min(), tr.index.min())) & (spx.index <= min(idx.index.max(), tr.index.max()))]
    rolls = roll_dates(cal)
    roll_set = set(rolls)
    pos = {d: i for i, d in enumerate(cal)}
    rows = []
    for r0, r1 in zip(rolls[:-1], rolls[1:]):
        i0, i1 = pos[r0], pos[r1]
        for i in range(i0 + skip, i1):
            t, t1 = cal[i], cal[i - 1]
            if t in roll_set or t1 not in idx.index or t not in idx.index or t not in tr.index or t1 not in tr.index:
                continue
            lvl = spx[t] / spx[r0]
            if band and not (band[0] <= lvl <= band[1] and band[0] <= spx[t1] / spx[r0] <= band[1]):
                continue
            r_px = spx[t] / spx[t1] - 1
            r_tr = tr[t] / tr[t1] - 1
            rows.append((idx[t] / idx[t1] - 1 - r_px, r_tr - r_px, r_tr))
    if len(rows) < 30:
        print(f"{name}: days={len(rows)}  样本不足")
        return
    y, d, rt = (np.array(c) for c in zip(*rows))
    X = np.column_stack([np.ones_like(d), d, rt, rt**2])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    se = np.sqrt(np.diag(np.linalg.inv(X.T @ X)) * resid.var(ddof=X.shape[1]))
    b, sb = beta[1], se[1]
    if abs(b - 1) < 3 * sb and b > 3 * sb:
        verdict = "含息(总收益)"
    elif abs(b) < 3 * sb and b < 1 - 3 * sb:
        verdict = "价格"
    else:
        verdict = "不确定（功效不足或两者都拒绝）"
    print(f"{name}: days={len(y)}  b={b:.2f}±{sb:.2f}  → {verdict}")


def block_dividend_regression(name: str, idx: pd.Series, spx: pd.Series, tr: pd.Series,
                              periods=(("1988-01-01", "2015-07-31"), ("2015-08-01", "2026-12-31"), ("1988-01-01", "2026-12-31")),
                              L: int = 5) -> None:
    """5 日块回归（主核对，对股息入账日错开 1–2 天不敏感）：每个换仓周期内、从换仓次日起切成不重叠的 5 个交易日块
    （块不跨换仓日），Y = 块内(指数 − 标普价格)，D = 块内(总收益 − 价格)，RT = 块内总收益变动；
    回归 Y = a + b·D + c·RT + e·RT²。b≈1 → 含息；b≈0 → 价格。另报：控制项拟合后，强制 b=0 与 b=1 时残差的平均绝对值（bp）。
    只报 b、标准误、残差量级，不报任何收益水平。"""
    idx = idx[~idx.index.duplicated(keep="last")]
    for lo, hi in periods:
        cal = spx.index[(spx.index >= lo) & (spx.index <= hi) & spx.index.isin(idx.index) & spx.index.isin(tr.index)]
        if len(cal) < 300:
            continue
        rolls = roll_dates(cal)
        pos = {d: i for i, d in enumerate(cal)}
        rows = []
        for r0, r1 in zip(rolls[:-1], rolls[1:]):
            i = pos[r0] + 1
            while i + L <= pos[r1]:
                a0, b1 = cal[i - 1], cal[i + L - 1]
                rp = spx[b1] / spx[a0] - 1
                rt = tr[b1] / tr[a0] - 1
                rows.append((idx[b1] / idx[a0] - 1 - rp, rt - rp, rt))
                i += L
        y, d, rt = (np.array(c) for c in zip(*rows))
        X = np.column_stack([np.ones_like(d), d, rt, rt**2])
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        resid = y - X @ beta
        se = np.sqrt(np.diag(np.linalg.inv(X.T @ X)) * resid.var(ddof=X.shape[1]))
        Z = np.column_stack([np.ones_like(d), rt, rt**2])
        mad = {}
        for k in (0.0, 1.0):
            g, *_ = np.linalg.lstsq(Z, y - k * d, rcond=None)
            mad[k] = np.mean(np.abs(y - k * d - Z @ g)) * 1e4
        b, sb = beta[1], se[1]
        rej0, rej1 = abs(b) > 2 * sb, abs(b - 1) > 2 * sb
        verdict = ("含息(总收益)" if rej0 and not rej1 else "价格" if rej1 and not rej0 else
                   "两者都拒绝" if rej0 and rej1 else "功效不足（0 与 1 都不能拒绝）")
        print(f"{name:28s} {lo[:4]}–{hi[:4]} blocks={len(y):5d}  b={b:5.2f}±{sb:.2f}  "
              f"残差MAD 强制b=0:{mad[0.0]:6.2f}bp / b=1:{mad[1.0]:6.2f}bp  → {verdict}（2σ）")


def main() -> None:
    spx = load_spx_repo()
    data = load_all()
    print("# 完整性核对（基准日历：data-raw/macro-posture-daily/spx-daily.json，"
          f"{spx.index.min()} → {spx.index.max()}，{len(spx)} 天）")
    for name, s in data.items():
        integrity(name, s, spx)

    print("\n# 水平一致性")
    level_match(data["CLL_legacy"], data["CLL"], "CLL 旧站快照 vs 现行 CLL_History")
    level_match(data["spx_cboe"], spx, "CBOE SPX_History vs 仓库标普(Yahoo)")
    level_match(data["spx_cboe"][data["spx_cboe"].index >= "1986-06-20"], spx, "  同上，仅 1986-06-20 起")

    daily_change_agreement(data["CLL_legacy"], data["CLL"], "CLL 旧站快照 vs 现行 CLL_History（逐日变动）")

    tr = data["sp500tr_yahoo"]
    print("\n# 股息口径 A：5 日块回归（主核对；总收益基准 = S&P 500 TR via Yahoo ^SP500TR）")
    for nm in ("PPUT", "CLLZ", "CLL_legacy", "CLL", "BXM", "VXTH", "spx_cboe"):
        label = {"CLL_legacy": "对照+ CLL_legacy(文档=总收益)", "CLL": "对照+ CLL(文档=总收益)", "BXM": "对照+ BXM(文档=总收益)",
                 "spx_cboe": "对照− spx_cboe(价格指数)"}.get(nm, nm)
        block_dividend_regression(label, data[nm], spx, tr)

    print("\n# 股息口径 A'：逐日、精确到除息当天的回归（对入账日错位敏感，仅作时序诊断）")
    daily_dividend_regression("PPUT", data["PPUT"], spx, tr, (1.00, 9.99))
    daily_dividend_regression("CLLZ", data["CLLZ"], spx, tr, (0.995, 1.005))
    daily_dividend_regression("CLLZ(无 band)", data["CLLZ"], spx, tr, None)
    daily_dividend_regression("PPUT3M", data["PPUT3M"], spx, tr, (1.00, 9.99))
    daily_dividend_regression("VXTH", data["VXTH"], spx, tr, None)
    daily_dividend_regression("对照+ CLL_legacy(文档=总收益)", data["CLL_legacy"], spx, tr, (0.98, 1.05))
    daily_dividend_regression("对照+ BXM(文档=总收益)", data["BXM"], spx, tr, None)
    daily_dividend_regression("对照− spx_cboe(价格指数)", data["spx_cboe"], spx, tr, None)
    daily_dividend_regression("参考 SPRO(纯期权,理论价)", data["SPRO"], spx, tr, None)

    print("\n# 股息口径 B：按任务原设的区间法（换仓周期后半段 vs 月股息分摊；功效不足，仅留档）")
    dividend_check("PPUT", data["PPUT"], spx, (1.00, 9.99))
    dividend_check_by_period("PPUT", data["PPUT"], spx, (1.00, 9.99))
    dividend_check("CLLZ", data["CLLZ"], spx, (1.00, 1.01))
    dividend_check_by_period("CLLZ", data["CLLZ"], spx, (1.00, 1.01))
    # 阳性对照：CLL 方法论明确为总收益；看跌是季度 95%、看涨 110%，标普处于 [1.00,1.03] 时两腿都远价外
    dividend_check("CLL_legacy(对照,文档=总收益)", data["CLL_legacy"], spx, (1.00, 1.03))
    # 阴性对照：CBOE SPX 价格指数本身
    dividend_check("spx_cboe(对照,价格指数)", data["spx_cboe"][data["spx_cboe"].index >= "1986-06-20"], spx, (1.00, 9.99))


if __name__ == "__main__":
    main()
