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
- 因子截面不足（某调仓日股票池内有效因子值少于 min_names 只）：**不调仓、继续持有上期组合**（随价格漂移），
  而不是清仓持现金——缺数据不是「看空」信号；跳过的调仓日记在 stats['skipped_rebalances']。
- 对股票池回测（_backtest_vs_universe）的起点：第一个「股票池内有效因子值 ≥ min_names」的调仓日；组合与基准
  **都从这一天开始**（此前因子还没有值，组合只能持现金而基准持有股票池，年化超额会被系统性压低）。
  evaluate_factor 传 min_names = 2 × 分组数，与 quantile_analysis 每期做分组的门槛一致。
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np
import pandas as pd

from .calendar import trading_days
from .universe import AdvCache, bool_values

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


# ---------------------------------------------------------------- 选股（评估与回测共用）
@lru_cache(maxsize=None)
def _tie_key(code: str) -> float:
    return int(hashlib.sha256(("tie:" + str(code)).encode()).hexdigest()[:12], 16) / 16 ** 12


def tie_keys(codes) -> np.ndarray:
    """并列时的确定性次序：sha256("tie:" + 代码)，与列顺序无关（也与 70/30 分层的哈希不同）。"""
    return np.fromiter((_tie_key(str(c)) for c in codes), dtype=float, count=len(codes))


def n_select(k: int, top_q: float | None = None, top_n: int | None = None) -> int:
    """k 只有效股票里选几只：top_n 优先（不超过 k），否则 round_half_up(top_q × k)，至少 1 只。"""
    if k <= 0:
        return 0
    if top_n:
        return int(min(top_n, k))
    return int(min(k, max(1, math.floor(k * float(top_q) + 0.5))))


def order_desc(values: np.ndarray, keys: np.ndarray) -> np.ndarray:
    """有效值（有限数）的位置，按值从大到小、并列按 keys 从小到大排序。"""
    values = np.asarray(values, dtype=float)
    idx = np.flatnonzero(np.isfinite(values))
    return idx[np.lexsort((keys[idx], -values[idx]))]


def select_top(values: np.ndarray, keys: np.ndarray, top_q: float | None = None,
               top_n: int | None = None) -> np.ndarray:
    """选前 top_q（或前 top_n）的布尔掩码；quantile_labels 的最高组与此完全相同（top_q = 1/n_q 时）。"""
    order = order_desc(values, keys)
    out = np.zeros(len(values), dtype=bool)
    out[order[:n_select(len(order), top_q, top_n)]] = True
    return out


def quantile_labels(values: np.ndarray, keys: np.ndarray, n_q: int) -> np.ndarray:
    """分组标签 1..n_q（n_q = 值最大的一组），无效值为 NaN。从大到小排序后按 n_select(k, j/n_q) 切组，
    所以最高组 = select_top(top_q=1/n_q)。"""
    order = order_desc(values, keys)
    k = len(order)
    out = np.full(len(values), np.nan)
    if k == 0:
        return out
    bounds = np.array([n_select(k, j / n_q) for j in range(1, n_q)] + [k])
    pos = np.arange(k)
    out[order] = n_q - np.searchsorted(bounds, pos, side="right")
    return out


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
    return bool_values(panel[key].reindex(index=idx, columns=cols))


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


def _backtest(factor: pd.DataFrame, panel: dict, market: str, mask: pd.DataFrame | None = None,
              direction: int = 1, top_q: float = 0.2, top_n: int | None = None, weighting: str = "cap",
              execution: str = "open", costs: CostModel | None = None, slippage: SlippageModel | None | str = "default",
              constraints: bool | None = None, securities: pd.DataFrame | None = None,
              delist_return: float = -1.0, capital: float | None = None, capacity_aum: float = 1e8,
              rf=None, end=None, adv: AdvCache | None = None, min_names: int = 1) -> BacktestResult:
    """底层回测（内部用；研究请走 evaluate.evaluate_factor，它经护栏读数并记账）。

    factor：调仓日 × 代码（行索引即调仓日）；mask：同形状股票池；direction=-1 选最小的。
    选股与 evaluate 的分组共用 select_top（并列按代码哈希，不按列顺序）。
    adv：共用的「t 之前 20 日成交额中位数」缓存（只在成交日惰性计算）。
    min_names：调仓日有效因子值（股票池内、市值加权时另须有市值）少于此数时不调仓，持有上期组合。"""
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
    win = slip.window if slip is not None else 20
    if adv is None or adv.amount is None or not adv.columns.equals(codes) or adv.window != win:
        adv = AdvCache(None if amount is None else amount.reindex(columns=codes), win, max(1, win // 2))
    nan_row = np.full(n_c, np.nan)

    def adv_row(i: int) -> np.ndarray:
        r = adv.row(days[i])
        return nan_row if r is None else r

    def slip_rate(i: int) -> np.ndarray:
        return slip.rate(adv_row(i)) if slip is not None else np.zeros(n_c)
    px_exec = _num(panel, "open" if execution == "open" else "close", days, codes)

    # 信号
    sig = factor.reindex(columns=codes) * direction
    if mask is not None:
        sig = sig.where(bool_values(mask.reindex(index=sig.index, columns=codes)))
    keys = tie_keys(codes)
    mcap = panel.get("mcap_float")
    if weighting == "cap" and mcap is None:
        raise ValueError("市值加权需要 mcap_float 字段")
    mcap_rb = mcap.reindex(columns=codes).ffill(limit=5).reindex(rb_dates) if weighting == "cap" else None
    orders: dict[int, tuple[np.ndarray, np.ndarray]] = {}   # 成交日序号 → (目标, 权重基数)
    skipped: list[pd.Timestamp] = []                         # 截面不足、不调仓的调仓日
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
        vals = np.where(valid, s.to_numpy(float), np.nan)
        if np.isfinite(vals).sum() < max(int(min_names), 1):
            skipped.append(t)
            continue
        target = select_top(vals, keys, top_q, top_n)
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
        c = float(comm.sum() + (buy * b).sum() + (sell * s).sum() + ((buy + sell) * slip_rate(i)).sum())
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
                adv = adv_row(i)
                held = (w > 0) & (adv > 0)  # 成交额为 0（停牌或无成交）的持仓不计入容量比例，避免除以零
                cap_ratios.extend((w[held] * aum / adv[held]).tolist())

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
                 "skipped_rebalances": [str(d.date()) for d in skipped],
                 "cost_annual": float(res.costs.sum() / max(n_d, 1) * TRADING_DAYS),
                 "capacity_median_pos_adv": res.capacity["median"]}
    return res


def first_formable(factor: pd.DataFrame, mask: pd.DataFrame | None, min_names: int = 1) -> pd.Timestamp | None:
    """第一个「股票池内有效因子值 ≥ min_names」的调仓日；没有这样的日子为 None。"""
    ok = factor.notna()
    if mask is not None:
        ok &= bool_values(mask.reindex(index=factor.index, columns=factor.columns))
    hit = ok.sum(axis=1) >= max(int(min_names), 1)
    return hit.idxmax() if hit.any() else None


def _backtest_vs_universe(factor: pd.DataFrame, panel: dict, market: str, mask: pd.DataFrame,
                          min_names: int = 1, **kw) -> dict:
    """前 q 组合 vs 同一股票池（全部入池证券，不论因子是否有值；同一加权方式、同样成本与执行）。内部用。

    组合与基准都从 first_formable(factor, mask, min_names) 开始（见模块说明）；之后截面不足的调仓日
    组合不调仓、基准照常调仓。"""
    start = first_formable(factor, mask, min_names)
    if start is None:
        raise ValueError(f"因子在任何调仓日的股票池内有效值都不足 {min_names} 只，无法回测")
    factor, mask = factor.loc[start:], mask.loc[start:]
    top = _backtest(factor, panel, market, mask, min_names=min_names, **kw)
    kw_b = {k: v for k, v in kw.items() if k not in ("direction", "top_q", "top_n")}
    ones = mask.astype(float).where(mask)
    bench = _backtest(ones, panel, market, mask, top_q=1.0, **kw_b)
    ex = (top.returns - bench.returns).dropna()
    ex_stats = perf_stats(ex)
    return {"top": top, "universe": bench, "excess": ex,
            "stats": {"top": top.stats, "universe": bench.stats, "start": str(pd.Timestamp(start).date()),
                      "skipped_rebalances": top.stats["skipped_rebalances"],
                      "excess_cagr": top.stats["cagr"] - bench.stats["cagr"],
                      "excess_ann": float(ex.mean() * TRADING_DAYS), "excess_ir": ex_stats["sharpe"],
                      "excess_maxdd": ex_stats["maxdd"], "capacity": top.capacity}}
