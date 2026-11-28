"""金十数据中心：中国 M2 同比（attr_id=59）的历次发布日与当时公布值。
只取公开接口，串行、每页间隔 3 秒，不带个人信息。输出 data-raw/erp-timing-cn/raw/jin10_m2_releases.json。
用法：research-py/.venv/bin/python -I docs/research/erp-timing-cn-2026-11-28/fetch_jin10.py <attr_id> <out_name>
"""
import json, sys, time, urllib.request, urllib.parse, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3]
attr = sys.argv[1] if len(sys.argv) > 1 else "59"
name = sys.argv[2] if len(sys.argv) > 2 else "jin10_m2_releases"
H = {"User-Agent": "Mozilla/5.0", "x-app-id": "rU6QIu7JHe2gOUeR", "x-version": "1.0.0",
     "origin": "https://datacenter.jin10.com", "referer": "https://datacenter.jin10.com/"}
rows, max_date, keys = [], "", None
for page in range(200):
    url = "https://datacenter-api.jin10.com/reports/list_v2?" + urllib.parse.urlencode(
        {"max_date": max_date, "category": "ec", "attr_id": attr, "_": str(int(time.time() * 1000))})
    req = urllib.request.Request(url, headers=H)
    body = json.load(urllib.request.urlopen(req, timeout=30))
    vals = body["data"]["values"]
    keys = body["data"]["keys"]
    new = [v for v in vals if not rows or v[0] < rows[-1][0]]
    if not new:
        break
    rows += new
    # 下一页：最早日期的前一天
    d = new[-1][0]
    import datetime as dt
    max_date = (dt.date.fromisoformat(d) - dt.timedelta(days=1)).isoformat()
    time.sleep(3)
out = ROOT / "data-raw/erp-timing-cn/raw" / f"{name}.json"
out.write_text(json.dumps({"url": "https://datacenter-api.jin10.com/reports/list_v2", "attr_id": attr,
                           "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "keys": keys, "values": rows},
                          ensure_ascii=False, indent=0))
print(name, len(rows), rows[-1] if rows else None, rows[0] if rows else None)
