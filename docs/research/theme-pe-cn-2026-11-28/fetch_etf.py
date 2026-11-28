#!/usr/bin/env python3
"""L-052 E4：各申万一级行业「有场内 ETF 可买」的最早年份（CLARIFY-2 第 8 条）。

来源：东方财富公开基金列表 fundcode_search.js（名称、类型）+ 东方财富移动端基金详情接口
FundMNDetailInformation（ESTABDATE 成立日、INDEXNAME 跟踪指数；网页档案页 jbgk 在抓取中超时，改用此接口）。
筛选：名称含 "ETF"、不含「联接」、类型 = 指数型-股票（排除海外、固收、FOF、货币）。
映射：按申万一级关键词人工表（只认名称明确对应该一级行业或其明确子行业的；宽基、风格、红利、
跨行业主题如「新能源车」「人工智能」「消费」不映射）。
局限：列表只含现存基金（已清盘 ETF 不在内，最早年份可能偏晚）；成立日早于上市日数周。

用法：cd research-py && uv run python ../docs/research/theme-pe-cn-2026-11-28/fetch_etf.py
输出：inputs/etf_raw.json（筛后 ETF 与成立日，原始抓取）、inputs/etf_map.json（关键词表与各行业结果）
"""
from __future__ import annotations

import json
import re
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
INP = HERE / "inputs"
UA = {"User-Agent": "Mozilla/5.0 (research script)"}

# 申万 2021 一级 → (一级行业词, 明确子行业词)。排除词对所有行业生效。
KEYWORDS: dict[str, tuple[list[str], list[str]]] = {
    "农林牧渔": (["农林牧渔", "农业"], ["养殖", "畜牧", "农牧", "粮食"]),
    "基础化工": (["化工"], []),
    "钢铁": (["钢铁"], []),
    "有色金属": (["有色"], ["稀土", "稀有金属", "黄金股", "工业金属"]),
    "电子": (["电子"], ["半导体", "芯片", "集成电路"]),
    "家用电器": (["家电", "家用电器"], []),
    "食品饮料": (["食品饮料", "食品"], ["酒"]),
    "纺织服饰": (["纺织", "服装"], []),
    "轻工制造": (["轻工"], ["造纸"]),
    "医药生物": (["医药", "生物"], ["医疗", "创新药", "中药", "疫苗"]),
    "公用事业": (["公用事业"], ["电力ETF", "绿电"]),
    "交通运输": (["交通运输"], ["物流", "航运"]),
    "房地产": (["地产"], []),
    "商贸零售": (["商贸", "零售"], []),
    "社会服务": (["社会服务"], ["旅游", "酒店"]),
    "综合": ([], []),
    "建筑材料": (["建材", "建筑材料"], ["水泥"]),
    "建筑装饰": (["建筑"], ["基建"]),
    "电力设备": (["电力设备"], ["光伏", "电池", "储能", "电网设备"]),
    "国防军工": (["军工", "国防"], []),
    "计算机": (["计算机"], ["软件", "信创", "云计算"]),
    "传媒": (["传媒"], ["游戏", "动漫", "影视"]),
    "通信": (["通信"], ["5G"]),
    "银行": (["银行"], []),
    "非银金融": (["非银"], ["证券", "券商", "保险"]),
    "汽车": (["汽车"], ["汽车零部件"]),
    "机械设备": (["机械"], ["机器人", "工业母机"]),
    "煤炭": (["煤炭"], []),
    "石油石化": (["石油", "石化", "油气"], []),
    "环保": (["环保"], []),
    "美容护理": (["美容"], []),
}
# 「建筑」不得命中「建筑材料」；宽口径「金融」「金融地产」、跨行业「智能汽车 / 新能源车」不映射
EXCLUDE_ANY = ["港股", "恒生", "香港", "沪港深", "中概", "H股", "纳斯达克", "标普", "日经", "德国", "法国",
               "沙特", "东南亚", "亚太", "全球", "海外", "美国"]
SPECIAL_EXCLUDE = {"建筑装饰": ["建筑材料", "建材"], "非银金融": ["金融科技", "金融地产"],
                   "房地产": ["金融地产"], "医药生物": [], "电子": ["消费电子"],
                   "汽车": ["智能汽车", "新能源汽车", "新能源车", "智能电动"]}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8-sig", errors="replace")


def classify(name: str) -> list[tuple[str, str]]:
    hits = []
    if any(x in name for x in EXCLUDE_ANY):
        return hits
    for ind, (direct, sub) in KEYWORDS.items():
        if any(x in name for x in SPECIAL_EXCLUDE.get(ind, [])):
            continue
        if any(k in name for k in direct):
            hits.append((ind, "direct"))
        elif any(k in name for k in sub):
            hits.append((ind, "sub"))
    return hits


def main() -> None:
    INP.mkdir(exist_ok=True)
    raw_p = INP / "etf_raw.json"
    cache = json.loads(raw_p.read_text()) if raw_p.exists() else {}
    s = fetch("https://fund.eastmoney.com/js/fundcode_search.js")
    arr = json.loads(s[s.index("["): s.rindex("]") + 1])
    etf = [a for a in arr if "ETF" in a[2] and "联接" not in a[2] and a[3] == "指数型-股票"]
    print("ETF(指数型-股票)", len(etf))
    cands = [(a[0], a[2], classify(a[2])) for a in etf]
    cands = [c for c in cands if c[2]]
    print("关键词命中", len(cands))
    from concurrent.futures import ThreadPoolExecutor

    def one(code):
        try:
            d = json.loads(fetch("https://fundmobapi.eastmoney.com/FundMNewApi/FundMNDetailInformation?FCODE="
                                 f"{code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0"))["Datas"] or {}
            inc = d.get("ESTABDATE") if d.get("ESTABDATE") not in (None, "--", "") else None
            return code, inc, d.get("INDEXNAME")
        except Exception as e:  # noqa: BLE001
            print("fail", code, e, flush=True)
            return code, None, None

    todo = [(c, n) for c, n, _ in cands if not (c in cache and cache[c].get("inception"))]
    names = dict(todo)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, (code, inc, idx) in enumerate(ex.map(one, [c for c, _ in todo]), 1):
            cache[code] = {"name": names[code], "inception": inc, "index": idx}
            if i % 25 == 0:
                raw_p.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n")
                print("…", i, "/", len(todo), flush=True)
    raw_p.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n")

    res = {}
    for ind in KEYWORDS:
        rows = []
        for code, name, hits in cands:
            for h_ind, kind in hits:
                if h_ind == ind and cache.get(code, {}).get("inception"):
                    rows.append({"code": code, "name": name, "kind": kind, "inception": cache[code]["inception"],
                                 "index": cache[code].get("index")})
        rows.sort(key=lambda r: r["inception"])
        d = [r for r in rows if r["kind"] == "direct"]
        res[ind] = {
            "earliest_direct_year": int(d[0]["inception"][:4]) if d else None,
            "earliest_direct": d[0] if d else None,
            "earliest_any_year": int(rows[0]["inception"][:4]) if rows else None,
            "earliest_any": rows[0] if rows else None,
            "n_etf": len(rows),
        }
    out = {"source": "eastmoney fundcode_search.js + fundmobapi FundMNDetailInformation (ESTABDATE, INDEXNAME)",
           "fetched": time.strftime("%Y-%m-%d"),
           "filter": "名称含ETF、非联接、类型=指数型-股票、排除跨境关键词",
           "keywords": {k: {"direct": v[0], "sub": v[1]} for k, v in KEYWORDS.items()},
           "exclude_any": EXCLUDE_ANY, "special_exclude": SPECIAL_EXCLUDE,
           "limitations": ["只含现存基金（已清盘 ETF 不在列表，最早年份可能偏晚）", "成立日早于上市日数周",
                           "关键词人工映射，跨行业主题不计入"],
           "by_industry": res}
    (INP / "etf_map.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    for k, v in res.items():
        print(k, v["earliest_direct_year"], v["earliest_any_year"], v["n_etf"],
              (v["earliest_any"] or {}).get("name"))


if __name__ == "__main__":
    main()
