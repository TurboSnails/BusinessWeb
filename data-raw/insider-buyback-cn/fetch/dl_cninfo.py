import json,sys,subprocess,time,urllib.parse,os,hashlib,datetime
import py_mini_racer
from akshare.datasets import get_ths_js
R=sys.argv[1]; os.makedirs(R,exist_ok=True)
js=py_mini_racer.MiniRacer(); js.eval(open(get_ths_js("cninfo.js"),encoding="utf-8").read())
URL="https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1030"
def post(params):
    for k in range(4):
        key=js.call("getResCode1"); u=URL+"?"+urllib.parse.urlencode(params)
        raw=subprocess.run(["curl","-sS","--max-time","180","-X","POST","-A","Mozilla/5.0","-H","Accept-EncKey: "+key,"-H","Referer: https://webapi.cninfo.com.cn/","-H","Origin: https://webapi.cninfo.com.cn","-H","Content-Length: 0",u],capture_output=True).stdout
        time.sleep(1.2)
        try:
            j=json.loads(raw.decode("utf-8"))
            if j.get("resultcode")==200: return raw,j,u
        except Exception: pass
        time.sleep(5*(k+1))
    raise RuntimeError(u)
qs=[]
for y in range(2005,2024):
    for a,b in [("01-01","03-31"),("04-01","06-30"),("07-01","09-30"),("10-01","12-31")]:
        s,e=f"{y}-{a}",f"{y}-{b}"
        if s>"2023-10-31": continue
        qs.append((s,min(e,"2023-10-31")))
log=[]
for vt in ["B","S"]:
    for s,e in qs:
        fn=os.path.join(R,f"{vt}_{s}_{e}.json")
        if os.path.exists(fn): continue
        raw,j,u=post({"sdate":s,"edate":e,"varytype":vt})
        open(fn,"wb").write(raw)
        log.append(dict(file=os.path.basename(fn),url=u,n=len(j.get("records") or []),total=j.get("total"),sha256=hashlib.sha256(raw).hexdigest(),at=datetime.datetime.now(datetime.timezone.utc).isoformat()))
        print(log[-1]["file"],log[-1]["n"],flush=True)
json.dump(log,open(os.path.join(R,"_log.json"),"w"),indent=1)
