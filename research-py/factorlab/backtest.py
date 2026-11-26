"""只做多回测：调仓日按因子选前 q（或前 N），市值加权或等权，日间权重随价格漂移，扣按市场的成本与约束。

执行口径（DESIGN.md 第五、六节）：
- 信号用调仓日 t 的收盘数据；execution='open'（默认）在 t 之后第一个交易日开盘成交（open_adj；没有开盘价时
  退回当日收盘），execution='close' 在 t 当日收盘成交。
- A 股约束（constraints=None 时只对 cn 开启）：开盘成交时一字涨停（开 = 高 = 低 = 收且封涨停）买不进、
  一字跌停卖不出；收盘成交时封涨停买不进、封跌停卖不出。停牌不能交易：要卖的停牌股挂单，复牌后第一个
  可成交时点卖出（资金留作现金到下次调仓）；买不进的目标不替补，资金留作现金。
- 持仓股退市（证券表 delist_date 当日及以后）在退市日补一个退市收益 delist_return（默认 −100%，保守），
  剩余价值转为现金。没有证券表时不识别退市（停止交易的股票视为长期停牌）。
- 成本：佣金（可设最低佣金）+ 印花税 + 其他双边费用 + 按成交额分档的滑点；给出 capital 时按整手（A 股
  100 股）取整并计最低佣金，否则只按比例计。现金收益为 0。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .calendar import trading_days
from .universe import as_bool

TRADING_DAYS = 252


# ---------------------------------------------------------------- 成本
@dataclass(frozen=True)
class CostModel:
    """单边费率（小数）。stamp：((生效日, 买入印花税, 卖出印花税), ...) 按生效日升序；早于首条用首条。"""

    commission: float
    stamp: tuple = ()
    other: float = 0.0            # 双边其他费用（港股交易征费、A 股过户费等）
    min_commission: float = 0.0   # 每笔最低佣金（当地货币，只在给出 capital 时生效）
    lot_size: int = 1             # 每手股数（只在给出 capital 时生效）

    def stamp_rates(self, date) -> tuple[float, float]:
        if not self.stamp:
            return 0.0, 0.0
        d = pd.Timestamp(date)
        b, s = self.stamp[0][1], self.stamp[0][2]
        for start, sb, ss in self.stamp:
            if d >= pd.Timestamp(start):
                b, s = sb, ss
        return b, s

    def rates(self, date) -> tuple[float, float]:
        """date 当日的（买入总费率，卖出总费率），不含滑点与最低佣金。"""
        b, s = self.stamp_rates(date)
        base = self.commission + self.other
        return base + b, base + s


# A 股印花税（实际历史）：DESIGN 表把 2008-04-24 以前简化为双边 0.3%；这里按实际调整日期，
# 2007-05-30 至 2008-04-23 为双边 0.3%，与 DESIGN 一致，更早的年份按当时税率。
CN_STAMP = (("1997-05-12", 0.005, 0.005), ("1998-06-12", 0.004, 0.004), ("2001-11-16", 0.002, 0.002),
            ("2005-01-24", 0.001, 0.001), ("2007-05-30", 0.003, 0.003), ("2008-04-24", 0.001, 0.001),
            ("2008-09-19", 0.0, 0.001), ("2023-08-28", 0.0, 0.0005))
# 港股印花税：双边 0.1%，2021-08-01 至 2023-11-16 为 0.13%。
HK_STAMP = (("1990-01-01", 0.001, 0.001), ("2021-08-01", 0.0013, 0.0013), ("2023-11-17", 0.001, 0.001))

DEFAULT_COSTS = {
    "cn": CostModel(commission=0.00025, stamp=CN_STAMP, other=0.00001, min_commission=5.0, lot_size=100),
    "hk": CostModel(commission=0.0003, stamp=HK_STAMP, other=0.0001),
    "us": CostModel(commission=0.0001),
}


def cost_model(market: str) -> CostModel:
    return DEFAULT_COSTS.get(market, CostModel(commission=0.0))


@dataclass(frozen=True)
class SlippageModel:
    """按 t 之前 20 日成交额中位数（当地货币）分档的单边滑点：((门槛, 费率), ...) 门槛降序，取第一个 ≥ 门槛的。"""

    tiers: tuple = ((0.0, 0.0),)
    window: int = 20

    def rate(self, adv: np.ndarray) -> np.ndarray:
        out = np.full(adv.shape, self.tiers[-1][1], dtype=float)
        adv = np.nan_to_num(adv, nan=0.0)
        for thr, r in reversed(self.tiers):
            out = np.where(adv >= thr, r, out)
        return out


DEFAULT_SLIPPAGE = {
    "cn": SlippageModel(((1e9, 0.0005), (2e8, 0.001), (5e7, 0.002), (0.0, 0.004))),
    "hk": SlippageModel(((5e8, 0.0008), (1e8, 0.0015), (2e7, 0.003), (0.0, 0.006))),
    "us": SlippageModel(((1e8, 0.0003), (2e7, 0.0008), (5e6, 0.0015), (0.0, 0.003))),
}


def slippage_model(market: str) -> SlippageModel:
    return DEFAULT_SLIPPAGE.get(market, SlippageModel())


# ---------------------------------------------------------------- 统计
def perf_stats(r: pd.Series, rf: pd.Series | float | None = None, periods: int = TRADING_DAYS) -> dict:
    """年化收益（CAGR）、年化波动、夏普（相对 rf，默认 0）、最大回撤。r 为每期收益。"""
    r = pd.Series(r).dropna()
    if len(r) < 2:
        return {"cagr": float("nan"), "vol": float("nan"), "sharpe": float("nan"), "maxdd": float("nan"), "n": len(r)}
    ex = r if rf is None else (r - rf.reindex(r.index).fillna(0.0) if isinstance(rf, pd.Series) else r - rf)
    nav = (1 + r).cumprod()
    sd = ex.std(ddof=1)
    return {"cagr": float(nav.iloc[-1] ** (periods / len(r)) - 1),
            "vol": float(r.std(ddof=1) * math.sqrt(periods)),
            "sharpe": float(ex.mean() / sd * math.sqrt(periods)) if sd > 0 else float("nan"),
            "maxdd": float((nav / nav.cummax() - 1).min()), "n": int(len(r))}


# ---------------------------------------------------------------- 回测
@dataclass
class BacktestResult:
    returns: pd.Series                 # 每日净收益
    gross: pd.Series                   # 每日毛收益（不含成本，含退市损失）
    turnover: pd.Series                # 每次成交单边换手（Σ|Δw| / 2）
    costs: pd.Series                   # 每次成交成本（占组合比例）
    weights: dict = field(default_factory=dict)   # 成交日 → 成交后权重
    capacity: dict = field(default_factory=dict)  # 持仓 / 日均成交额
    stats: dict = field(default_factory=dict)


def _bool(panel: dict, key: str, idx, cols) -> np.ndarray:
    if key not in panel:
        return np.zeros((len(idx), len(cols)), dtype=bool)
    return as_bool(panel[key].reindex(index=idx, columns=cols)).to_numpy()


def _num(panel: dict, key: str, idx, cols) -> np.ndarray | None:
    return None if key not in panel else panel[key].reindex(index=idx, columns=cols).to_numpy(float)


def allocate(target: np.ndarray, base: np.ndarray, w_old: np.ndarray, locked: np.ndarray,
             can_buy: np.ndarray, budget: float = 1.0) -> np.ndarray:
    """目标权重：锁定的保持原权重；剩余资金按 base（等权 = 1、市值加权 = 市值）分给可买入的目标；
    已持有但不能加仓的以原权重为上限（超出部分按比例分给其他目标）。"""
    w = np.where(locked, w_old, 0.0)
    remaining = max(budget - w.sum(), 0.0)
    elig = target & ~locked & (can_buy | (w_old > 0)) & (base > 0)
    cap = np.where(can_buy, np.inf, w_old)
    alloc = np.zeros_like(w)
    open_ = elig.copy()
    for _ in range(len(w) + 1):
        if not open_.any() or remaining <= 1e-15:
            break
        share = np.where(open_, base, 0.0)
        prop = remaining * share / share.sum()
        hit = open_ & (alloc + prop >= cap)
        if not hit.any():
            alloc += prop
            break
        add = (cap - alloc)[hit]
        alloc[hit] += add
        remaining -= add.sum()
        open_ &= ~hit
    return w + alloc


def backtest(factor: pd.DataFrame, panel: dict, market: str, mask: pd.DataFrame | None = None,
             direction: int = 1, top_q: float = 0.2, top_n: int | None = None, weighting: str = "cap",
             execution: str = "open", costs: CostModel | None = None, slippage: SlippageModel | None | str = "default",
             constraints: bool | None = None, securities: pd.DataFrame | None = None,
             delist_return: float = -1.0, capital: float | None = None, capacity_aum: float = 1e8,
             rf=None, end=None) -> BacktestResult:
    """factor：调仓日 × 代码（行索引即调仓日）；mask：同形状股票池；direction=-1 选最小的。"""
    if weighting not in ("cap", "equal"):
        raise ValueError("weighting 只能是 'cap' 或 'equal'")
    if execution not in ("open", "close"):
        raise ValueError("execution 只能是 'open' 或 'close'")
    costs = costs or cost_model(market)
    slip = slippage_model(market) if slippage == "default" else slippage
    constraints = (market == "cn") if constraints is None else constraints
    close = panel["close_adj"]
    codes = close.columns
    rb_dates = pd.DatetimeIndex(factor.index)
    days = trading_days(close)
    days = days[days >= rb_dates[0]]
    if end is not None:
        days = days[days <= pd.Timestamp(end)]
    n_d, n_c = len(days), len(codes)

    # 价格与收益：隔夜（前收 → 开）、日内（开 → 收）
    raw_c = close.reindex(index=days, columns=codes)
    has_px = raw_c.notna().to_numpy()
    C = close.ffill().reindex(index=days, columns=codes).to_numpy(float)
    O = _num(panel, "open_adj", days, codes) if execution == "open" else None
    O = C.copy() if O is None else np.where(has_px & np.isfinite(O), O, C)
    C_prev = np.vstack([C[:1], C[:-1]])
    r_on = np.nan_to_num(O / C_prev - 1)
    r_in = np.nan_to_num(C / O - 1)

    # 状态
    if securities is not None and "delist_date" in securities:
        dl = pd.to_datetime(securities.set_index("code")["delist_date"].reindex(codes)).to_numpy()
        delisted = (~pd.isna(dl))[None, :] & (days.to_numpy()[:, None] >= dl[None, :])
    else:
        delisted = np.zeros((n_d, n_c), dtype=bool)
    new_delist = delisted & ~np.vstack([np.zeros((1, n_c), bool), delisted[:-1]])
    susp = _bool(panel, "is_suspended", days, codes) | (~has_px & ~delisted)
    vol = _num(panel, "volume", days, codes)
    if vol is not None:
        susp |= has_px & np.isfinite(vol) & (vol <= 0)
    lim_up = _bool(panel, "limit_up", days, codes)
    lim_dn = _bool(panel, "limit_down", days, codes)
    if constraints and execution == "open":
        o, h, lo, c = (_num(panel, k, days, codes) for k in ("open", "high", "low", "close"))
        if o is not None and h is not None and lo is not None and c is not None:
            flat = np.isclose(o, h) & np.isclose(o, lo) & np.isclose(o, c)
            lim_up, lim_dn = lim_up & flat, lim_dn & flat
    if not constraints:
        lim_up = lim_dn = np.zeros_like(susp)
    can_sell = ~susp & ~lim_dn & ~delisted
    can_buy = has_px & ~susp & ~lim_up & ~delisted

    amount = panel.get("amount")
    adv = (amount.shift(1).rolling(20, min_periods=10).median().reindex(index=days, columns=codes).to_numpy(float)
           if amount is not None else np.full((n_d, n_c), np.nan))
    slip_rate = slip.rate(adv) if slip is not None else np.zeros((n_d, n_c))
    px_exec = _num(panel, "open" if execution == "open" else "close", days, codes)

    # 信号
    sig = factor.reindex(columns=codes) * direction
    if mask is not None:
        sig = sig.where(as_bool(mask.reindex(index=sig.index, columns=codes)))
    mcap = panel.get("mcap_float")
    if weighting == "cap" and mcap is None:
        raise ValueError("市值加权需要 mcap_float 字段")
    mcap_rb = mcap.reindex(columns=codes).ffill(limit=5).reindex(rb_dates) if weighting == "cap" else None
    orders: dict[int, tuple[np.ndarray, np.ndarray]] = {}   # 成交日序号 → (目标, 权重基数)
    day_pos = {d: i for i, d in enumerate(days)}
    for t in rb_dates:
        if t not in day_pos:
            continue
        i_exec = day_pos[t] + (1 if execution == "open" else 0)
        if i_exec >= n_d:
            continue
        s = sig.loc[t]
        valid = s.notna().to_numpy()
        base = np.ones(n_c)
        if weighting == "cap":
            base = np.nan_to_num(mcap_rb.loc[t].to_numpy(float))
            valid &= base > 0
        k = int(valid.sum())
        n_sel = 0 if k == 0 else (min(top_n, k) if top_n else max(1, int(round(top_q * k))))
        target = np.zeros(n_c, dtype=bool)
        if n_sel:
            order = s[valid].sort_values(ascending=False, kind="mergesort").index[:n_sel]
            target[codes.get_indexer(order)] = True
        orders[i_exec] = (target, base)

    w = np.zeros(n_c)
    nav = 1.0
    pending_exit = np.zeros(n_c, dtype=bool)
    gross, net, to_s, cost_s, weights, cap_ratios = [], [], {}, {}, {}, []

    def trade(i: int, new: np.ndarray, w_old: np.ndarray) -> tuple[np.ndarray, float]:
        dw = new - w_old
        if capital is not None and px_exec is not None and costs.lot_size > 1:
            V = capital * nav
            px = np.where(np.isfinite(px_exec[i]) & (px_exec[i] > 0), px_exec[i], np.nan)
            shares = np.trunc(np.nan_to_num(dw * V / (px * costs.lot_size))) * costs.lot_size
            dw_lot = np.nan_to_num(shares * px / V)
            dw = np.where(new == 0, -w_old, dw_lot)   # 清仓允许零股
            new = w_old + dw
        b, s = costs.stamp_rates(days[i])
        buy, sell = np.clip(dw, 0, None), np.clip(-dw, 0, None)
        comm = (buy + sell) * (costs.commission + costs.other)
        if capital is not None and costs.min_commission > 0:
            V = capital * nav
            traded = (buy + sell) > 1e-12
            comm = np.where(traded, np.maximum((buy + sell) * costs.commission, costs.min_commission / V)
                            + (buy + sell) * costs.other, 0.0)
        c = float(comm.sum() + (buy * b).sum() + (sell * s).sum() + ((buy + sell) * slip_rate[i]).sum())
        to_s[days[i]] = to_s.get(days[i], 0.0) + float(np.abs(dw).sum() / 2)
        cost_s[days[i]] = cost_s.get(days[i], 0.0) + c
        return new, c

    for i in range(n_d):
        # 1. 隔夜
        rp1 = float(w @ r_on[i])
        w = w * (1 + r_on[i]) / (1 + rp1)
        # 2. 退市
        hit = new_delist[i] & (w > 0)
        rp_del = 0.0
        if hit.any():
            rp_del = float((w[hit] * delist_return).sum())
            w = np.where(hit, 0.0, w) / (1 + rp_del)
            pending_exit &= ~hit
        cost = 0.0
        # 3. 成交（开盘或收盘时点）：先处理挂单卖出，再处理调仓
        def execute():
            nonlocal w, pending_exit, cost
            if pending_exit.any():
                sell_now = pending_exit & can_sell[i]
                if sell_now.any():
                    w, c = trade(i, np.where(sell_now, 0.0, w), w)
                    cost += c
                    pending_exit &= ~sell_now
            if i in orders:
                target, base = orders[i]
                locked = (w > 0) & ~can_sell[i]
                new = allocate(target, base, w, locked, can_buy[i])
                pending_exit = locked & ~target
                w, c = trade(i, new, w)
                cost += c
                weights[days[i]] = pd.Series(w, index=codes)[w > 0]
                aum = capital * nav if capital is not None else capacity_aum
                held = w > 0
                cap_ratios.extend((w[held] * aum / adv[i][held]).tolist())

        if execution == "open":
            execute()
        # 4. 日内
        rp2 = float(w @ r_in[i])
        w = w * (1 + r_in[i]) / (1 + rp2)
        if execution == "close":
            execute()
        g = (1 + rp1) * (1 + rp_del) * (1 + rp2) - 1
        nt = (1 + g) * (1 - cost) - 1
        nav *= 1 + nt
        gross.append(g)
        net.append(nt)

    res = BacktestResult(pd.Series(net, index=days), pd.Series(gross, index=days),
                         pd.Series(to_s, dtype=float), pd.Series(cost_s, dtype=float), weights)
    cr = np.array([x for x in cap_ratios if np.isfinite(x)])
    res.capacity = {"aum": capital if capital is not None else capacity_aum,
                    "median": float(np.median(cr)) if len(cr) else float("nan"),
                    "p95": float(np.quantile(cr, 0.95)) if len(cr) else float("nan"),
                    "max": float(cr.max()) if len(cr) else float("nan")}
    n_reb = max(len([d for d in orders]), 1)
    res.stats = {**perf_stats(res.returns, rf),
                 "turnover_per_rebalance": float(res.turnover.sum() / n_reb),
                 "cost_annual": float(res.costs.sum() / max(n_d, 1) * TRADING_DAYS),
                 "capacity_median_pos_adv": res.capacity["median"]}
    return res


def backtest_vs_universe(factor: pd.DataFrame, panel: dict, market: str, mask: pd.DataFrame, **kw) -> dict:
    """前 q 组合 vs 同一股票池（同一加权方式、同样成本与执行），返回两者结果与超额统计。"""
    top = backtest(factor, panel, market, mask, **kw)
    kw_b = {k: v for k, v in kw.items() if k not in ("direction", "top_q", "top_n")}
    ones = mask.astype(float).where(mask)
    bench = backtest(ones, panel, market, mask, top_q=1.0, **kw_b)
    ex = (top.returns - bench.returns).dropna()
    ex_stats = perf_stats(ex)
    return {"top": top, "universe": bench, "excess": ex,
            "stats": {"top": top.stats, "universe": bench.stats,
                      "excess_cagr": top.stats["cagr"] - bench.stats["cagr"],
                      "excess_ann": float(ex.mean() * TRADING_DAYS), "excess_ir": ex_stats["sharpe"],
                      "excess_maxdd": ex_stats["maxdd"], "capacity": top.capacity}}
