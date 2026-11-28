import json,sys,subprocess,time,urllib.parse,os,hashlib
import py_mini_racer
from akshare.datasets import get_ths_js
R=sys.argv[1]
js=py_mini_racer.MiniRacer(); js.eval(open(get_ths_js("cninfo.js"),encoding="utf-8").read())
def post(url,params):
    key=js.call("getResCode1")
    u=url+"?"+urllib.parse.urlencode(params)
    out=subprocess.run(["curl","-sS","--max-time","120","-X","POST","-A","Mozilla/5.0","-H","Accept-EncKey: "+key,"-H","Referer: https://webapi.cninfo.com.cn/","-H","Origin: https://webapi.cninfo.com.cn","-H","Content-Length: 0",u],capture_output=True).stdout.decode("utf-8","replace")
    time.sleep(1.2); return out,u
for vt in ["B","S"]:
  for a,b in [("2015-07-01","2015-07-31"),("2023-10-01","2023-10-31")]:
    out,u=post("https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1030",{"sdate":a,"edate":b,"varytype":vt})
    try: j=json.loads(out)
    except Exception: print(vt,a,b,"bad",out[:200]); continue
    recs=j.get("records") or []
    fn=os.path.join(R,f"cninfo_p_sysapi1030_{vt}_{a}_{b}.json"); open(fn,"w").write(out)
    print(vt,a,b,"resultcode",j.get("resultcode"),"n",len(recs),"total",j.get("total"), "sha",hashlib.sha256(out.encode()).hexdigest()[:12])
    if recs:
        print(" keys",list(recs[0].keys())); print(" ",{k:v for k,v in recs[0].items() if k not in("F002V","F003V","F014V")})
        ds=sorted(r.get("DECLAREDATE") or "" for r in recs); print(" declare range",ds[0],ds[-1])
