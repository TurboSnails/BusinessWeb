"""R15 运行：python R15_run.py <M|W> <explore|validate> 因子...（research-py 目录，PYTHONPATH=.）"""
import sys
import time

from factorlab.evaluate import evaluate_factor


def main():
    freq, mode, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    for n in names:
        t = time.time()
        r = evaluate_factor("cn", n, mode=mode, rebalance=freq, family=f"R15-cn-{freq}",
                            motivation="literature/practice: R15 value reversion", note=f"R15-2026-11-28 {freq} {mode}")
        s = r.summary
        print(f"{freq} {mode} {n} IC {s['rank_ic_mean']:+.4f} t {s['rank_ic_t_nw']:+.2f} | cap {s['tmu_cap_mean']*100:+.3f}% t {s['tmu_cap_t_nw']:+.2f} | ew {s['tmu_ew_mean']*100:+.3f}% t {s['tmu_ew_t_nw']:+.2f} | bt {s.get('bt_cap_excess_cagr', float('nan')):+.3f} {s.get('bt_equal_excess_cagr', float('nan')):+.3f} | cov {s['coverage_mean']:.2f} n {s['n_periods']} | {time.time()-t:.0f}s", flush=True)


if __name__ == "__main__":
    main()
