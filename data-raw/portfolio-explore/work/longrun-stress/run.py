import csv,json,datetime,itertools,math,statistics,time
from pathlib import Path
ROOT=Path('data-raw/portfolio-explore/longrun'); OUT=Path('data-raw/portfolio-explore/work/longrun-stress')

def load():
    lines=(ROOT/'49_Industry_Portfolios_Daily.csv').read_text(encoding='latin-1').splitlines(); data={}
    for sec,kw in [('VW','Average Value Weighted Returns -- Daily'),('EW','Average Equal Weighted Returns -- Daily')]:
        ix=next(i for i,x in enumerate(lines) if kw in x); hdr=[x.strip() for x in lines[ix+1].split(',')]; i=ix+2
        while i<len(lines) and lines[i].strip() and lines[i].strip()[0].isdigit():
            p=[x.strip() for x in lines[i].split(',')]; ds=f'{p[0][:4]}-{p[0][4:6]}-{p[0][6:]}'
            for h,v in zip(hdr[1:],p[1:]):
                z=float(v); data.setdefault(h+'_'+sec,{})[ds]=None if z<=-99 else z/100
            i+=1
    return data
R=load(); n=json.loads((ROOT/'NASDAQ100.json').read_text())['history']; N={d:float(v) for d,v in n}
dates=sorted(d for d in N if '1986-01-02'<=d<='2026-09-30' and all(R[a].get(d) is not None for a in R.keys() if a in []))
G=['Softw_VW','Hardw_VW','Chips_VW']; H=['Softw_EW','Chips_EW','Hardw_EW']; S=['Insur_VW','Food_VW','Hshld_VW','Soda_VW','Util_VW','Drugs_VW']
assets=G+H+S; dates=sorted(d for d in N if '1986-01-02'<=d<='2026-09-30' and all(R[a].get(d) is not None for a in assets))
# French source must have every series; use common calendar across all mapped legs.
ret={a:[R[a][d] for d in dates] for a in assets}; ndx=[N[d] for d in dates]
combos=[]
for gs in itertools.combinations(G,2):
 for hs in itertools.combinations(H,2):
  for s in S:
   aa=list(gs)+list(hs)+[s]; tw=[.25,.25,.125,.125,.25]; combos.append((aa,tw,'+'.join(aa)))

def run(aa,tw,mode):
    ids=[assets.index(a) for a in aa]; rs=[[ret[a][i] for a in aa] for i in range(len(dates))]; w=tw[:]; eq=1.; eqs=[1.]; trades=0; cost_sum=0.; pend=None; stress=False; peak=ndx[0]; levels=set(); base=0.; sold=0.; entry_i=None; episodes=[]; ev=None; entry_asset=0.
    for i in range(1,len(dates)):
        d=dates[i]; eq*=1+sum(w[j]*rs[i][j] for j in range(len(aa))); v=[w[j]*(1+rs[i][j]) for j in range(len(aa))]; z=sum(v); w=[x/z for x in v]
        if pend:
            old=w[:]
            if pend[0] in ('reb','yr','rec','timeout'): w=tw[:]
            else:
                amt=min(pend[1]/eq,w[-1]); cand=range(len(w)-1); j=min(cand,key=lambda q:w[q]/tw[q]); w[-1]-=amt; w[j]+=amt; sold+=amt*eq
            tc=.5*sum(abs(w[j]-old[j]) for j in range(len(w))); eq*=1-tc*.001; cost_sum+=tc*.001; trades+=1
            if pend[0]=='rec':
                if ev is not None: ev['restore_exec']=d; ev['end_index']=i; episodes.append(ev); ev=None
                peak=N[d]
            elif pend[0]=='timeout':
                if ev is not None: ev['timeout_exec']=d; ev['end_index']=i; episodes.append(ev); ev=None
                peak=N[d]
            if pend[0]=='step' and ev is not None:
                ev['steps']+=1; ev['sold_dollars']=sold
                if w[-1] <= 1e-10 and ev['sellout'] is None: ev['sellout']=d
            pend=None
        eqs.append(eq)
        q=ndx[i]; peak=max(peak,q); dd=q/peak-1
        if i+1<len(dates):
            if mode.startswith('SW') and not stress and dd<=-.20:
                stress=True; levels={20}; base=w[-1]*eq; entry_asset=base; sold=0.; entry_i=i; ev={'entry':d,'entry_index':i,'steps':0,'entry_asset':base,'sold_dollars':0.,'sellout':None,'nadir':dd,'restore_signal':None,'restore_exec':None,'timeout_exec':None}; pend=('step',.25*base)
            elif mode.startswith('SW') and stress:
                ev['nadir']=min(ev['nadir'],dd)
                md=dates[entry_i]
                elapsed=(datetime.date.fromisoformat(d)-datetime.date.fromisoformat(md)).days
                if dd>=-.05: stress=False; ev['restore_signal']=d; pend=('rec',)
                elif ('TIME' in mode) and elapsed>=548:
                    stress=False; ev['timeout_signal']=d; pend=('timeout',)
                else:
                    level=20
                    while dd<=-(level+5)/100+1e-12: level+=5
                    allowed=base*(.5 if 'CAP' in mode else 99)
                    if level not in levels and sold<allowed-1e-12:
                        levels.add(level); pend=('step',min(.25*base,allowed-sold))
            elif (mode=='REB' or mode.startswith('SW')) and not stress and any(not (tw[j]*.6 < w[j] < tw[j]*1.4) for j in range(len(w))): pend=('reb',)
            elif mode=='YR' and not stress and dates[i+1][:4]!=d[:4]: pend=('yr',)
    if ev is not None: ev['end_index']=len(dates)-1; episodes.append(ev)
    # stats
    pk=0.; mdd=0.; mdd_i=0; underwater=0; maxuw=0; peak_i=0; maxuw_from=0; run=0; prior_peak_i=0
    for i,x in enumerate(eqs):
        if x>pk:
            pk=x; peak_i=i; run=0
        else:
            run+=1
            if run>maxuw: maxuw=run; maxuw_from=peak_i
        dd=x/pk-1
        if dd<mdd: mdd=dd; mdd_i=i
    # max drawdown dates
    pval=0.; pidx=0; md=0.; mdi=0; mdpi=0
    for i,x in enumerate(eqs):
        if x>pval: pval=x;pidx=i
        if x/pval-1<md: md=x/pval-1; mdi=i;mdpi=pidx
    years=(datetime.date.fromisoformat(dates[-1])-datetime.date.fromisoformat(dates[0])).days/365.25
    cagr=eq**(1/years)-1
    # returns simple span
    return dict(eq=eq,cagr=cagr,mdd=md,mdd_start=dates[mdpi],mdd_end=dates[mdi],uw=maxuw,uw_years=maxuw/252,trades=trades,cost=cost_sum,eqs=eqs,episodes=episodes)

modes=['BH','REB','YR','SW','SW-CAP','SW-TIME','SW-CAP-TIME']
allres=[]; t0=time.time()
for ci,(aa,tw,name) in enumerate(combos):
 for m in modes:
  x=run(aa,tw,m); allres.append(dict(combo=name,assets=aa,mode=m,**{k:v for k,v in x.items() if k not in ('eqs','episodes')}));
  if True:
   Path(OUT/f'{name.replace("+","_")}_{m}.json').write_text(json.dumps({'combo':name,'mode':m,'episodes':x['episodes'],'eqs':x['eqs']},separators=(',',':')))
print('dates',len(dates),dates[0],dates[-1],'combos',len(combos),'elapsed',time.time()-t0)
# anchors
anchor=['Softw_VW','Chips_VW','Insur_VW','Softw_EW','Chips_EW']; tw=[.25,.25,.25,.125,.125]
# adjust run function supports order and stable-last yes anchor stable third, so custom reorder stable last
A=anchor[:3]+anchor[3:]
# stable is index 2; run generic stable leg hardcoded last so implement anchor recalc via mapping reorder
# anchor use same five; reorder nonstable then stable
Aa=['Softw_VW','Chips_VW','Softw_EW','Chips_EW','Insur_VW']; T=[.25,.25,.125,.125,.25]
anch={m:run(Aa,T,m) for m in ['BH','REB','SW']}
Path(OUT/'results.json').write_text(json.dumps({'dates':dates,'combos':[{'assets':a,'tw':w,'name':name} for a,w,name in combos],'results':allres,'anchors':{m:{k:v for k,v in x.items() if k not in ('eqs','episodes')} for m,x in anch.items()},'anchor_episodes':anch['SW']['episodes']},indent=2))
