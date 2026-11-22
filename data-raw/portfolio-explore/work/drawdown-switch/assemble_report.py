import sys,json,itertools,statistics
from pathlib import Path
sys.path.insert(0,str(Path('data-raw/portfolio-explore/work/drawdown-switch').resolve()))
import run as sim
root=Path('data-raw/portfolio-explore/work/drawdown-switch')
data=json.loads((root/'results.json').read_text()); w1=json.loads((root/'w1.json').read_text()); rows=data['rows']
def pct(x): return f'{100*x:.2f}%'
def signed(x): return f'{100*x:+.2f} pp'
def num(x): return f'{x:.4f}'
def metric_row(stable,scheme,m): return f"| {stable} | {scheme} | {m['final']:.3f}× | {pct(m['cagr'])} | {pct(m['vol'])} | {pct(m['mdd'])} ({m['dd_start']}–{m['dd_end']}) | {m['cer']:.4f} | {m['trades']} | {pct(m['cost'])} | {pct(m['worst_year'])} |"
def summary(xs): return (statistics.median(xs),sim.qtile(xs,.25),sim.qtile(xs,.75),sum(x>0 for x in xs)/len(xs))
# Whole W2 portfolio deltas.
lines=[]
lines += ['## W2 主设定：70 组合分布','', '差值定义：策略减 REB；最大回撤差为百分点，正值表示策略回撤较浅。年化收益、CER 为百分点差。', '', '| 指标差 | 中位数 | 第 1 四分位 | 第 3 四分位 | 策略优于 REB 比例 |','|---|---:|---:|---:|---:|']
for label,key in [('年化收益差','d_cagr'),('最大回撤差','d_mdd'),('CER 差','d_cer')]:
 m,q1,q3,pos=summary([r[key] for r in rows]); lines.append(f'| {label} | {signed(m)} | {signed(q1)} | {signed(q3)} | {pos:.1%} |')
lines += ['', '### 按稳定资产分组的中位数', '', '| 稳定资产 | 年化收益差 | 最大回撤差 | CER 差 | 年化为正比例 |', '|---|---:|---:|---:|---:|']
for s in ['CB','KO','PG','JNJ','WMT','COST','GLD']:
 rr=[r for r in rows if r['stable']==s]; a=statistics.median(r['d_cagr'] for r in rr); b=statistics.median(r['d_mdd'] for r in rr); c=statistics.median(r['d_cer'] for r in rr); pos=sum(r['d_cagr']>0 for r in rr)/len(rr)
 lines.append(f'| {s} | {signed(a)} | {signed(b)} | {signed(c)} | {pos:.1%} |')
# Events: common QQQ drawdown events; compare episode returns against REB for each combo.
portfolio_events=[]
for r in rows:
 g=tuple(r['growth'].split('+')); stable=r['stable']; stocks,tw=sim.portfolio(g,stable)
 dates,reb,_,_=sim.run(stocks,tw,sim.W2_START,'band')
 mp={d:e for d,e in zip(dates,reb)}
 eps=data['episodes'][str((g,stable))]
 for i,e in enumerate(eps):
  end=e['restore_exec'] if e['restore_exec']!='未恢复（区间末）' else dates[-1]
  if e['entry'] not in mp or end not in mp: continue
  i0=dates.index(e['entry']); i1=dates.index(end)
  _,sw,_,_=sim.run(stocks,tw,sim.W2_START,'switch',{'entry':-.20,'gap':.05,'step':.25,'recovery':'-5','buy':'lowest','stable':stable})
  sr=sw[i1]/sw[i0]-1; br=reb[i1]/reb[i0]-1
  portfolio_events.append((i,e['entry'],e['steps'],e['restore_exec'],(sr-br)))
# aggregate indexed rounds
lines += ['', '### 逐轮大跌拆解', '', '每轮收益差定义为该组合从触发日收盘到恢复执行日收盘（未恢复则至区间末）的策略区间收益减 REB 区间收益；对 70 个组合取中位数。', '', '| QQQ 进入大跌日 | 执行步数中位数（范围） | 恢复执行日 | 轮内相对 REB 收益差中位数 |', '|---|---:|---|---:|']
for idx in range(10):
 ee=[x for x in portfolio_events if x[0]==idx]
 if not ee: continue
 ent=statistics.mode(x[1] for x in ee); steps=statistics.median(x[2] for x in ee); slo=min(x[2] for x in ee); shi=max(x[2] for x in ee); rec=statistics.mode(x[3] for x in ee); diff=statistics.median(x[4] for x in ee)
 lines.append(f'| {ent} | {steps:g}（{slo}–{shi}） | {rec} | {signed(diff)} |')
# W1 full metrics
lines += ['', '## W1 用户方案与稳定股替换', '', '七个稳定资产方案均报告 BH、REB、主设定完整指标；累计成本是从组合净值扣除的累计单边换手成本。', '', '| 稳定股 | 方案 | 期末倍数 | 年化收益 | 年化波动 | 最大回撤（起止） | CER | 交易次数 | 累计成本 | 最差自然年 |','|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for x in w1:
 for k,n in [('bh','BH'),('reb','REB'),('switch','切换')]: lines.append(metric_row(x['stable'],n,x[k]))
# W2 full source results available in CSV; add complete portfolio row info in appendix compact deltas
# common QQQ buy-and-hold benchmark for each window
lines += ['', '### QQQ 买入持有基准', '', '| 区间 | 期末倍数 | 年化收益 | 年化波动 | 最大回撤（起止） | CER | 交易次数 | 累计成本 | 最差自然年 |','|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for label,start in [('W1',sim.W1_START),('W2',sim.W2_START)]:
 _,_,m,_=sim.run(['QQQ'],[1.],start,'bh')
 lines.append(f"| {label} | {m['final']:.3f}× | {pct(m['cagr'])} | {pct(m['vol'])} | {pct(m['mdd'])} ({m['dd_start']}–{m['dd_end']}) | {m['cer']:.4f} | {m['trades']} | {pct(m['cost'])} | {pct(m['worst_year'])} |")
lines += ['', '## 参数网格边际影响', '', '每个配置对 W2 的 70 个组合逐一运行；以下先对每个固定全配置求 70 组合年化差中位数，再对其他四个维度的配置取中位数。变化值为相对主设定（−20%、5pp、25%、−5%、最低配非稳定股）中位数的百分点变化；避免按表现挑选单组。', '', '| 维度 | 取值 | 年化差的中位数 | 相对主设定变化 |','|---|---|---:|---:|']
grid=json.loads((root/'grid-marginal.json').read_text()); mainmed=statistics.median(r['d_cagr'] for r in rows)
labels={'entry':{-.15:'−15%',-.20:'−20%',-.25:'−25%'},'gap':{.05:'5pp',.1:'10pp'},'step':{.25:'25%',.5:'50%',1.:'100%'},'recovery':{'-10':'回到−10%','-5':'回到−5%','high':'创新高'},'buy':{'lowest':'最低配单只','all':'按目标权重分配','volatile':'高波动最低配'}}
for dim in ['entry','gap','step','recovery','buy']:
 vals=[r for r in grid if r['dimension']==dim]
 for r in sorted(vals,key=lambda x: str(x['value'])):
  val=r['value']; med=r['median']
  lines.append(f"| {dim} | {labels[dim][val]} | {signed(med)} | {signed(med-mainmed)} |")
lines += ['', '## 结论与局限', '', '在 W2 主设定的 70 个组合中，年化收益差中位数为 +1.87 个百分点（69/70 为正），CER 差中位数为 +0.77 个百分点（64/70 为正）；但最大回撤差中位数为 −4.34 个百分点，70/70 的最大回撤都更深。也就是说样本里该策略提高了长期收益与 CER，却牺牲了回撤控制。W1 用户方案（CB）年化收益比 REB 高 4.21 个百分点、CER 高 1.63 个百分点，但最大回撤多 1.71 个百分点。七种稳定股替换均提高年化收益；WMT 与 GLD 的 CER 略低于 REB，其余为正。', '', '收益差依赖四轮触发：2018 轮中位数略负（−0.19pp），2020 为 +4.64pp，2022 为 +15.52pp，2025 为 +2.53pp；2022 轮执行 4 步并持续到 2023-07 恢复，是最大贡献来源。尽管轮内收益增加，最大回撤在所有组合中仍更深，说明改善主要来自反弹阶段加仓弹性股，同时承担了更深的中途损失。参数边际结果应整体解读，不应按单个网格点挑选。', '', '不含分红可能偏向切换策略：压力期卖掉稳定股会放弃后续股息，而分红计入会提高继续持有/普通再平衡的收益；KO、PG、JNJ 的漏计影响尤其大。该方向不能精确量化，仍可能随不同分红再投资和恢复节奏改变。', '', '回测是事后选择样本；仅有一个 W1 区间与 70 个彼此相关的 W2 组合，不能视为 70 次独立市场实验。日收盘信号、次日收盘执行，无法反映盘中触发、滑点与税费。', '', '## 执行记录', '', '实际命令：`python3 data-raw/portfolio-explore/work/drawdown-switch/run.py`（锚点、70 个 W2 主设定组合、W1 七组；127.0 秒）；`python3 data-raw/portfolio-explore/work/drawdown-switch/grid_only.py`（162 个参数配置 × 70 个组合；65.0 秒）；`python3 data-raw/portfolio-explore/work/drawdown-switch/assemble_report.py`（报告生成；约 2 秒）。期间修正恢复后 REB 控制流程，并对完整参数边际表重新运行。所有输入均来自本地 `prices-adjusted.json`，未请求网络。']
report=Path('.dev-team/runs/portfolio-explore/reports/drawdown-switch.md')
s=report.read_text(); start=s.index('## 结果\n'); end=s.index('## 执行记录\n')
# Replace initial result placeholder and execution section, retaining method and anchors.
report.write_text(s[:start]+'## 结果\n\n'+'\n'.join(lines)+'\n')
