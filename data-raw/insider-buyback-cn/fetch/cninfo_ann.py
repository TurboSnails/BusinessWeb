import json,sys,subprocess,time,os,hashlib,datetime
R=sys.argv[1]; os.makedirs(R,exist_ok=True)
out={}
for kw in ["增持","回购","减持","解除限售"]:
  for y in range(2005,2024):
    e=f"{y}-12-31" if y<2023 else "2023-10-31"
    data=["pageNum=1","pageSize=30","column=szse","tabName=fulltext","plate=","stock=",f"searchkey={kw}","secid=","category=","trade=",f"seDate={y}-01-01~{e}","sortName=","sortType=","isHLtitle=true"]
    cmd=["curl","-sS","--max-time","60","-A","Mozilla/5.0","-X","POST","http://www.cninfo.com.cn/new/hisAnnouncement/query"]
    for d in data: cmd+=["--data-urlencode",d]
    raw=subprocess.run(cmd,capture_output=True).stdout; time.sleep(1.5)
    try: j=json.loads(raw.decode()); n=j.get("totalAnnouncement")
    except Exception: n=None
    fn=os.path.join(R,f"ann_{kw}_{y}.json"); open(fn,"wb").write(raw)
    out[f"{kw}|{y}"]=dict(total=n,sha256=hashlib.sha256(raw).hexdigest())
    print(kw,y,n,flush=True)
json.dump(dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),counts=out),open(os.path.join(R,"_counts.json"),"w"),ensure_ascii=False,indent=1)
