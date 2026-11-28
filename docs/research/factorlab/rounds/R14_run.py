"""R14 运行。用法（research-py 目录，PYTHONPATH=.）：
    python R14_run.py <频率 M|W|D> <模式 explore|validate> 因子1 [因子2 ...]
每个评估都由引擎自动记账（族 R14-cn-<频率>）。
"""
import sys
import time

from factorlab.evaluate import evaluate_factor

BASE = {"size", "rev_1m", "vol_60d", "turnover_20d", "mom_12_1", "high_52w"}


def main():
    freq, mode, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    for n in names:
        t = time.time()
        mot = ("engine: R14 weekly/daily baseline" if n in BASE else
               "literature: Liu-Zhou-Zhu 2024 trend factor" if n == "cn_trend" else
               "user request: R13 pattern at higher frequency")
        r = evaluate_factor("cn", n, mode=mode, rebalance=freq, family=f"R14-cn-{freq}", motivation=mot,
                            note=f"R14-2026-11-28 {freq} {mode}", run_backtest=True)
        s = r.summary
        print(f"{freq} {mode} {n} IC {s.get('rank_ic_mean'):+.4f} t {s.get('rank_ic_t_nw'):+.2f} | cap {s.get('tmu_cap_mean')*100:+.3f}% t {s.get('tmu_cap_t_nw'):+.2f} | ew {s.get('tmu_ew_mean')*100:+.3f}% t {s.get('tmu_ew_t_nw'):+.2f} | bt {s.get('bt_cap_excess_cagr', float('nan')):+.3f} {s.get('bt_equal_excess_cagr', float('nan')):+.3f} | n {s.get('n_periods')} | {time.time()-t:.0f}s", flush=True)


if __name__ == "__main__":
    main()
