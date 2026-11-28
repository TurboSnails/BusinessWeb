"""下载东方财富数据中心四张表（截至 2023-10-31），剔除事后收益列。只写 raw/。"""
import json, sys, time, urllib.parse, subprocess, hashlib, os, datetime
U="https://datacenter-web.eastmoney.com/api/data/v1/get"
OUT=sys.argv[1]
os.makedirs(OUT, exist_ok=True)
JOBS={
 "em_exec_hold_details": dict(report="RPT_EXECUTIVE_HOLD_DETAILS",
   cols="SECURITY_CODE,SECURITY_NAME,CHANGE_DATE,PERSON_NAME,CHANGE_SHARES,AVERAGE_PRICE,CHANGE_AMOUNT,CHANGE_REASON,CHANGE_RATIO,CHANGE_AFTER_HOLDNUM,HOLD_TYPE,DSE_PERSON_NAME,POSITION_NAME,PERSON_DSE_RELATION,BEGIN_HOLD_NUM,END_HOLD_NUM,GGEID",
   filt="(CHANGE_DATE<='2023-10-31')", sort="CHANGE_DATE,GGEID", st="1,1"),
 "em_holder_increase": dict(report="RPT_SHARE_HOLDER_INCREASE",
   cols="SECURITY_CODE,SECURITY_NAME_ABBR,HOLDER_NAME,DIRECTION,CHANGE_NUM,CHANGE_NUM_SYMBOL,CHANGE_RATE,CHANGE_FREE_RATIO,AFTER_HOLDER_NUM,AFTER_CHANGE_RATE,HOLD_RATIO,FREE_SHARES,FREE_SHARES_RATIO,TRADE_AVERAGE_PRICE,START_DATE,END_DATE,TRADE_DATE,NOTICE_DATE,MARKET,EITIME",
   filt="(NOTICE_DATE<='2023-10-31')", sort="NOTICE_DATE,SECURITY_CODE,HOLDER_NAME", st="1,1,1"),
 "em_repurchase": dict(report="RPTA_WEB_GETHGLIST_NEW",
   cols="DIM_SCODE,SECURITYSHORTNAME,SHARETYPE,REPURCODE,DIM_DATE,DIM_TRADEDATE,REPURPROGRESS,REPUROBJECTIVE,REPURPRICECAP,REPURPRICELOWER,REPURNUMCAP,REPURNUMLOWER,REPURAMOUNTLIMIT,REPURAMOUNTLOWER,ZSZXX,ZSZSX,LTSZXX,LTSZSX,REPURSTARTDATE,REPURENDDATE,SHMRSLTNOTICEDATE,LBRQ,FINISHDATE,REPURADVANCEDATE,NOTICEDATE,DIM_DATE3,REPURNUM,REPURAMOUNT,REPURPRICECAP1,REPURPRICELOWER1,ZJSZBL,ZJLTBL,AGSZBHXS,ZSZ,CPRICE,UPDATEDATE,UPD,MARKET,REMARK",
   filt="(DIM_DATE<='2023-10-31')", sort="DIM_DATE,DIM_SCODE,REPURCODE", st="1,1,1"),
 "em_repurchase_all": dict(report="RPTA_WEB_GETHGLIST_NEW",
   cols="DIM_SCODE,SECURITYSHORTNAME,REPURCODE,DIM_DATE,DIM_TRADEDATE,REPURPROGRESS,UPDATEDATE,REMARK",
   filt="", sort="DIM_DATE,DIM_SCODE,REPURCODE", st="1,1,1"),
 "em_lift_stage": dict(report="RPT_LIFT_STAGE",
   cols="SECURITY_CODE,SECURITY_NAME_ABBR,FREE_DATE,BATCH_HOLDER_NUM,CURRENT_FREE_SHARES,ABLE_FREE_SHARES,LIFT_MARKET_CAP,FREE_SHARES_TYPE,FREE_RATIO,TOTAL_RATIO,FREE_SHARES,NON_FREE_SHARES,MARKET_TYPE,LISTING_STATE",
   filt="(FREE_DATE<='2023-10-31')", sort="FREE_DATE,SECURITY_CODE", st="1,1"),
}
def get(job, page, ps):
    p={"reportName":job["report"],"columns":job["cols"],"filter":job["filt"],"pageSize":str(ps),"pageNumber":str(page),
       "sortColumns":job["sort"],"sortTypes":job["st"],"source":"WEB","client":"WEB"}
    url=U+"?"+urllib.parse.urlencode(p)
    for k in range(4):
        out=subprocess.run(["curl","-sS","-A","Mozilla/5.0","--max-time","60",url],capture_output=True,text=True).stdout
        time.sleep(1.2)
        try:
            j=json.loads(out); 
            if j.get("result") is not None or j.get("code")==9201: return j,url
        except Exception: pass
        time.sleep(3*(k+1))
    raise RuntimeError(url)
names = sys.argv[2:] or list(JOBS)
log=[]
for name in names:
    job=JOBS[name]; ps=5000
    j,url=get(job,1,ps); r=j["result"]
    rows=list(r["data"]); pages=r["pages"]
    for pg in range(2,pages+1):
        jj,_=get(job,pg,ps); rows+=jj["result"]["data"]
    path=os.path.join(OUT,name+".json")
    body=json.dumps({"report":job["report"],"columns":job["cols"],"filter":job["filt"],"count":r["count"],"rows":rows},ensure_ascii=False)
    open(path,"w").write(body)
    h=hashlib.sha256(body.encode()).hexdigest()
    log.append(dict(name=name,report=job["report"],count=r["count"],rows=len(rows),pages=pages,first_url=url,
        sha256=h,downloaded_at=datetime.datetime.now(datetime.timezone.utc).isoformat()))
    print(json.dumps(log[-1],ensure_ascii=False),flush=True)
json.dump(log,open(os.path.join(OUT,"_log_em_%s.json"%"_".join(names) if sys.argv[2:] else "_log_em.json"),"w"),ensure_ascii=False,indent=1)
