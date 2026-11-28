import json,sys,subprocess,time,urllib.parse,datetime as dt,statistics as st,os
R=sys.argv[1]
for a,b in [("2019-03-01","2019-03-31"),("2023-10-01","2023-10-31"),("1990-01-01","2023-10-31")]:
    p={"isPagination":"true","pageHelp.pageSize":"100","pageHelp.pageNo":"1","pageHelp.beginPage":"1","pageHelp.cacheSize":"1","pageHelp.endPage":"1",
       "sqlId":"COMMON_SSE_XXPL_CXJL_SSGSGFBDQK_S","COMPANY_CODE":"","NAME":"","BEGIN_DATE":a,"END_DATE":b,"BOARDTYPE":""}
    url="https://query.sse.com.cn/commonQuery.do?"+urllib.parse.urlencode(p)
    out=subprocess.run(["curl","-sS","--http1.1","--max-time","40","-A","Mozilla/5.0","-H","Referer: https://www.sse.com.cn/",url],capture_output=True,text=True).stdout
    time.sleep(2)
    fn=os.path.join(R,f"sse_ssgsgfbdqk_{a}_{b}_p1.json"); open(fn,"w").write(out)
    j=json.loads(out); ph=j['pageHelp']; print(a,b,'total',ph['total'],'pages',ph['pageCount'])
    lags=sorted((dt.date.fromisoformat(r['FORM_DATE'])-dt.date.fromisoformat(r['CHANGE_DATE'])).days for r in j['result'] if r.get('FORM_DATE') and r.get('CHANGE_DATE'))
    if lags: print(' lag days n',len(lags),'min',lags[0],'med',st.median(lags),'p90',lags[int(.9*len(lags))-1],'max',lags[-1])
    print(' reasons',sorted(set(r['CHANGE_REASON'] for r in j['result'])))
