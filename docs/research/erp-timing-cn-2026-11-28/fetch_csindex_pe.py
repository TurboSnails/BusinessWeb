"""中证官网 index-perf：只保留 tradeDate 与 peg（滚动市盈率），不保存价格，避免本阶段接触收益。
按 4 年一段串行取，间隔 5 秒；剔除接口在查询起始日补的那一行（tradeDate == startDate 且非交易日复制）。
用法：research-py/.venv/bin/python -I fetch_csindex_pe.py 000300 000985
"""
import json, sys, time, urllib.request, pathlib, datetime as dt
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "data-raw/erp-timing-cn/raw"
URL = "https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode={c}&startDate={s}&endDate={e}"
for code in sys.argv[1:]:
    rows = {}
    for y0 in range(2005, 2027, 4):
        s, e = f"{y0}0101", f"{min(y0 + 3, 2026)}1231"
        req = urllib.request.Request(URL.format(c=code, s=s, e=e), headers={"User-Agent": "Mozilla/5.0"})
        body = json.load(urllib.request.urlopen(req, timeout=60))
        assert str(body["code"]) == "200", body
        data = body["data"]
        for i, r in enumerate(data):
            d = r["tradeDate"]
            if i == 0 and d == s:  # 起始日补行
                continue
            wd = dt.date(int(d[:4]), int(d[4:6]), int(d[6:])).weekday()
            if wd >= 5:
                continue
            rows[d] = {"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "peg": r.get("peg"),
                       "consNumber": r.get("consNumber")}
        print(code, s, e, len(data), flush=True)
        time.sleep(5)
    out = sorted(rows.values(), key=lambda x: x["date"])
    (OUT / f"csindex_pe_{code}.json").write_text(json.dumps({
        "url": URL, "code": code, "fields": "tradeDate, peg（滚动市盈率）；价格字段未保存",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "rows": out}, ensure_ascii=False))
    pe = [r for r in out if r["peg"] not in (None, 0)]
    print(code, "rows", len(out), "with peg", len(pe), pe[0]["date"] if pe else None, out[-1]["date"])
