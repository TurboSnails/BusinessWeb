"""用 Crossref 公开接口核对 DOI 元数据（串行，间隔 1.5 秒，通用 User-Agent，不带个人信息）。
输出 data-raw/erp-timing-cn/raw/crossref_check.json。"""
import json, sys, time, urllib.request, urllib.parse, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3]
DOIS = sys.argv[1:]
H = {"User-Agent": "research-script/1.0 (literature metadata check)"}
out = []
for d in DOIS:
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request(
            "https://api.crossref.org/works/" + urllib.parse.quote(d), headers=H), timeout=30))["message"]
        rec = {"doi": d, "ok": True, "title": (r.get("title") or [""])[0],
               "journal": (r.get("container-title") or [""])[0],
               "year": (r.get("issued", {}).get("date-parts") or [[None]])[0][0],
               "volume": r.get("volume"), "issue": r.get("issue"), "page": r.get("page"),
               "authors": [a.get("family", "") for a in r.get("author", [])],
               "abstract": (r.get("abstract") or "")[:600]}
    except Exception as e:
        rec = {"doi": d, "ok": False, "error": str(e)}
    out.append(rec)
    print(json.dumps({k: rec.get(k) for k in ("doi", "ok", "authors", "year", "title", "journal", "volume", "issue", "page")}, ensure_ascii=False), flush=True)
    time.sleep(4)
p = ROOT / "data-raw/erp-timing-cn/raw/crossref_check.json"
old = json.loads(p.read_text()) if p.exists() else []
p.write_text(json.dumps(old + out, ensure_ascii=False, indent=1))
