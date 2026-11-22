# manager 独立实现：用于给各执行者提供复现锚点（只读，不要改）
import json,datetime,math
P=json.load(open('data-raw/portfolio-explore/prices-adjusted.json'))['series']
def run(stocks,tw,mode,band=None,start='2021-08-25',end='2026-11-20',cost=0.001):
    common=sorted(set.intersection(*[set(P[s]['dates']) for s in stocks]))
    dates=[d for d in common if start<=d<=end]
    px={s:dict(zip(P[s]['dates'],P[s]['close'])) for s in stocks}
    k=len(stocks); w=list(tw); eq=1.0; eqs=[1.0]; rets=[]; pend=None; trig=0; cst=0
    for i in range(1,len(dates)):
        r=[px[s][dates[i]]/px[s][dates[i-1]]-1 for s in stocks]
        eq*=1+sum(w[j]*r[j] for j in range(k)); v=[w[j]*(1+r[j]) for j in range(k)]; sv=sum(v); w=[x/sv for x in v]
        if pend==i:
            t=0.5*sum(abs(w[j]-tw[j]) for j in range(k)); eq*=1-t*cost; trig+=1; cst+=t*cost; w=list(tw); pend=None
        dec=False
        if mode=='band': dec=any(not(band[j][0]<w[j]<band[j][1]) for j in range(k))
        if dec and pend is None and i+1<len(dates): pend=i+1
        rets.append(eq/eqs[-1]-1); eqs.append(eq)
    n=len(rets); m=sum(rets)/n; var=sum((x-m)**2 for x in rets)/n
    yrs=(datetime.date.fromisoformat(dates[-1])-datetime.date.fromisoformat(dates[0])).days/365.25
    pk=1; mdd=0
    for e in eqs: pk=max(pk,e); mdd=min(mdd,e/pk-1)
    return dict(start=dates[0],end=dates[-1],final=round(eqs[-1],4),cagr=round(eqs[-1]**(1/yrs)-1,4),mdd=round(mdd,4),cer=round(252*(m-1.5*var),4),trades=trig,cost=round(cst,5))
if __name__=='__main__':
    ST=['AVGO','META','CB','SOFI','RKLB']; TW=[.25,.25,.25,.125,.125]; B=[(t*0.6,t*1.4) for t in TW]
    print('A1 用户方案 买入持有', run(ST,TW,'bh'))
    print('A2 用户方案 相对偏离40%', run(ST,TW,'band',B))
    S2=['AVGO','META','CB','TSLA','NVDA']; print('A3 长窗口 2016-01-04 起 买入持有', run(S2,TW,'bh',start='2016-01-04'))
    print('A4 长窗口 相对偏离40%', run(S2,TW,'band',[(t*0.6,t*1.4) for t in TW],start='2016-01-04'))
    print('A5 QQQ 买入持有', run(['QQQ'],[1.0],'bh'))
