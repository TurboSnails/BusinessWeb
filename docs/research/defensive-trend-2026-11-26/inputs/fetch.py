"""锁箱 B-2（海外含息多资产）原始数据下载。只下载、存档、记 sha256，不做任何计算。

用法（在 research-py/ 下）：uv run python -I ../docs/research/defensive-trend-2026-11-26/inputs/fetch.py

事先写定（下载前）：
- 候选国家（14）：日本 JP、德国 DE、英国 GB、法国 FR、加拿大 CA、澳大利亚 AU、瑞士 CH、荷兰 NL、
  瑞典 SE、意大利 IT、西班牙 ES、比利时 BE、丹麦 DK、挪威 NO（挪威不在优先名单里，KF 有 1975 起数据，作候选）。
- 股票：Ken French「International Research Returns」F-F_International_Countries.zip（含息），只存用到的国家 .Dat。
- 10 年期国债收益率：FRED OECD IRLTLT01{CC}M156N。
- 短期利率逐月优先顺序（每个月取第一个有值的序列，不做水平调整）：
    1. IR3TIB01{CC}M156N（3 个月银行间）
    2. IR3TBB01{CC}M156N（3 个月国库券）
    3. IR3TCD01{CC}M156N（3 个月存单）
    4. IRSTCI01{CC}M156N（隔夜/拆借）
- 汇率（月末）：
    非欧元国家：FRED H.10 日度午间买入汇率，取每月最后一个有值的交易日。
    欧元区国家：1999-01 起 DEXUSEU 月末值；1998-12 以前 FRED 上 H.10 旧货币日度序列（DEXGEUS、DEXFRUS 等）
    已下架（第一次运行返回 404），改用 OECD 期末即期汇率 CCUSSP01{CC}M650N（OECD 已把旧货币按固定兑换率折成欧元）。
    所有国家都下载 CCUSSP01，用来核对它是否为月末值（与 H.10 月末比）；德国另下载德国央行法兰克福 USD/DEM
    日度定价作第二来源。
- 第二轮追加（看过覆盖后）：IMF IFS 政府债券收益率 INTGSBITM193N、INTGSBESM193N，用于意大利、西班牙 10 年期序列
  起点之前的向前延伸（单独标记，是否纳入主检验由预注册决定）。
- 第二来源核对：德国央行 Svensson 期限结构 10 年期（月度、日度）与公共债券 9–10 年剩余期限月均收益率；
  日本财务省 JGB 日度收益率（取 10 年）。
FRED 用 curl --http1.1、串行、不带自定义 UA。
"""

from __future__ import annotations

import hashlib
import io
import json
import subprocess
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"

# 代码: (KF 文件名, H.10 序列或 None, H.10 报价方向, 欧元固定兑换率或 None)
# 报价方向 "lcu_per_usd"：每美元兑本币；"usd_per_lcu"：每单位本币兑美元
COUNTRIES = {
    "JP": ("Japan.Dat", "DEXJPUS", "lcu_per_usd", None),
    "DE": ("Germany.Dat", None, None, 1.95583),
    "GB": ("UK.Dat", "DEXUSUK", "usd_per_lcu", None),
    "FR": ("France.Dat", None, None, 6.55957),
    "CA": ("Canada.Dat", "DEXCAUS", "lcu_per_usd", None),
    "AU": ("Austrlia.Dat", "DEXUSAL", "usd_per_lcu", None),
    "CH": ("Swtzrlnd.Dat", "DEXSZUS", "lcu_per_usd", None),
    "NL": ("Nethrlnd.Dat", None, None, 2.20371),
    "SE": ("Sweden.Dat", "DEXSDUS", "lcu_per_usd", None),
    "IT": ("Italy.Dat", None, None, 1936.27),
    "ES": ("Spain.Dat", None, None, 166.386),
    "BE": ("Belgium.Dat", None, None, 40.3399),
    "DK": ("Denmark.Dat", "DEXDNUS", "lcu_per_usd", None),
    "NO": ("Norway.Dat", "DEXNOUS", "lcu_per_usd", None),
}
SHORT_ORDER = ["IR3TIB01", "IR3TBB01", "IR3TCD01", "IRSTCI01"]
# 第二轮追加（看过第一轮覆盖、未看任何收益后）：OECD 10 年期序列起点晚于 1980 的国家里，FRED 上有 IMF IFS
# 政府债券收益率、且能往前延伸的只有意大利、西班牙；只作向前延伸并加来源标记（日本 INTGSB 1999 年才开始，无用）。
BOND_EXT = ["INTGSBITM193N", "INTGSBESM193N"]
KF_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_International_Countries.zip"
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"
BBK_URL = "https://api.statistiken.bundesbank.de/rest/download/{}?format=csv&lang=en"
BBK_SERIES = {
    "bbk_zst10_monthly.csv": "BBSIS/M.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A",
    "bbk_zst10_daily.csv": "BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A",
    "bbk_umr_s13_r0910_monthly_avg.csv": "BBSIS/M.I.UMR.RD.EUR.S13.B.A.R0910.R.A.A._Z._Z.A",
    "bbk_usd_dem_daily.csv": "BBEX3/D.USD.DEM.AA.AC.000",
}
MOF_URL = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv"


def curl(url: str) -> bytes:
    r = subprocess.run(["curl", "-sL", "--http1.1", "--fail", "--max-time", "120", url], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"curl {r.returncode}: {url}")
    return r.stdout


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict] = {}

    def save(name: str, data: bytes, url: str, note: str = "") -> None:
        (RAW / name).write_bytes(data)
        manifest[name] = {"url": url, "sha256": sha(data), "bytes": len(data), "downloadedAt": now(), "note": note}
        print(f"  {name} {len(data)} B")

    # Ken French（zip 不入库，只存用到的 .Dat）
    z = curl(KF_URL)
    manifest["_F-F_International_Countries.zip"] = {"url": KF_URL, "sha256": sha(z), "bytes": len(z),
                                                    "downloadedAt": now(), "note": "zip 不入库，只存用到的 .Dat"}
    with zipfile.ZipFile(io.BytesIO(z)) as zf:
        for fn, *_r in COUNTRIES.values():
            save(f"kf_{fn}", zf.read(fn), KF_URL + f"#{fn}", "zip 内原文件，CRLF")

    # FRED
    ids: list[str] = []
    for cc, (_fn, h10, _q, _eur) in COUNTRIES.items():
        ids += [f"IRLTLT01{cc}M156N"] + [f"{p}{cc}M156N" for p in SHORT_ORDER] + [f"CCUSSP01{cc}M650N"]
        if h10:
            ids.append(h10)
    ids.append("DEXUSEU")
    ids += BOND_EXT
    missing = []
    for sid in ids:
        url = FRED_URL.format(sid)
        try:
            data = curl(url)
        except RuntimeError:
            data = b""
        head = data[:40].decode("utf-8", "replace")
        if head.startswith("observation_date") or head.startswith("DATE"):
            save(f"fred_{sid}.csv", data, url)
        else:
            missing.append(sid)
            print(f"  {sid} 不存在")
        time.sleep(1)

    # 德国央行、日本财务省（第二来源）
    for name, key in BBK_SERIES.items():
        url = BBK_URL.format(key)
        save(name, curl(url), url)
    save("mof_jgbcme_all.csv", curl(MOF_URL), MOF_URL)

    manifest["_missing_fred"] = {"ids": missing, "note": "fredgraph 返回 404/非 CSV，视为 FRED 上没有该序列"}
    (RAW / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("FRED 不存在的序列：", missing)


if __name__ == "__main__":
    sys.exit(main())
