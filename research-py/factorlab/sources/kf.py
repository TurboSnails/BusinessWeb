"""Ken French Data Library 适配器（market = 'us_kf'，幸存者偏差等级 C：组合级，退市由数据提供方处理）。

只下载**月度** CSV（*_CSV.zip），解析成 store.write_kf 的长表：
    date（月末）、dataset（zip 名去掉 _CSV.zip）、portfolio、weighting（vw / ew）、ret（小数）
外加两列可选列（来自同文件的「Number of Firms in Portfolios」「Average Firm Size / Average Market Cap」段）：
    n_firms、avg_size（百万美元，组合内平均市值）；因子数据集为 NaN。
因子文件（无段标题、只有一个月度段）的 weighting 记为 'vw'（因子本身由市值加权组合构造）。
缺失码 -99.99 / -999 → 该行不写（长表里缺行 = 缺失），每个数据集的缺失格数记入 MANIFEST。

命令行：
    uv run python -m factorlab.sources.kf fetch [--refresh]
    uv run python -m factorlab.sources.kf build
    uv run python -m factorlab.sources.kf audit
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from .. import store
from ..schema import Manifest
from .us import _Http, _write_bytes

MARKET = "us_kf"
BASE_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/{name}_CSV.zip"
MISSING_CODES = (-99.99, -999.0)

# --------------------------------------------------------------------------------------------
# 数据集目录：(zip 名去掉 _CSV.zip, 分组)
# --------------------------------------------------------------------------------------------
_US_FACTORS = ["F-F_Research_Data_Factors", "F-F_Research_Data_5_Factors_2x3", "F-F_Momentum_Factor",
               "F-F_ST_Reversal_Factor", "F-F_LT_Reversal_Factor"]
_US_UNI = ["Portfolios_Formed_on_ME", "Portfolios_Formed_on_BE-ME", "Portfolios_Formed_on_OP",
           "Portfolios_Formed_on_INV", "Portfolios_Formed_on_E-P", "Portfolios_Formed_on_CF-P",
           "Portfolios_Formed_on_D-P", "Portfolios_Formed_on_BETA", "Portfolios_Formed_on_VAR",
           "Portfolios_Formed_on_RESVAR", "Portfolios_Formed_on_AC", "Portfolios_Formed_on_NI",
           "10_Portfolios_Prior_12_2", "10_Portfolios_Prior_1_0", "10_Portfolios_Prior_60_13"]
_US_BI = ["6_Portfolios_2x3", "25_Portfolios_5x5", "100_Portfolios_10x10",
          "6_Portfolios_ME_OP_2x3", "6_Portfolios_ME_INV_2x3", "6_Portfolios_ME_Prior_12_2",
          "6_Portfolios_ME_Prior_1_0", "6_Portfolios_ME_Prior_60_13",
          "6_Portfolios_ME_EP_2x3", "6_Portfolios_ME_CFP_2x3", "6_Portfolios_ME_DP_2x3",
          "25_Portfolios_ME_OP_5x5", "25_Portfolios_ME_INV_5x5", "25_Portfolios_ME_Prior_12_2",
          "25_Portfolios_ME_Prior_1_0", "25_Portfolios_ME_Prior_60_13", "25_Portfolios_ME_AC_5x5",
          "25_Portfolios_ME_BETA_5x5", "25_Portfolios_ME_NI_5x5", "25_Portfolios_ME_VAR_5x5",
          "25_Portfolios_ME_RESVAR_5x5", "25_Portfolios_BEME_OP_5x5", "25_Portfolios_BEME_INV_5x5",
          "25_Portfolios_OP_INV_5x5", "100_Portfolios_ME_OP_10x10", "100_Portfolios_ME_INV_10x10"]
_US_IND = [f"{n}_Industry_Portfolios" for n in (5, 10, 12, 17, 30, 38, 48, 49)]
_REGIONS = ["Developed", "Developed_ex_US", "Europe", "Japan", "Asia_Pacific_ex_Japan", "North_America"]
_INTL_FACTORS = ([f"{r}_3_Factors" for r in _REGIONS] + [f"{r}_5_Factors" for r in _REGIONS]
                 + [f"{r}_Mom_Factor" for r in _REGIONS if r != "Asia_Pacific_ex_Japan"]
                 + ["Asia_Pacific_ex_Japan_MOM_Factor", "Emerging_5_Factors", "Emerging_MOM_Factor"])
_INTL_PORT = ([f"{r}_{k}_Portfolios_ME_{s}" for r in ("Developed", "Developed_ex_US")
               for k in (6, 25) for s in ("BE-ME", "OP", "INV", "Prior_12_2")]
              + [f"Emerging_Markets_6_Portfolios_ME_{s}" for s in ("BE-ME", "OP", "INV", "Prior_12_2")])

CATALOG: dict[str, str] = {}
for _grp, _names in (("us_factors", _US_FACTORS), ("us_univariate", _US_UNI), ("us_bivariate", _US_BI),
                     ("us_industry", _US_IND), ("intl_factors", _INTL_FACTORS), ("intl_portfolios", _INTL_PORT)):
    for _n in _names:
        CATALOG[_n] = _grp


def url_for(name: str) -> str:
    return BASE_URL.format(name=name)


# --------------------------------------------------------------------------------------------
# 通用解析器：KF 多段 CSV
# --------------------------------------------------------------------------------------------
_DATE_RE = re.compile(r"^\d{4}(\d{2}(\d{2})?)?$")
_FREQ = {4: "A", 6: "M", 8: "D"}


@dataclass
class Section:
    title: str                       # 紧贴表头之上、到空行为止的文字行（多行用空格连接）；无标题为 ""
    columns: list[str]
    index: list[str]                 # 原始日期串（YYYY / YYYYMM / YYYYMMDD）
    values: np.ndarray               # float，缺失码已转 NaN
    freq: str                        # A / M / D
    n_missing: int = 0               # 缺失码个数
    line: int = 0                    # 首个数据行在文件中的行号（0 起）
    kind: str = field(default="")    # ret / n_firms / size / other（classify_sections 填写）
    weighting: str = field(default="")
    warning: str = field(default="")   # 解析时的列数不符等问题


def _norm(s: str) -> str:
    return " ".join(s.split())


def _is_data(cells: list[str]) -> bool:
    return len(cells) >= 2 and bool(_DATE_RE.match(cells[0].strip()))


def _to_float(x: str) -> float:
    x = x.strip()
    if not x:
        return np.nan
    v = float(x)
    if any(abs(v - m) < 1e-9 for m in MISSING_CODES):
        return np.nan
    return v


def parse_kf_csv(text: str) -> list[Section]:
    """把 KF 多段 CSV 文本切成段。处理：CRLF / CR、尾随逗号与空格、表头名尾随空格（统一压缩空白）、
    多行段标题、无标题的首段（因子文件）、缺失码 -99.99 / -999、YYYY / YYYYMM / YYYYMMDD 日期。"""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    cells = [[c for c in ln.split(",")] for ln in lines]
    sections: list[Section] = []
    i, n = 0, len(lines)
    while i < n:
        if not _is_data(cells[i]):
            i += 1
            continue
        start = i
        while i < n and _is_data(cells[i]):
            i += 1
        block = cells[start:i]

        # 表头：数据块之上最近的非空行（个别文件表头与数据之间夹 1–2 个空行，如 Portfolios_Formed_on_VAR 年度段）
        h = start - 1
        while h >= 0 and start - h <= 3 and not lines[h].strip():
            h -= 1
        if h < 0 or not lines[h].strip() or _is_data(cells[h]) or "," not in lines[h]:
            raise ValueError(f"第 {start} 行起的数据块没有表头")
        hdr = [_norm(c) for c in cells[h]]
        cols = hdr[1:] if hdr and hdr[0] == "" else hdr[1:]
        while cols and cols[-1] == "":
            cols.pop()
        # 段标题：表头之上连续的非空、非数据行
        t, title_lines = h - 1, []
        while t >= 0 and lines[t].strip() and not _is_data(cells[t]):
            title_lines.append(lines[t].strip().rstrip(",").strip())
            t -= 1
        title = _norm(" ".join(reversed(title_lines)))
        idx, vals, nmiss, bad_rows = [], [], 0, 0
        for row in block:
            raw = [c.strip() for c in row[1:]]
            while len(raw) > len(cols) and raw[-1] == "":
                raw.pop()
            if len(raw) != len(cols):
                # KF 自身的个别特征段列数与表头不符（如 25_Portfolios_ME_NI_5x5 的 Accruals 段 35 列表头 / 34 列数据）。
                # 先补齐 / 截断并记警告；收益、公司数、市值段若有警告，sections_to_long 会报错。
                bad_rows += 1
                raw = (raw + [""] * len(cols))[: len(cols)]
            nmiss += sum(1 for x in raw if x and any(abs(float(x) - m) < 1e-9 for m in MISSING_CODES))
            idx.append(row[0].strip())
            vals.append([_to_float(x) for x in raw])
        lens = {len(x) for x in idx}
        if len(lens) != 1:
            raise ValueError(f"第 {start} 行起的段「{title}」日期格式不一致：{lens}")
        cols = _dedupe(cols)
        sections.append(Section(title=title, columns=cols, index=idx, values=np.array(vals, dtype="float64"),
                                freq=_FREQ[lens.pop()], n_missing=nmiss, line=start,
                                warning=(f"{bad_rows} 行列数与表头 {len(cols)} 不符" if bad_rows else "")))
    return classify_sections(sections)


def _dedupe(cols: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for c in cols:
        if c in seen:
            seen[c] += 1
            out.append(f"{c}#{seen[c]}")
        else:
            seen[c] = 0
            out.append(c)
    return out


def classify_sections(sections: list[Section]) -> list[Section]:
    """按段标题判断：ret（收益，vw/ew）、n_firms、size、other。
    标题含 'returns'（且不含 'average of'）才算收益段，唯一例外：文件里没有任何带 'return' 标题的段时，
    第一个月度段视为因子段（KF 因子文件的月度段没有标题）。"""
    def is_ret(t: str) -> bool:  # 「Value-Weighted Average of Past Return Variance」这类特征段不是收益
        return "returns" in t and "average of" not in t

    any_ret = any(is_ret(s.title.lower()) for s in sections)
    first_monthly = next((k for k, s in enumerate(sections) if s.freq == "M"), None)
    for k, s in enumerate(sections):
        t = s.title.lower()
        if is_ret(t):
            s.kind = "ret"
        elif "number of firms" in t:
            s.kind = "n_firms"
        elif "firm size" in t or "market cap" in t:
            s.kind = "size"
        elif not any_ret and k == first_monthly:
            s.kind = "ret"
        else:
            s.kind = "other"
        if s.kind == "ret":
            s.weighting = "ew" if "equal" in t else "vw"
    return sections


def _month_end(idx: list[str]) -> pd.DatetimeIndex:
    return pd.to_datetime(idx, format="%Y%m") + pd.offsets.MonthEnd(0)


def sections_to_long(sections: list[Section], dataset: str) -> tuple[pd.DataFrame, dict]:
    """月度收益段 → 长表（含 n_firms / avg_size 两列可选列）。返回 (df, 统计)。"""
    rets = [s for s in sections if s.freq == "M" and s.kind == "ret"]
    if not rets:
        raise ValueError(f"{dataset}: 找不到月度收益段（段标题：{[s.title for s in sections]}）")
    for s in sections:
        if s.freq == "M" and s.kind in ("ret", "n_firms", "size") and s.warning:
            raise ValueError(f"{dataset}: 段「{s.title}」{s.warning}")
    seen = set()
    frames = []
    stats = {"sections": [], "missing_cells": 0}
    for s in rets:
        if s.weighting in seen:
            raise ValueError(f"{dataset}: 有两个 {s.weighting} 月度收益段")
        seen.add(s.weighting)
        wide = pd.DataFrame(s.values / 100.0, index=_month_end(s.index), columns=s.columns)
        long = wide.stack(future_stack=True).rename("ret").reset_index()
        long.columns = ["date", "portfolio", "ret"]
        long["weighting"] = s.weighting
        frames.append(long)
        stats["sections"].append({"title": s.title, "weighting": s.weighting, "start": s.index[0],
                                  "end": s.index[-1], "months": len(s.index), "portfolios": len(s.columns),
                                  "missing": s.n_missing})
        stats["missing_cells"] += s.n_missing
    df = pd.concat(frames, ignore_index=True)
    for kind, col in (("n_firms", "n_firms"), ("size", "avg_size")):
        sec = next((s for s in sections if s.freq == "M" and s.kind == kind), None)
        if sec is None:
            df[col] = np.nan
            continue
        w = pd.DataFrame(sec.values, index=_month_end(sec.index), columns=sec.columns)
        m = w.stack(future_stack=True).rename(col).reset_index()
        m.columns = ["date", "portfolio", col]
        df = df.merge(m, on=["date", "portfolio"], how="left")
    df = df[df["ret"].notna()].copy()
    df["dataset"] = dataset
    df = df[["date", "dataset", "portfolio", "weighting", "ret", "n_firms", "avg_size"]]
    if df.duplicated(["date", "dataset", "portfolio", "weighting"]).any():
        raise ValueError(f"{dataset}: 有重复行")
    return df.reset_index(drop=True), stats


def read_zip_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".csv")]
        if len(names) != 1:
            raise ValueError(f"zip 内 CSV 个数 {len(names)}：{z.namelist()}")
        return z.read(names[0]).decode("latin-1")


# --------------------------------------------------------------------------------------------
# 下载 / 构建
# --------------------------------------------------------------------------------------------
def raw_dir() -> Path:
    d = store.market_dir(MARKET) / "raw"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _sources_path() -> Path:
    return raw_dir() / "SOURCES.json"


def fetch_kf(names: list[str] | None = None, refresh: bool = False, min_interval: float = 1.0,
             verbose: bool = True) -> dict:
    """下载 zip 到 {root}/us_kf/raw/（断点续传：已有则跳过），记录 URL / sha256 / 大小 / 时间到 raw/SOURCES.json。"""
    names = names or list(CATALOG)
    http = _Http(min_interval=min_interval)
    src = json.loads(_sources_path().read_text()) if _sources_path().exists() else {}
    got, skipped, failed = 0, 0, {}
    for name in names:
        p = raw_dir() / f"{name}_CSV.zip"
        if p.exists() and not refresh:
            skipped += 1
            continue
        try:
            data = http.get(url_for(name))
            read_zip_text(data)  # 校验是合法 zip
            _write_bytes(p, data)
            src[name] = {"url": url_for(name), "file": f"raw/{p.name}", "bytes": len(data),
                         "sha256": hashlib.sha256(data).hexdigest(),
                         "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            got += 1
        except Exception as e:  # noqa: BLE001
            failed[name] = str(e)[:200]
        if verbose:
            print(f"[kf] {name}: {'失败 ' + failed[name] if name in failed else 'ok'}", flush=True)
    _sources_path().write_text(json.dumps(src, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
    out = {"downloaded": got, "skipped": skipped, "failed": failed, "http_requests": http.requests}
    if verbose:
        print(f"[kf] fetch {out}")
    return out


def build_kf(names: list[str] | None = None, verbose: bool = True) -> dict:
    names = names or [n for n in CATALOG if (raw_dir() / f"{n}_CSV.zip").exists()]
    src = json.loads(_sources_path().read_text()) if _sources_path().exists() else {}
    frames, catalog = [], {}
    for name in names:
        data = (raw_dir() / f"{name}_CSV.zip").read_bytes()
        text = read_zip_text(data)
        secs = parse_kf_csv(text)
        df, st = sections_to_long(secs, name)
        frames.append(df)
        head = text.replace("\r", "").split("\n")[0].strip()
        catalog[name] = {"group": CATALOG.get(name, "other"), "start": str(df["date"].min().date()),
                         "end": str(df["date"].max().date()), "rows": int(len(df)),
                         "portfolios": int(df["portfolio"].nunique()),
                         "weightings": sorted(df["weighting"].unique()), "missing_cells": st["missing_cells"],
                         "has_n_firms": bool(df["n_firms"].notna().any()),
                         "has_avg_size": bool(df["avg_size"].notna().any()),
                         "created_from": head[:120], "url": url_for(name),
                         "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
                         "fetched_at": src.get(name, {}).get("fetched_at")}
        if verbose:
            c = catalog[name]
            print(f"[kf] {name}: {c['start']}→{c['end']} {c['portfolios']} 组合 {c['weightings']} "
                  f"{c['rows']} 行 缺失 {c['missing_cells']}")
    df = pd.concat(frames, ignore_index=True)
    store.write_kf(df, MARKET)
    m = Manifest(
        market=MARKET, source="Ken French Data Library (mba.tuck.dartmouth.edu/pages/faculty/ken.french)",
        survivorship="C", downloaded_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        coverage=(str(df["date"].min().date()), str(df["date"].max().date())), rows=int(len(df)),
        securities=len(catalog),
        sha256={"portfolios.parquet": "", **{f"raw/{n}_CSV.zip": "" for n in catalog}},
        notes=("组合级月度收益（小数），月末日期；weighting vw/ew，因子数据集记 vw；缺失码 -99.99/-999 不写行；"
               "n_firms / avg_size（百万美元）来自同文件的公司数与平均市值段。securities 字段 = 数据集个数。"
               "datasets 字段列出每个 zip 的 URL、sha256、覆盖区间。"))
    p = store.write_manifest(m)
    man = json.loads(p.read_text(encoding="utf-8"))
    man["datasets"] = catalog
    p.write_text(json.dumps(man, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"rows": int(len(df)), "datasets": len(catalog), "coverage": m.coverage}


# --------------------------------------------------------------------------------------------
# 结构审计（不计算任何因子表现统计）
# --------------------------------------------------------------------------------------------
def audit_kf() -> dict:
    df = pd.read_parquet(store.market_dir(MARKET) / "portfolios.parquet")
    out: dict = {"rows": int(len(df)), "datasets": int(df["dataset"].nunique()),
                 "duplicates": int(df.duplicated(["date", "dataset", "portfolio", "weighting"]).sum()),
                 "nan_ret": int(df["ret"].isna().sum()),
                 "ret_lt_minus_1": int((df["ret"] <= -1).sum()),
                 "non_month_end_dates": int((df["date"] != df["date"] + pd.offsets.MonthEnd(0)).sum())}
    # 月份缺口（每个数据集 × 组合 × 加权）
    gaps = {}
    for (ds, pf, w), g in df.groupby(["dataset", "portfolio", "weighting"]):
        m = g["date"].dt.to_period("M").sort_values()
        holes = int((m.diff().dropna().map(lambda x: x.n) > 1).sum())
        if holes:
            gaps.setdefault(ds, []).append(f"{pf}/{w}:{holes}")
    out["series_with_month_gaps"] = {k: v[:6] for k, v in gaps.items()}
    out["extreme_abs_ret_gt_100pct"] = int((df["ret"].abs() > 1).sum())
    # 一致性核对：49 行业（与 ME 十分位）用 n_firms × avg_size 加权的收益 vs Mkt-RF + RF
    ff = df[df["dataset"] == "F-F_Research_Data_Factors"].pivot(index="date", columns="portfolio", values="ret")
    mkt = ff["Mkt-RF"] + ff["RF"]
    for ds, cols in (("49_Industry_Portfolios", None),
                     ("Portfolios_Formed_on_ME", [f"{x}-Dec" for x in range(2, 10)] + ["Lo 10", "Hi 10"])):
        g = df[(df["dataset"] == ds) & (df["weighting"] == "vw")].copy()
        if cols:
            g = g[g["portfolio"].isin(cols)]
        g["cap"] = g["n_firms"] * g["avg_size"]
        agg = g.groupby("date").apply(lambda x: np.average(x["ret"], weights=x["cap"]) if x["cap"].sum() > 0
                                      else np.nan, include_groups=False)
        d = (agg - mkt).dropna().abs()
        out[f"consistency_{ds}_vs_mkt"] = {
            "months": int(len(d)), "mean_abs_diff": round(float(d.mean()), 6),
            "median_abs_diff": round(float(d.median()), 6), "max_abs_diff": round(float(d.max()), 6),
            "max_month": str(d.idxmax().date()) if len(d) else None,
            "share_abs_diff_lt_0_5pct": round(float((d < 0.005).mean()), 4)}
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m factorlab.sources.kf", description="Ken French 组合库（等级 C）")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--refresh", action="store_true")
    f.add_argument("--names", default=None, help="逗号分隔的数据集名（默认全目录）")
    b = sub.add_parser("build")
    b.add_argument("--names", default=None)
    sub.add_parser("audit")
    sub.add_parser("catalog")
    a = ap.parse_args(argv)
    names = a.names.split(",") if getattr(a, "names", None) else None
    if a.cmd == "fetch":
        r = fetch_kf(names, refresh=a.refresh)
        return 1 if r["failed"] else 0
    if a.cmd == "build":
        print(build_kf(names))
    elif a.cmd == "audit":
        print(json.dumps(audit_kf(), ensure_ascii=False, indent=1, default=str))
    elif a.cmd == "catalog":
        for n, g in CATALOG.items():
            print(g, n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
