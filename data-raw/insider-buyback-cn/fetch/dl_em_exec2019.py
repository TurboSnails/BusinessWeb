import json, sys, os, hashlib, datetime, importlib.util
spec=importlib.util.spec_from_file_location("m", os.path.join(os.path.dirname(os.path.abspath(__file__)),"dl_em_lib.py"))
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
OUT=sys.argv[1]; job=dict(m.JOBS["em_exec_hold_details"]); job["filt"]="(CHANGE_DATE>='2019-01-01')(CHANGE_DATE<='2019-12-31')"
j,url=m.get(job,1,500); r=j["result"]; rows=list(r["data"])
for pg in range(2,r["pages"]+1): rows+=m.get(job,pg,500)[0]["result"]["data"]
assert len(rows)==r["count"]
body=json.dumps({"report":job["report"],"columns":job["cols"],"filter":job["filt"],"count":len(rows),"rows":rows},ensure_ascii=False)
open(os.path.join(OUT,"em_exec_hold_details.json"),"w").write(body)
log=dict(name="em_exec_hold_details(2019)",rows=len(rows),url=url,sha256=hashlib.sha256(body.encode()).hexdigest(),downloaded_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
json.dump(log,open(os.path.join(OUT,"_log_em_exec_hold_details.json"),"w"),ensure_ascii=False,indent=1); print(json.dumps(log,ensure_ascii=False))
