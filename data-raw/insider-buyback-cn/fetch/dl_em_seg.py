"""按年份分段下载（避免深分页），合并为一个文件。复用 dl_em.JOBS 的列定义（不含事后收益列）。"""
import json, sys, os, hashlib, datetime, importlib.util
spec=importlib.util.spec_from_file_location("dl_em", os.path.join(os.path.dirname(os.path.abspath(__file__)),"dl_em_lib.py"))
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
OUT=sys.argv[1]; name=sys.argv[2]; datecol=sys.argv[3]; y0,y1=int(sys.argv[4]),int(sys.argv[5])
job=dict(m.JOBS[name]); rows=[]; urls=[]; segs=[]
segs.append((None,f"{y0}-01-01"))
for y in range(y0,y1+1):
    segs.append((f"{y}-01-01", f"{y+1}-01-01" if y<y1 else None))
for a,b in segs:
    f="(%s<='2023-10-31')"%datecol
    if a: f+="(%s>='%s')"%(datecol,a)
    if b: f+="(%s<'%s')"%(datecol,b)
    job["filt"]=f
    j,url=m.get(job,1,500); r=j.get("result")
    if not r: print(a,b,0,flush=True); continue
    got=list(r["data"]); 
    for pg in range(2,r["pages"]+1):
        jj,_=m.get(job,pg,500); got+=jj["result"]["data"]
    assert len(got)==r["count"],(a,b,len(got),r["count"])
    rows+=got; urls.append(url); print(a,b,r["count"],flush=True)
body=json.dumps({"report":job["report"],"columns":job["cols"],"segment_filter":"(%s 按年分段, <= 2023-10-31)"%datecol,"count":len(rows),"rows":rows},ensure_ascii=False)
open(os.path.join(OUT,name+".json"),"w").write(body)
log=dict(name=name,report=job["report"],rows=len(rows),segments=len(segs),example_url=urls[-1] if urls else None,sha256=hashlib.sha256(body.encode()).hexdigest(),downloaded_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
json.dump(log,open(os.path.join(OUT,"_log_"+name+".json"),"w"),ensure_ascii=False,indent=1); print(json.dumps(log,ensure_ascii=False))
