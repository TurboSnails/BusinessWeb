"""交易日历：从面板索引取交易日、月末调仓日、按交易日平移。

交易日一律取自数据本身（面板宽表的行索引），不另配交易所日历：数据里没有的日子就不是交易日。
"""

from __future__ import annotations

import pandas as pd


def trading_days(panel_or_frame) -> pd.DatetimeIndex:
    """面板（字段 → 宽表）或单张宽表 → 排好序的交易日索引（所有字段行索引的并集）。"""
    if isinstance(panel_or_frame, dict):
        idx = pd.DatetimeIndex([])
        for df in panel_or_frame.values():
            idx = idx.union(pd.DatetimeIndex(df.index))
    else:
        idx = pd.DatetimeIndex(panel_or_frame.index)
    return pd.DatetimeIndex(idx.unique()).sort_values()


def month_end_dates(days: pd.DatetimeIndex, start=None, end=None, drop_incomplete_last: bool = True) -> pd.DatetimeIndex:
    """每个自然月的最后一个交易日（调仓日）。

    drop_incomplete_last=True：数据最后一天之后同月还有工作日（周一至周五）时，认为最后一个月不完整，
    不把它当调仓日（否则最后一期会是半个月）。月底恰逢长假时可能误删最后一个月，只影响最新一期。
    start / end 只做筛选（含端点）。
    """
    days = pd.DatetimeIndex(days).sort_values()
    s = pd.Series(days, index=days)
    out = pd.DatetimeIndex(s.groupby(days.to_period("M")).max().values)
    if drop_incomplete_last and len(out):
        last = out[-1]
        if len(pd.bdate_range(last + pd.offsets.Day(1), last + pd.offsets.MonthEnd(0))) > 0 and last == days[-1]:
            out = out[:-1]
    if start is not None:
        out = out[out >= pd.Timestamp(start)]
    if end is not None:
        out = out[out <= pd.Timestamp(end)]
    return out


def week_end_dates(days: pd.DatetimeIndex, start=None, end=None, drop_incomplete_last: bool = True) -> pd.DatetimeIndex:
    """每个自然周（周一至周日）的最后一个交易日。drop_incomplete_last：数据最后一天之后同一周还有工作日时去掉最后一周。"""
    days = pd.DatetimeIndex(days).sort_values()
    s = pd.Series(days, index=days)
    out = pd.DatetimeIndex(s.groupby(days.to_period("W-SUN")).max().values)
    if drop_incomplete_last and len(out):
        last = out[-1]
        if last == days[-1] and last.weekday() < 4:
            out = out[:-1]
    if start is not None:
        out = out[out >= pd.Timestamp(start)]
    if end is not None:
        out = out[out <= pd.Timestamp(end)]
    return out


def rebalance_dates(days: pd.DatetimeIndex, freq: str = "M") -> pd.DatetimeIndex:
    """调仓日：'M' 月末（默认）、'W' 周末、'D' 每个交易日（最后一天除外，没有下一期）。"""
    if freq == "M":
        return month_end_dates(days)
    if freq == "W":
        return week_end_dates(days)
    if freq == "D":
        return pd.DatetimeIndex(days).sort_values()[:-1]
    raise ValueError(f"未知调仓频率 {freq}（M / W / D）")


def shift_days(days: pd.DatetimeIndex, date, n: int):
    """date 之后第 n 个交易日（n < 0 为之前）。date 不是交易日时，先对齐到其后第一个交易日
    （n ≤ 0 时对齐到其前最后一个交易日）。越界返回 None。"""
    days = pd.DatetimeIndex(days)
    d = pd.Timestamp(date)
    if n > 0:
        pos = days.searchsorted(d, side="left")
        if pos < len(days) and days[pos] == d:
            pos += n
        else:
            pos += n - 1
    else:
        pos = days.searchsorted(d, side="right") - 1 + n
    return days[pos] if 0 <= pos < len(days) else None


def days_between(days: pd.DatetimeIndex, a, b) -> int:
    """a（含）到 b（不含）之间的交易日数；b 早于 a 时为负。"""
    days = pd.DatetimeIndex(days)
    return int(days.searchsorted(pd.Timestamp(b)) - days.searchsorted(pd.Timestamp(a)))
