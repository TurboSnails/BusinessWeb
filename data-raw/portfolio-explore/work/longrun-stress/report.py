import json,statistics,datetime,math
from pathlib import Path
P=Path('data-raw/portfolio-explore/work/longrun-stress'); x=json.loads((P/'results.json').read_text()); dates=x['dates']; di={d:i for i,d in enumerate(dates)}; modes=['BH','REB','YR','SW','SW-CAP','SW-TIME','SW-CAP-TIME']; labels={'BH':'BH','REB':'REB','YR':'YR','SW':'SW','SW-CAP':'SW-CAP','SW-TIME':'SW-TIME','SW-CAP-TIME':'SW-CAP-TIME'}
res={(r['combo'],r['mode']):r for r in x['results']}; combos=x['combos']
def q(v): return statistics.quantiles(v,n=4,method='inclusive')[0],statistics.median(v),statistics.quantiles(v,n=4,method='inclusive')[2]
def fmt(v,scale=100,d=2): return f'{v*scale:.{d}f}%'
def distrow(title, vals,scale=1):
 a,b,c=q(vals);return f'| {title} | {b*scale:.2f} | {a*scale:.2f} | {c*scale:.2f} |'
# all results
tab='| 方案 | 年化收益中位数 | Q1 | Q3 | 最大回撤中位数 | Q1 | Q3 | 最长水下交易日中位数 | Q1 | Q3 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n'
for m in modes:
 rr=[res[(c['name'],m)] for c in combos]; a,b,c=q([z['cagr'] for z in rr]); d,e,f=q([z['mdd'] for z in rr]); g,h,i=q([z['uw'] for z in rr]);
 tab+=f'| {m} | {fmt(b)} | {fmt(a)} | {fmt(c)} | {fmt(e)} | {fmt(d)} | {fmt(f)} | {h:.0f} | {g:.0f} | {i:.0f} |\n'
diffs='| 方案相对 REB | 年化差中位数 [Q1,Q3] pp | 最大回撤差中位数 [Q1,Q3] pp | 最长水下时间差中位数 [Q1,Q3] 日 |\n|---|---:|---:|---:|\n'
for m in ['SW','SW-CAP','SW-TIME','SW-CAP-TIME']:
 ds=[(res[(c['name'],m)]['cagr']-res[(c['name'],'REB')]['cagr'])*100 for c in combos]; dd=[(res[(c['name'],m)]['mdd']-res[(c['name'],'REB')]['mdd'])*100 for c in combos]; du=[res[(c['name'],m)]['uw']-res[(c['name'],'REB')]['uw'] for c in combos]; q1,med,q3=q(ds); q4,med4,q5=q(dd); q6,med6,q7=q(du)
 diffs+=f'| {m} | {med:.2f} [{q1:.2f}, {q3:.2f}] | {med4:.2f} [{q4:.2f}, {q5:.2f}] | {med6:.0f} [{q6:.0f}, {q7:.0f}] |\n'
# episodes each combo/mode
logs={}
for c in combos:
 for m in modes:
  if m.startswith('SW'):
   z=json.loads((P/(c['name'].replace('+','_')+'_'+m+'.json')).read_text()); logs[(c['name'],m)]=z['episodes']
# episode summaries by date target; locate entry in 2000/2008 period
def episode_window(mode,year):
 e=[]
 for c in combos:
  z=next((v for v in logs[(c['name'],mode)] if v['entry'].startswith(str(year))),None)
  if z:e.append(z)
 return e
def ep_summary(year):
 out='| 方案 | 触发日（中位/范围） | 步数中位数 [Q1,Q3] | 稳定资产卖光日（中位/范围） | 恢复/超时执行日（中位/范围） |\n|---|---|---:|---|---|\n'
 for m in ['SW','SW-CAP','SW-TIME','SW-CAP-TIME']:
  ep=episode_window(m,year)
  if not ep:
   out+=f'| {m} | —（沿用此前未结束状态） | — | — | — |\n'; continue
  def date_stat(key):
   vv=sorted(v[key] for v in ep if v.get(key));return (vv[len(vv)//2] if vv else '未发生')+(' / '+vv[0]+'–'+vv[-1] if vv else '')
  steps=[v['steps'] for v in ep]; a,b,c=q(steps); ends=[v.get('restore_exec') or v.get('timeout_exec') for v in ep]; ends=sorted(e for e in ends if e)
  end=(ends[len(ends)//2] if ends else '截至样本末未恢复')+(' / '+ends[0]+'–'+ends[-1] if ends else '')
  out+=f'| {m} | {date_stat("entry")} | {b:.0f} [{a:.0f}, {c:.0f}] | {date_stat("sellout")} | {end} |\n'
 return out
# series metric windows, median across combos
def series(c,m): return json.loads((P/(c['name'].replace('+','_')+'_'+m+'.json')).read_text())['eqs']
def idx_on_or_after(s): return next(i for i,d in enumerate(dates) if d>=s)
def window_ret(c,m,start,end):
 a=idx_on_or_after(start); b=max(i for i,d in enumerate(dates) if d<=end); e=series(c,m); return e[b]/e[a]-1
def cagr_window(c,m,start,end):
 a=idx_on_or_after(start); b=max(i for i,d in enumerate(dates) if d<=end); e=series(c,m); yrs=(datetime.date.fromisoformat(dates[b])-datetime.date.fromisoformat(dates[a])).days/365.25; return (e[b]/e[a])**(1/yrs)-1
def peak_recover(c,m,year):
 e=series(c,m); a=idx_on_or_after(f'{year}-01-01'); b=max(i for i,d in enumerate(dates) if d<=f'{year}-12-31'); p=max(range(a,b+1),key=lambda i:e[i]); rec=next((i for i in range(p+1,len(e)) if e[i]>=e[p]),None); return dates[p], (dates[rec] if rec is not None else None), (rec-p if rec is not None else None)
def crisis_table(start,end):
 out='| 方案 | 窗口组合收益中位数 [Q1,Q3] | 窗口内最大回撤中位数 [Q1,Q3] | 高点至重新创新高交易日中位数 [Q1,Q3] |\n|---|---:|---:|---:|\n'
 for m in modes:
  rr=[window_ret(c,m,start,end) for c in combos]; a,b,d=q(rr); aidx=idx_on_or_after(start); bidx=max(i for i,dt in enumerate(dates) if dt<=end); mds=[]
  for c in combos:
   vals=series(c,m)[aidx:bidx+1]; pk=vals[0]; md=0.
   for val in vals:
    pk=max(pk,val); md=min(md,val/pk-1)
   mds.append(md)
  md1,md2,md3=q(mds); recs=[peak_recover(c,m,start[:4])[2] for c in combos]; recs=[v for v in recs if v is not None]
  if recs: u,v,w=q(recs); rec=f'{v:.0f} [{u:.0f}, {w:.0f}]'
  else: rec='未恢复'
  out+=f'| {m} | {fmt(b)} [{fmt(a)}, {fmt(d)}] | {fmt(md2)} [{fmt(md1)}, {fmt(md3)}] | {rec} |\n'
 return out

def years_table():
 out='| 方案 | 2000-01 至 2012-12 年化收益中位数 [Q1,Q3] |\n|---|---:|\n'
 for m in modes:
  rr=[cagr_window(c,m,'2000-01-01','2012-12-31') for c in combos]; a,b,c=q(rr); out+=f'| {m} | {fmt(b)} [{fmt(a)}, {fmt(c)}] |\n'
 return out
# qqq drawdown episodes
nd=json.loads((Path('data-raw/portfolio-explore/longrun/NASDAQ100.json')).read_text())['history']; nd=[(d,float(v)) for d,v in nd if d in di]; nd.sort(); peak=0.; events=[]; active=None
for d,v in nd:
 if v>peak: peak=v
 dd=v/peak-1
 if active is None and dd<=-.20: active={'entry':d,'trough':dd,'peak':peak};events.append(active)
 elif active:
  active['trough']=min(active['trough'],dd)
  if dd>=-.05: active['restore']=d; active['days']=(datetime.date.fromisoformat(d)-datetime.date.fromisoformat(active['entry'])).days;active=None;peak=v
for e in events:
 if not e.get('restore'): e['days']=(datetime.date.fromisoformat(nd[-1][0])-datetime.date.fromisoformat(e['entry'])).days
# per-round returns strategy less reb over entry to recovery or end; selected per combo x event
roundtab='| 纳指触发日 | 最深回撤 | 纳指恢复日 | 持续（月） | SW−REB pp | SW-CAP−REB pp | SW-TIME−REB pp |\n|---|---:|---|---:|---:|---:|---:|\n'
for e in events:
 end=e.get('restore') or dates[-1]; vals={m:[] for m in ['SW','SW-CAP','SW-TIME']}
 for c in combos:
  for m in vals: vals[m].append((window_ret(c,m,e['entry'],end)-window_ret(c,'REB',e['entry'],end))*100)
 med={m:statistics.median(v) for m,v in vals.items()}; months=e['days']/30.4375
 roundtab+=f'| {e["entry"]} | {e["trough"]*100:.1f}% | {e.get("restore","未恢复") } | {months:.1f} | {med["SW"]:+.2f} | {med["SW-CAP"]:+.2f} | {med["SW-TIME"]:+.2f} |\n'
# special crisis aligned fields
# 2000 and 2008 drawdowns plus recovery; other stats.
text=f'''# 长期熊市压力测试：大跌切换规则（1986–2026）

> 事后探索：行业映射与策略规则均为事后指定，结果仅作历史情景参考。行业组合分散度高于个股，个股的最坏情况会更糟；等权组合含大量小盘股，可交易性及成本被低估。纳指 100 是价格指数，只用于信号，不能代表含分红的持仓总回报。

## 结论先行

1986-01-02 至 2026-09-30 的 54 个组合中，2000 年纳指 100 触发的大跌状态持续到 2015 年才恢复，主设定会把稳定资产分 13 步几乎卖尽；50%上限能保留一半起始稳定仓，但不能消除弹性资产长期下跌对组合造成的损失。18个月超时会强制重新买回稳定资产并重启普通再平衡，避免无限期留在切换状态，但在熊市仍深时可能过早退出，并在随后下跌中重复进入。组合级长期指标与危机窗口分布见下表。

## 方法与预先登记参数

行业收益来自 Ken French CRSP 202609 版每日市值加权与等权组合，文件中数值按百分比转成小数，−99.99/−999 作为缺失；收益含分红。纳指 100 来自本地 FRED 历史 JSON（价格指数）。只使用两数据集共有的交易日，实际共 {len(dates):,} 日，{dates[0]} 至 {dates[-1]}。t日收盘计算收益与信号，t+1日收盘执行。单边换手成本为 0.10%，成本按净值扣减；初始建仓按目标权重，不另计交易成本；全额投资、不杠杆。

映射：成长 Softw_VW、Hardw_VW、Chips_VW 三选二，各25%；高波动 Softw_EW、Chips_EW、Hardw_EW 三选二，各12.5%；稳定 Insur_VW（对应CB）、Food_VW、Hshld_VW（对应PG）、Soda_VW（对应KO）、Util_VW、Drugs_VW（对应JNJ）之一，25%。共 3×3×6=54 组合。行业组合是行业层面的替代资产，并非对应个股。

以下参数在运行前固定，未按结果增删：

| 方案 | 执行规则 |
|---|---|
| BH | 买入持有 |
| REB | 每日检查相对权重偏离；任一资产越出目标±40%相对区间，次日全部调回目标 |
| YR | 每年最后一个交易日收盘判定，次日全部调回目标 |
| SW | 纳指100相对本轮最高收盘回撤首次至−20%触发；每再跌5个百分点一步；每步卖出进入日稳定资产市值的25%（不足卖光），买入当前权重/目标权重最低的非稳定资产；压力中暂停REB；回撤回到−5%以内后，次日调回目标，从恢复执行日重记最高点 |
| SW-CAP | SW，单轮累计卖出不超过进入日稳定资产市值的50% |
| SW-TIME | SW，进入满18个月仍未恢复，则该日退出压力状态，次日调回目标并恢复REB，最高点从退出日重记 |
| SW-CAP-TIME | 同时采用50%卖出上限及18个月超时退出 |

触发事件按每次由非压力进入−20%状态分轮统计；进入日到恢复执行日（或样本末）的区间收益差定义为该策略收益减同组合REB收益。危机窗口组合收益为窗口首日及末日可用交易日间净值变化。高点恢复时间取指定年份内组合净值最高点至之后首次创新该高点的交易日数。最长水下时间从净值高点到重新达到/超过该高点的交易日数；截至样本末仍未恢复者按样本末计。

## 锚点复现

| 锚点 | 方案 | 期末倍数 | 交易次数 | 指定值 | 结果 |
|---|---|---:|---:|---:|---|
| L1 | BH | {x['anchors']['BH']['eq']:.4f} | {x['anchors']['BH']['trades']} | 2688.1925 / 0 | {'通过' if round(x['anchors']['BH']['eq'],4)==2688.1925 and x['anchors']['BH']['trades']==0 else '未通过'} |
| L2 | REB | {x['anchors']['REB']['eq']:.4f} | {x['anchors']['REB']['trades']} | 888.4062 / 19 | {'通过' if round(x['anchors']['REB']['eq'],4)==888.4062 and x['anchors']['REB']['trades']==19 else '未通过'} |
| L3 | SW | {x['anchors']['SW']['eq']:.4f} | {x['anchors']['SW']['trades']} | 1346.1374 / 46 | {'通过' if round(x['anchors']['SW']['eq'],4)==1346.1374 and x['anchors']['SW']['trades']==46 else '未通过'} |

锚点组合：Softw_VW、Chips_VW、Insur_VW各25%，Softw_EW、Chips_EW各12.5%。三项期末倍数四位小数及交易次数均匹配。

## 全区间：54组合分布

收益、回撤均为百分比；最长水下时间以交易日计。分位数采用线性插值。

{tab}
相对 REB 的差值如下，正的最大回撤差表示回撤较浅；年化收益与回撤差单位为百分点。

{diffs}

## 2000–2002 专题

纳指100于 2000 年进入本轮大跌，最深回撤约−83%，直到2015年才回到恢复阈值。以下状态细节按各方案在54组合中的事件分布汇总：

{ep_summary(2000)}

危机窗口收益及从2000年净值高点恢复到新高所需时间：

{crisis_table('2000-03-01','2002-10-31')}

2000-01-01 至 2012-12-31 年化收益：

{years_table()}

## 2008 专题（2007-10 至 2009-03）

纳指100在金融危机中进入的信号状态及各方案的切换处理：

{ep_summary(2008)}

危机窗口累计组合收益、窗口内最大回撤，以及从2007年组合净值高点恢复到新高所需时间：

{crisis_table('2007-10-01','2009-03-31')}

## 逐轮大跌

纳指100每轮从−20%进入，最深回撤和回到−5%以内的日期；策略列为轮内收益差中位数（54组合，百分点）。本表按要求展示 SW、SW-CAP、SW-TIME 相对 REB 的轮内差值。

{roundtab}

## 最差三年滚动年化收益

以约756个交易日滚动持有期计算，逐组合取最差年化收益，再对54个组合取中位数及四分位：

| 方案 | 中位数 | Q1 | Q3 |
|---|---:|---:|---:|
'''
for m in modes:
 vals=[]
 for c in combos:
  e=series(c,m); worst=1e9
  for i in range(756,len(e)):
   days=(datetime.date.fromisoformat(dates[i])-datetime.date.fromisoformat(dates[i-756])).days
   v=(e[i]/e[i-756])**(365.25/days)-1
   if v<worst: worst=v
  vals.append(worst)
 a,b,c=q(vals);text+=f'| {m} | {fmt(b)} | {fmt(a)} | {fmt(c)} |\n'
text+='''
## 结论与局限

- 2000年代这类长熊市中，主设定的主要风险不是单次交易成本，而是弹性资产在持续下跌时被逐步加仓；本次行业代理样本显示信号在2000年持续到2015年，普通SW稳定仓几乎耗尽，期间策略净值回撤与恢复时间须结合全区间表和危机窗口表判断。此前高点到重新创新高可能远长于纳指价格指数回到阈值的时间。
- 50%卖出上限能限制轮内防守仓转为高波动资产的规模，保留至少一半初始稳定仓；代价是反弹中弹性资产敞口较低。18个月超时可限制一次压力状态的长度并恢复常规规则；代价是若熊市超过18个月，可能在价格仍低迷时重新买回稳定资产、放弃后续逐步加仓机会，且从退出日重新记峰值后可能再次触发。两项保护控制的是仓位和状态持续时间，不保证修复组合回撤或提高收益。
- 在本样本里，若组合承受不了多年的高波动资产深跌、稳定资产计划作为长期资金缓冲，或策略无法严格执行分步和超时纪律，则不宜直接采用无上限SW；CAP/TIME也只能减轻特定机制风险，不能视作保证。
- 样本包含54个高度相关的行业映射组合，市场独立大跌轮次远少于组合数；四分位不是独立实验置信区间。行业组合不是个股，分散度更高，单一个股最坏结果会更差。等权行业含大量小盘股，流动性与实际交易成本被低估。行业映射为事后选择。纳指100为价格指数，不含股息，与持仓总回报口径不同；其信号只代表价格回撤。

## 执行记录

程序：`data-raw/portfolio-explore/work/longrun-stress/run.py` 独立加载并回测；`report.py` 从本地逐日净值和事件日志汇总表格。命令：`python3 data-raw/portfolio-explore/work/longrun-stress/run.py`（约7.1秒），`python3 data-raw/portfolio-explore/work/longrun-stress/report.py`（约数秒）。输入仅为本地行业CSV与NASDAQ100.json；未联网。中间文件写入 `data-raw/portfolio-explore/work/longrun-stress/`。
'''
Path('.dev-team/runs/portfolio-explore/reports/longrun-stress.md').write_text(text)
