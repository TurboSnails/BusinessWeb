import json, sys, time, urllib.parse, subprocess
U="https://datacenter-web.eastmoney.com/api/data/v1/get"
def get(report, filt="", sort="", st="1", ps=3, page=1, cols="ALL"):
    p={"reportName":report,"columns":cols,"filter":filt,"pageSize":str(ps),"pageNumber":str(page),"sortColumns":sort,"sortTypes":st,"source":"WEB","client":"WEB"}
    url=U+"?"+urllib.parse.urlencode(p)
    out=subprocess.run(["curl","-sS","-A","Mozilla/5.0","--max-time","30",url],capture_output=True,text=True).stdout
    time.sleep(1.1)
    return json.loads(out)
if __name__=="__main__":
    rep, sort, st = sys.argv[1], sys.argv[2], sys.argv[3]
    filt = sys.argv[4] if len(sys.argv)>4 else ""
    j=get(rep, filt, sort, st)
    r=j.get("result")
    if not r: print(json.dumps(j,ensure_ascii=False)[:500]); sys.exit()
    print("count",r.get("count"),"pages",r.get("pages"))
    for d in r["data"]: print(json.dumps(d,ensure_ascii=False))
