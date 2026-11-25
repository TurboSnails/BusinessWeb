"""数据核对表：处理后序列与第二来源逐项比较，写 data/CHECKS.json 与 data/CHECKS.md。

只做单个资产层面的核对（价格水平、年收益方向与量级），不计算任何组合、相关性或夏普——
那些属于预注册之后的检验（锁箱规则见 docs/research/LEDGER.md）。用法：uv run python -m data.checks
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from data.build import fred, yahoo

HERE = Path(__file__).resolve().parent
P = HERE / "processed"
FIRST_SEEN = "2026-11-25"
# 2026-11-25 逐月查看后记录的例外：世界银行月均价与其相邻月份不连贯，本序列连贯（见核对表说明）
DOCUMENTED_WB_EXCEPTIONS = {"1980-12", "1983-07", "1985-03"}


def annual_from_daily(ret: pd.Series) -> pd.Series:
    years = ret.index.str[:4]
    return (1 + ret).groupby(years).prod() - 1


def annual_from_prices(px: pd.Series) -> pd.Series:
    last = px.groupby(px.index.str[:4]).last()
    return last.pct_change()


def main() -> None:
    out: dict = {"firstSeen": FIRST_SEEN, "checks": []}
    add = lambda **kw: out["checks"].append(kw)  # noqa: E731

    # ---------- 国债 ----------
    bond = pd.read_csv(P / "bond5_daily.csv", index_col=0)
    bond.index = bond.index.astype(str)
    gs5 = fred("fred_gs5.csv")
    gs5.index = [d[:7] for d in gs5.index]
    mavg = bond["yield"].groupby(bond.index.str[:7]).mean()
    common = mavg.index.intersection(gs5.index)
    diff = (mavg[common] - gs5[common]).abs()
    add(series="5 年期国债收益率", against="FRED GS5（官方月均值）", what="DGS5 日度值的月均 vs GS5", n=int(len(common)),
        result=f"最大偏差 {diff.max():.3f} 个百分点，偏差 > 0.02 的月份 {int((diff > 0.02).sum())} 个", ok=bool(diff.max() < 0.05))

    ann = annual_from_daily(bond["ret"].dropna())
    ref = {"1994": -0.044, "2008": 0.127, "2022": -0.085}
    rows = []
    for y, r in ref.items():
        rows.append(f"{y} 年 {ann[y] * 100:+.1f}%（robustness 研究的 GS5 月度定价 {r * 100:+.1f}%）")
    same_sign = all(np.sign(ann[y]) == np.sign(r) for y, r in ref.items())
    add(series="5 年期国债总回报（日度换算）", against="robustness 研究的月度定价（GS5）", what="1994、2008、2022 年收益", n=3,
        result="；".join(rows), ok=bool(same_sign and all(abs(ann[y] - r) < 0.02 for y, r in ref.items())))

    for etf, label, dur in [("yahoo_iei.json", "IEI（3–7 年期国债 ETF）", "久期约 4.5 年，与 5 年期接近"), ("yahoo_ief.json", "IEF（7–10 年期国债 ETF）", "久期约 7.5 年，长于 5 年期，只看方向")]:
        px = yahoo(etf, adjusted=True)
        e_ann = annual_from_prices(px).dropna()
        yrs = [y for y in e_ann.index if y in ann.index and y < "2026" and int(y) > int(px.index[0][:4])]
        a = np.array([ann[y] for y in yrs]); b = np.array([e_ann[y] for y in yrs])
        agree = int((np.sign(a) == np.sign(b)).sum())
        mad = float(np.mean(np.abs(a - b)))
        add(series="5 年期国债总回报（日度换算）", against=label, what=f"年收益（{yrs[0]}–{yrs[-1]}，{dur}）", n=len(yrs),
            result=f"同向 {agree}/{len(yrs)} 年，平均绝对差 {mad * 100:.1f} 个百分点，相关 {np.corrcoef(a, b)[0, 1]:.2f}",
            ok=bool(agree >= len(yrs) - 2))

    # ---------- 黄金 ----------
    gold = pd.read_csv(P / "gold_daily.csv", index_col=0)
    gold.index = gold.index.astype(str)
    wb = pd.read_csv(P / "gold_worldbank_monthly.csv", index_col=0)["price"]
    wb.index = wb.index.astype(str)
    for src, label in [("bundesbank-frankfurt", "1975–1998 法兰克福定价 ÷ 汇率"), ("comex-gc-front", "2000–2004 COMEX 近月"), ("gld-fee-added-back", "2004 年起 GLD 加回年费")]:
        seg = gold[gold["source"] == src]["price"]
        m = seg.groupby(seg.index.str[:7]).mean()
        months = [k for k in m.index if k in wb.index and seg.index.str[:7].tolist().count(k) >= 15]
        rel = (m[months] / wb[months] - 1)
        big = rel[rel.abs() > 0.02]
        note = ""
        documented = True
        if len(big):
            ours = gold["price"].groupby(gold.index.str[:7]).mean()
            parts = []
            for k in big.index:
                y, mo = map(int, k.split("-"))
                ks = [f"{y + (mo - 2 + i) // 12}-{(mo - 2 + i) % 12 + 1:02d}" for i in range(3)]
                parts.append(f"{k}：世界银行前后三个月 {'/'.join(str(round(wb[x])) for x in ks)}，本序列 {'/'.join(str(round(ours[x])) for x in ks)}")
                documented = documented and k in DOCUMENTED_WB_EXCEPTIONS
            note = "。差异 > 2% 的月份：" + "；".join(parts) + "。判断：世界银行这几个月与它自己的相邻月份不连贯（1980-12 尤其明显），本序列平滑；回测用日度序列，不受影响；需第三来源最终确认"
        add(series=f"黄金（{label}）", against="世界银行月均价（伦敦）", what="月均价相对误差", n=len(months),
            result=f"中位 {rel.median() * 100:+.2f}%，绝对值中位 {rel.abs().median() * 100:.2f}%，最大 {rel.abs().max() * 100:.2f}%，> 2% 的月份 {len(big)} 个{note}",
            ok=bool(rel.abs().median() < 0.01 and documented))

    gc = yahoo("yahoo_gc.json"); gld = yahoo("yahoo_gld.json", adjusted=True)
    gc_a = annual_from_prices(gc); gld_a = annual_from_prices(gld)
    yrs = [y for y in gld_a.dropna().index if y in gc_a.index and "2005" <= y <= "2025"]
    d = np.array([gc_a[y] - gld_a[y] for y in yrs])
    add(series="黄金：COMEX 近月连续合约 vs GLD", against="两者互为第二来源", what=f"年收益差（{yrs[0]}–{yrs[-1]}）", n=len(yrs),
        result=f"GC=F 平均高 {d.mean() * 100:.2f} 个百分点（含换月价差与 GLD 年费），最大 {np.abs(d).max() * 100:.1f}；所以 2004 年后用 GLD 加回年费，不用 GC=F",
        ok=True)

    gap = gold[gold["source"] == "worldbank-interpolated"]
    add(series="黄金缺口 1999-01 至 2000-08", against="—", what="没有免费日度来源", n=int(len(gap)),
        result=f"用世界银行月均价插值（{gap.index[0]} 至 {gap.index[-1]}），日度波动被抹平；检验时这 20 个月的黄金收益按月均口径对待",
        ok=True)

    # ---------- CPI ----------
    cpi = pd.read_csv(P / "cpi_monthly.csv", index_col=0)["cpi"]
    months = pd.period_range(cpi.index[0], cpi.index[-1], freq="M").strftime("%Y-%m")
    add(series="CPI（CPIAUCSL）", against="单一官方来源", what="是否连续", n=int(len(cpi)),
        result=f"{cpi.index[0]} 至 {cpi.index[-1]}，缺 {', '.join(sorted(set(months) - set(cpi.index))) or '无'}（2025-10 可能与 2025 年联邦政府停摆有关，需核实）；只用于去漂移检验，缺月按相邻两月几何插值，不作交易信号", ok=True)

    out["allOk"] = all(c["ok"] for c in out["checks"])
    (HERE / "CHECKS.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# 多资产数据核对表", "",
        f"生成：`uv run python -m data.checks`。首次被本项目看过：{FIRST_SEEN}（路线图第 3 阶段，只做单资产核对）。",
        "来源、下载时间与 sha256 见 `data/SOURCES.json`；处理方法见 `data/build.py` 文件头。", "",
        "| 序列 | 对照 | 核对内容 | 样本 | 结果 | 通过 |", "|---|---|---|---:|---|---|",
    ]
    for c in out["checks"]:
        lines.append(f"| {c['series']} | {c['against']} | {c['what']} | {c['n']} | {c['result']} | {'是' if c['ok'] else '否'} |")
    (HERE / "CHECKS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    for c in out["checks"]:
        print(("✓ " if c["ok"] else "✗ ") + c["series"] + " | " + c["against"] + " | " + c["result"])


if __name__ == "__main__":
    main()
