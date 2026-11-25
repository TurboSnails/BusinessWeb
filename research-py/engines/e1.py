"""E1 口径的第二套回测引擎（pandas/numpy 独立实现）。

口径与仓库 JS 研究引擎相同（docs/research/late-cycle-2026-11-25/run.mjs）：
- 信号月 d 的月末档位，在 d+1 月第 3 个交易日收盘成交，持有到 d+2 月第 3 个交易日收盘；
- 股票日收益 = 标普日收盘涨跌 + 当期股息按交易日平均分摊；现金同样按交易日分摊；
- 月股息 = 月度含息收益 − 月均价涨跌（与 JS 相同的反推方式）；
- 期内每天按目标仓位再平衡；仓位变化当天扣 0.10% × |Δ仓位|，首次建仓不计费；
- 夏普 = √12 × 每期超额收益均值 ÷ 样本标准差；年化按每期总收益连乘；按日最大回撤用逐日净值（含起点 1）。

只读输入文件，不联网。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[2]
TIERS_FILE = REPO / "docs/research/macro-significance-2026-11-25/inputs.json"
DAILY_FILE = REPO / "data-raw/macro-posture-daily/spx-daily.json"

EQUITY = {"offense": 1.0, "lean-offense": 0.85, "neutral": 0.7, "lean-defense": 0.5, "defense": 0.3}
EXEC_DAY = 3
COST = 0.001


def month_after(month: str, k: int) -> str:
    y, m = (int(x) for x in month.split("-"))
    t = y * 12 + (m - 1) + k
    return f"{t // 12}-{t % 12 + 1:02d}"


@dataclass(frozen=True)
class Inputs:
    tiers: pd.Series  # 信号月 -> 档位
    spx_ret: pd.Series  # 月 -> 月度含息收益（月均价口径）
    cash: pd.Series  # 月 -> 3 个月国库券月收益
    price: pd.Series  # 月 -> 标普月均价
    closes: pd.Series  # 日期 -> 收盘


def load_inputs(tiers_file: Path = TIERS_FILE, daily_file: Path = DAILY_FILE) -> Inputs:
    raw = json.loads(tiers_file.read_text(encoding="utf-8"))
    tiers = pd.Series({d: t for d, t in raw["tiers"]})
    rets = pd.DataFrame(raw["returns"], columns=["month", "spx", "cash"]).set_index("month")
    price = pd.Series({d: v for d, v in raw["price"]})
    rows = json.loads(daily_file.read_text(encoding="utf-8"))["rows"]
    closes = pd.Series({d: c for d, c in rows}, dtype=float).sort_index()
    return Inputs(tiers=tiers, spx_ret=rets["spx"], cash=rets["cash"], price=price, closes=closes)


def build_periods(inp: Inputs, first: str = "1973-01", last: str = "2026-08") -> pd.DataFrame:
    """每个信号月一行：成交起止日期、期内交易日数、摊分前的股息与现金总额、档位仓位。"""
    dates = inp.closes.index.to_numpy()
    months = np.array([d[:7] for d in dates])
    by_month: dict[str, list[str]] = {}
    for d, m in zip(dates, months):
        by_month.setdefault(m, []).append(d)

    def dividend(m: str) -> float:
        return float(inp.spx_ret[m] - (inp.price[m] / inp.price[month_after(m, -1)] - 1))

    rows = []
    for d, tier in inp.tiers.items():
        if not (first <= d <= last):
            continue
        m1, m2 = month_after(d, 1), month_after(d, 2)
        days1, days2 = by_month[m1], by_month[m2]
        start, end = days1[EXEC_DAY - 1], days2[EXEC_DAY - 1]
        n1 = sum(1 for x in days1 if x > start)
        n2 = sum(1 for x in days2 if x <= end)
        div = dividend(m1) * n1 / len(days1) + dividend(m2) * n2 / len(days2)
        cash = float(inp.cash[m1]) * n1 / len(days1) + float(inp.cash[m2]) * n2 / len(days2)
        rows.append({"signal": d, "tier": tier, "start": start, "end": end, "div": div, "cash": cash, "weight": EQUITY[tier]})
    periods = pd.DataFrame(rows)
    pos = pd.Series(np.arange(len(dates)), index=dates)
    periods["i0"] = pos[periods["start"]].to_numpy()
    periods["i1"] = pos[periods["end"]].to_numpy()
    periods["n"] = periods["i1"] - periods["i0"]
    return periods


def simulate(inp: Inputs, periods: pd.DataFrame, weight_of=None, cost: float = COST) -> tuple[pd.DataFrame, pd.DataFrame]:
    """按日模拟。weight_of(period_row) -> 当期仓位（默认档位仓位）。返回 (逐日表, 每期表)。"""
    closes = inp.closes.to_numpy()
    dates = inp.closes.index.to_numpy()
    daily_parts = []
    period_rows = []
    prev = None
    for p in periods.itertuples(index=False):
        w = float(weight_of(p)) if weight_of else float(p.weight)
        idx = np.arange(p.i0 + 1, p.i1 + 1)
        stock = closes[idx] / closes[idx - 1] - 1 + p.div / p.n
        ret = w * stock + (1 - w) * p.cash / p.n
        trade = 0.0 if prev is None else abs(w - prev)
        prev = w
        gross = float(np.prod(1 + ret)) - 1
        # 仓位变化发生在期初，成本只在当期第一天扣一次（与 JS 逐日乘 (1 − cost × trade) 等价）
        net = (1 + gross) * (1 - cost * trade) - 1
        daily_parts.append(pd.DataFrame({"date": dates[idx], "signal": p.signal, "weight": w, "stock": stock, "ret": ret}))
        period_rows.append({"signal": p.signal, "gross": gross, "net": net, "cash": p.cash, "trade": trade})
    daily = pd.concat(daily_parts, ignore_index=True)
    daily["nav"] = np.cumprod(1 + daily["ret"].to_numpy())
    return daily, pd.DataFrame(period_rows)


def sharpe(excess: np.ndarray) -> float:
    return float(np.sqrt(12) * excess.mean() / excess.std(ddof=1))


def summarize(daily: pd.DataFrame, per: pd.DataFrame) -> dict[str, float]:
    nav = np.concatenate([[1.0], daily["nav"].to_numpy()])
    max_dd = float((nav / np.maximum.accumulate(nav) - 1).min())
    growth = float(np.prod(1 + per["gross"].to_numpy()))
    return {
        "periods": int(len(per)),
        "sharpe": sharpe((per["gross"] - per["cash"]).to_numpy()),
        "sharpeNet": sharpe((per["net"] - per["cash"]).to_numpy()),
        "cagr": growth ** (12 / len(per)) - 1,
        "dailyMaxDd": max_dd,
    }


def run_baseline() -> dict[str, float]:
    inp = load_inputs()
    periods = build_periods(inp)
    daily, per = simulate(inp, periods)
    return summarize(daily, per)


if __name__ == "__main__":
    for k, v in run_baseline().items():
        print(f"{k:12s} {v}")
