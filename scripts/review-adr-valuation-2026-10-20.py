"""Render the 2026-10-20 valuation draft and rating tiers for the 66 ADR companies (美股非标普; SOFI keeps src/data/details/sofi.ts).

Inputs  public/research/adr-2026-10-07/{previous,patches,models,input}.json, focus.tsv   (2026-10-07 fact review)
        src/data/companyMarketSnapshot.json                                           (price, 2026-10-19)
        public/research/data-refresh-2026-10-20/yahoo-quote-batch.json                (vendor EPS / dividend, the snapshot's valuationSource)
        public/data/dcf-prefill.json                                                  (fyh history, ASML only)
Outputs src/data/details/adrValuation.ts (rt/h/s/ratio/x/z/i overlay), public/research/adr-valuation-2026-10-20/{valuation.json,summary.csv,README.md}
No network, no clock: re-running produces identical files.
Rating ladder is copied from scripts/review-cn-itucd-2026-10-07.py (lines 214-236). Valuation is an uncertified research hypothesis.
"""
import csv
import io
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'public/research/adr-2026-10-07'
OUT = ROOT / 'public/research/adr-valuation-2026-10-20'
TS = ROOT / 'src/data/details/adrValuation.ts'
DATE = '2026-10-20'
DISCLAIMER = '估值初稿（未认证），仅为研究假设，不构成买卖建议。'
YAHOO_FILE = 'research/data-refresh-2026-10-20/yahoo-quote-batch.json'
OUT.mkdir(parents=True, exist_ok=True)

previous = json.loads((SRC / 'previous.json').read_text())['companies']
patches = {p['code']: p for p in json.loads((SRC / 'patches.json').read_text())}
models = json.loads((SRC / 'models.json').read_text())
fx = json.loads((SRC / 'input.json').read_text())['fx']
audit = {r['code']: r for r in json.loads((SRC / 'audit.json').read_text())['companies']}
focus = {}
for line in (SRC / 'focus.tsv').read_text().splitlines():
    if line.strip():
        c, biz, driver, risk, watch, method, segs = line.split('|')
        focus[c] = dict(biz=biz, driver=driver, risk=risk, watch=watch)
snap = json.loads((ROOT / 'src/data/companyMarketSnapshot.json').read_text())
yq = {q['symbol']: q for q in json.loads((ROOT / 'public' / YAHOO_FILE).read_text())['quotes'].values()}
prefill = {i['c']: i for i in json.loads((ROOT / 'public/data/dcf-prefill.json').read_text())['items'] if i['m'] == 'us'}

# class: (中文名, bear PE, base PE, bull PE, 倍数依据, bear growth offset)；结构与 cn-itucd CLS 相同，倍数为全球同业常见区间的研究假设
CLS = {
    'foundry': ('晶圆代工', 16, 22, 28, '代工资本密集、盈利取决于稼动率与折旧，取全球代工龙头常见 PE 区间', 35),
    'semieq': ('半导体设备', 22, 30, 38, '设备订单随晶圆厂资本开支波动，龙头享技术垄断溢价但不外推高景气', 35),
    'chipip': ('芯片 IP / 授权', 35, 50, 65, '授权与版税模式毛利高、增速依赖新架构渗透，倍数对增速极敏感', 35),
    'mem': ('存储', 7, 11, 15, '存储盈利随 DRAM/NAND 价格周期大幅波动，沿用 cn-itucd 存储类倍数', 40),
    'pharma': ('大型制药', 11, 15, 19, '专利悬崖与管线兑现决定盈利，取全球大型药企常见 PE 区间', 25),
    'biotech': ('创新药 / 生物科技', 25, 35, 45, '刚转盈利的创新药企估值依赖新药放量，倍数高且波动大', 35),
    'software': ('企业软件', 20, 27, 34, '订阅与云积压提供可见度，取成熟企业软件常见 PE 区间', 25),
    'netgrowth': ('全球互联网 / 平台成长', 22, 32, 42, '平台成长股盈利基数低、增速高，倍数按成长平台常见区间', 35),
    'cninternet': ('中概互联网', 9, 13, 17, '中概股含监管、竞争与地缘折价，倍数低于美国同业', 30),
    'cnconsumer': ('中概消费 / 服务', 11, 15, 19, '餐饮、零售与酒店盈利取决于同店与扩店，含中概折价', 25),
    'cnlogistics': ('快递物流', 9, 12, 15, '快递价格战与件量增速决定盈利，资本开支较高', 25),
    'cnedu': ('教育服务', 12, 17, 22, '教培盈利取决于报名人数与监管边界，现金预收较多', 30),
    'propsvc': ('房产交易服务', 10, 14, 18, '佣金收入随房地产成交量波动，按地产链周期处理', 35),
    'auto': ('汽车整车', 6, 8, 11, '整车盈利受销量、价格战、关税与汇率影响；cn-itucd 未把汽车列入周期封顶集合，本轮一致不封顶但倍数取低位', 30),
    'media': ('消费电子 / 娱乐', 14, 18, 23, '游戏、音乐、影视与传感器多分部，取综合娱乐公司常见区间', 25),
    'oilmaj': ('石油天然气', 7, 10, 13, '油气盈利随油价与炼化价差波动，按资源周期处理', 30),
    'mining': ('矿业', 7, 10, 13, '铁矿、铜等商品价格决定盈利，按资源周期处理', 35),
    'rail': ('铁路运输', 15, 19, 23, '铁路特许网络现金流稳定、运量随工业周期温和波动', 20),
    'staples': ('必选消费', 15, 19, 23, '品牌消费品盈利稳定、增长慢，取全球必选消费常见区间', 20),
    'tobacco': ('烟草', 8, 10, 12, '烟草现金流稳定但量下滑、监管风险高，倍数低', 15),
    'itsvc': ('IT 服务外包', 16, 21, 26, 'IT 外包盈利取决于大客户预算与人员利用率，增长温和', 20),
    'fintech': ('支付 / 金融科技', 5, 8, 11, '巴西支付机构盈利受利率与信用成本影响，含当地高利率折价', 30),
}
CYCLICAL = {'foundry', 'mem', 'oilmaj', 'mining', 'propsvc'}  # cn-itucd CYCLICAL 中出现的 foundry/mem/oilmaj + 资源（矿业）、地产链
# 金融股（银行 / 券商）：股息率法。(中文名, bear 股息率, base, bull, bear DPS 系数, bull DPS 系数)
DIV = ('银行 / 券商', 7.0, 5.0, 4.0, 0.8, 1.05)
DIV_MIN, DIV_MAX = 3.0, 8.0

CLASS = {
    'TSM': 'foundry', 'ASML': 'semieq', 'ARM': 'chipip', 'SKHY': 'mem',
    'NVO': 'pharma', 'AZN': 'pharma', 'NVS': 'pharma', 'SNY': 'pharma', 'GSK': 'pharma', 'ONC': 'biotech',
    'SAP': 'software', 'SHOP': 'netgrowth', 'SPOT': 'netgrowth', 'MELI': 'netgrowth', 'SE': 'netgrowth', 'GRAB': 'netgrowth', 'CPNG': 'netgrowth',
    'SPCX': 'netgrowth',
    'BABA': 'cninternet', 'PDD': 'cninternet', 'JD': 'cninternet', 'BIDU': 'cninternet', 'NTES': 'cninternet', 'TCOM': 'cninternet',
    'TME': 'cninternet', 'VIPS': 'cninternet', 'BILI': 'cninternet',
    'YUMC': 'cnconsumer', 'MNSO': 'cnconsumer', 'HTHT': 'cnconsumer', 'ZTO': 'cnlogistics', 'TAL': 'cnedu', 'EDU': 'cnedu', 'BEKE': 'propsvc',
    'TM': 'auto', 'HMC': 'auto', 'NIO': 'auto', 'XPEV': 'auto', 'LI': 'auto', 'SONY': 'media',
    'SHEL': 'oilmaj', 'TTE': 'oilmaj', 'BP': 'oilmaj', 'E': 'oilmaj', 'PBR': 'oilmaj', 'VALE': 'mining', 'BHP': 'mining', 'RIO': 'mining',
    'CNI': 'rail', 'UL': 'staples', 'DEO': 'staples', 'BTI': 'tobacco', 'INFY': 'itsvc', 'STNE': 'fintech', 'PAGS': 'fintech',
    'HSBC': 'div', 'MUFG': 'div', 'SMFG': 'div', 'TD': 'div', 'RY': 'div', 'LYG': 'div', 'HDB': 'div', 'IBN': 'div', 'ITUB': 'div', 'NU': 'div',
    'FUTU': 'div',
}
codes = [c['code'] for c in previous]
assert len(codes) == 66 and 'SOFI' not in codes and set(codes) == set(CLASS), set(codes) ^ set(CLASS)


def usd(v):
    return f'US${v:,.2f}'


def chg(v, P):
    return f'{(v / P - 1) * 100:+.0f}%'


def fx_note(fc):
    if fc == 'USD':
        return '财报币种 USD，与交易币种一致，无需换算'
    r = fx.get(f'{fc}USD=X')
    rate = f'input.json fx {fc}USD=X {r["regularMarketPrice"]:.6g}（2026-10-07 Yahoo 快照）' if r else f'input.json fx 未收录 {fc}USD [MISSING]'
    return f'财报币种 {fc}、交易币种 USD：供应商 EPS/股息已是每 ADS 美元口径，本轮不再二次换算以免重复折算；参考汇率 {rate}'


def rate_ladder(valued, flags, ratio, cls):
    """Verbatim port of scripts/review-cn-itucd-2026-10-07.py 214-236 (ocf<0 cap has no input here, see x line)."""
    if not valued:
        return '回避', None
    if flags or ratio is None:
        rating = '观察'
    elif ratio >= 2:
        rating = '优先关注'
    elif ratio >= 1:
        rating = '条件关注'
    else:
        rating = '观察'
    capped = None
    if rating == '优先关注':
        rating, capped = '条件关注', ('ratio>8' if ratio > 8 else 'single-method')
    if rating == '条件关注' and ratio is not None and ratio > 8:
        rating, capped = '观察', 'ratio>8'
    if cls in CYCLICAL and rating in ('优先关注', '条件关注'):
        rating, capped = '观察', 'cyclical'
    return rating, capped


CAP_TEXT = {
    'single-method': '估值只有一套供应商盈利 × 类别倍数方法，未经第二种独立方法交叉验证，ratio ≥2 封顶条件关注',
    'ratio>8': '悲观价贴近现价使赔率畸高（>8:1），压力情景不足，封顶观察',
    'cyclical': '周期行业：需用中周期盈利估值，TTM / 前瞻低 PE 不自动代表便宜；未取得中周期盈利，评级封顶观察',
}

records, blocks = [], []
for code in codes:
    s = snap[f'adr:{code}']
    q = yq[s['symbol']]
    old = audit[code]['rating']
    judgment = audit[code]['judgment']
    fc = q.get('financialCurrency') or 'USD'
    fo = focus[code]
    cls = CLASS[code]
    P = s['price']
    assert s['currency'] == 'USD' and s['date'] == '2026-10-19', code
    eps_t, eps_f = q.get('epsTrailingTwelveMonths'), q.get('epsForward')
    price_src = f'现价 {usd(P)}（companyMarketSnapshot adr:{code}，{s["date"]} {s["provider"]}，{s["session"]}）'
    eps_src = (f'盈利基数为 Yahoo 供应商 PE 反推（companyMarketSnapshot valuationSource={YAHOO_FILE}，2026-10-19），非公司指引、非一手财报：'
               f'TTM EPS {usd(eps_t) if eps_t is not None else "[MISSING]"}/ADS（epsTrailingTwelveMonths，对应 trailingPE {s["trailingPE"] or "[MISSING]"}），'
               f'前瞻 EPS {usd(eps_f) if eps_f is not None else "[MISSING]"}/ADS（epsForward 供应商共识，对应 forwardPE {s["forwardPE"] or "[MISSING]"}）')
    flags, scen, ratio, model, zone = [], [], None, None, None
    loss = eps_t is None or eps_t <= 0
    method = 'div' if cls == 'div' else 'pe'
    names = ['悲观', '基准', '乐观']
    trig = [f'压力：{fo["risk"]}', f'验证：{fo["watch"]}', f'兑现：{fo["driver"]}']
    missing_reason = None

    if loss:
        valued = False
        cname = DIV[0] if method == 'div' else CLS[cls][0]
        missing_reason = f'TTM EPS 为负（供应商 epsTrailingTwelveMonths {eps_t}），不套 PE 情景、不给赔率' + ('' if old == '等待证据' else '；与 2026-10-07 原件复核「观察」口径冲突，待核读，不机械判回避')
    elif method == 'pe':
        cname, bearPE, basePE, bullPE, why, bear_off = CLS[cls]
        valued = eps_f is not None and eps_f > 0
        if not valued:
            missing_reason = '供应商前瞻 EPS 缺失或 ≤0'
        else:
            g = (eps_f / eps_t - 1) * 100  # vendor-implied growth replaces cn-itucd analyst g; base EPS = epsForward
            if not 0.5 <= eps_f / eps_t <= 3:
                flags.append(f'供应商前瞻 / TTM EPS 比值 {eps_f / eps_t:.2f} 超出 [0.5, 3]，口径或一次性项目待核')
            if s['trailingPE'] and abs(q['regularMarketPrice'] / s['trailingPE'] / eps_t - 1) > 0.02:
                flags.append('供应商 TTM PE 与 EPS 不自洽')
            if abs(P / q['regularMarketPrice'] - 1) > 0.03:
                flags.append('腾讯价与 Yahoo 价相差 >3%')
            eps = [eps_t * max(0.15, 1 + (g - bear_off) / 100), eps_t * (1 + g / 100), eps_t * (1 + (g + 20) / 100)]
            mult = [bearPE, basePE, bullPE]
            values = [e * m for e, m in zip(eps, mult)]
            bear, base, bull = values
            if not (bear < base < bull):
                base = max(base, bear * 1.05)
                bull = max(bull, base * 1.1)
                values = [bear, base, bull]
            gs = [g - bear_off, g, g + 20]
            for i in range(3):
                scen.append(dict(name=names[i], prob='[MISSING]（未赋概率）',
                                 assumption=f'TTM EPS {usd(eps_t)}/ADS（供应商）；前瞻盈利较 TTM {gs[i]:+.0f}%（基准 = 供应商共识 epsForward，悲观 −{bear_off} 个百分点、乐观 +20 个百分点，研究假设非公司指引）→ EPS {usd(eps[i])}',
                                 multiple=f'{mult[i]}× PE（{cname}类假设，单一倍数方法，未校准历史分位）',
                                 price=f'{usd(values[i])}（估值初稿）', change=chg(values[i], P), trigger=trig[i]))
            model = dict(method='pe', epsT=eps_t, epsF=eps_f, g=g, bearOff=bear_off, eps=eps, mult=mult, price=values)
            mult_note = f'{cname}类倍数 {bearPE}/{basePE}/{bullPE}× 为研究假设（{why}）'
    else:
        cname, ybear, ybase, ybull, kbear, kbull = DIV
        dps, dy = q.get('dividendRate'), q.get('dividendYield') or 0
        valued = True  # 盈利为正；股息率法能否成立见 missing_reason
        md = models[code]
        if md.get('numericDraft'):
            # 10-07 逐家核读的普通股 ROE-PB 草案（bvps / bvCurrency / ADS 比例 / 汇率已核对）：三档价直接取 models.json，已折算 USD 每 ADS / 每股
            ms = md['scenarios']
            values = [x['price'] for x in ms]
            assert [x['name'] for x in ms] == names and values[0] < values[1] < values[2], code
            assert abs(md['bear'] - values[0]) < 1e-9 and abs(md['base'] - values[1]) < 1e-9 and abs(md['bull'] - values[2]) < 1e-9, code
            for i, x in enumerate(ms):
                scen.append(dict(name=names[i], prob='[MISSING]（未赋概率）',
                                 assumption=f'ROE {x["roe"]}%、Ke {x["ke"]}%、g {x["g"]}%、权益折减 {x["equityHaircut"] * 100:.0f}%；BVPS {md["bvps"]} {md["bvCurrency"]}/股 × {md["ordinaryPerUsInstrument"]} 股/证券 × 汇率 {md["usdPerReportCurrency"]}（models.json 已核对）；静态 BV，未预测2027BV',
                                 multiple=f'{x["pb"]:.2f}× PB（普通股 ROE-PB：(ROE−g)/(Ke−g)×(1−折减)，单一方法，未校准历史分位）',
                                 price=f'{usd(values[i])}（估值初稿）', change=chg(values[i], P), trigger=trig[i]))
            model = dict(method='roe-pb', source='models.json', bvps=md['bvps'], bvCurrency=md['bvCurrency'], ordinaryPerUsInstrument=md['ordinaryPerUsInstrument'],
                         usdPerReportCurrency=md['usdPerReportCurrency'], price=values)
            mult_note = '沿用 10-07 逐家核读的普通股 ROE-PB 草案（models.json）；方法单一、未预测 2027BV'
        elif not dps or dy < DIV_MIN:
            missing_reason = f'股息率法不适用：供应商股息率 {dy:.2f}% < {DIV_MIN:.0f}%，股息不是主要价值来源；PB–ROE 所需每 ADS 账面价值在供应商口径中币种 / ADS 比例错乱（priceToBook {q.get("priceToBook"):.2f}），不可核验'
        elif dy > DIV_MAX:
            missing_reason = f'供应商股息率 {dy:.2f}% > {DIV_MAX:.0f}%，可能含特别股息，未经公司公告核验，不硬算'
        elif abs(dps / q['regularMarketPrice'] * 100 / dy - 1) > 0.05:
            missing_reason = '供应商 dividendRate 与 dividendYield 不自洽，股息口径待核'
        else:
            dvals = [dps * kbear, dps, dps * kbull]
            ys = [ybear, ybase, ybull]
            values = [d / (y / 100) for d, y in zip(dvals, ys)]
            assumption = [f'股息较供应商前瞻年化股息 {usd(dps)}/ADS 下调 {(1 - kbear) * 100:.0f}% → {usd(dvals[0])}',
                          f'维持供应商前瞻年化股息 {usd(dps)}/ADS（dividendRate，现价股息率 {dy:.2f}%）',
                          f'股息上调 {(kbull - 1) * 100:.0f}% → {usd(dvals[2])}']
            for i in range(3):
                scen.append(dict(name=names[i], prob='[MISSING]（未赋概率）', assumption=assumption[i] + '；是否含特别股息未经公司公告核验',
                                 multiple=f'目标股息率 {ys[i]:.1f}%（{cname}股息率法假设，单一方法，未校准历史分位）',
                                 price=f'{usd(values[i])}（估值初稿）', change=chg(values[i], P), trigger=trig[i]))
            model = dict(method='div', dps=dps, dy=dy, dps3=dvals, yields=ys, price=values)
            mult_note = f'{cname}目标股息率 {ybear}/{ybase}/{ybull}% 为研究假设（成熟银行常见股息率区间；PB–ROE 因供应商账面价值口径错乱未采用）'

    if model is None:
        how = '持续盈利 PE 不适用' if loss else ('股息率法 / PB–ROE 输入不可核验' if method == 'div' else 'PE 输入不完整')
        for i, (a, t) in enumerate([(f'{missing_reason}；先核现金跑道、亏损来源与一次性项目' if loss else missing_reason, trig[0]),
                                    (f'先证明：{fo["watch"]}；至少连续两个季度盈利为正再重建情景' if loss else f'补齐一手财报的每 ADS 账面价值 / 股息政策后重建：{fo["watch"]}', trig[1]),
                                    (f'{fo["driver"]}兑现并转为可核实盈利与现金', trig[2])]):
            scen.append(dict(name=names[i], prob='[MISSING]（未赋概率）', assumption=a, multiple=how,
                             price='[MISSING]（未建立可核验价值）', change='[MISSING]', trigger=t))
        ratio_txt = f'[MISSING]：{missing_reason}'
        zone = '[MISSING]：未建立可核验价值，不给条件研究门槛。'
    else:
        bear, base, bull = model['price']
        if bear >= P:
            flags.append('悲观价 ≥ 现价，视为数据异常')
            ratio_txt = f'不可计算：悲观价 {usd(bear)} ≥ 现价 {usd(P)}，数据异常，评级封顶观察'
        elif P >= base:
            ratio_txt = f'不成立：现价 {usd(P)} ≥ 基准价 {usd(base)}'
        else:
            ratio = (base - P) / (P - bear)
            ratio_txt = f'(Base {base:.2f} − P {P:.2f}) ÷ (P {P:.2f} − Bear {bear:.2f}) = {ratio:.2f}:1'
        threshold = (base + 2 * bear) / 3
        model['threshold'] = threshold
        zone = f'条件研究门槛 P ≤ {usd(threshold)}，按 (Base+2×Bear)/3 反推；是研究假设，不是已认证买入区，悲观价不保证最大损失。'

    rating, capped = rate_ladder(valued and not loss, flags, ratio, cls)
    if loss and old != '等待证据':
        rating = '观察'  # 供应商 EPS 为负但 10-07 原件复核为观察：不机械判回避，待核读
    cap_reasons = []
    if loss and old != '等待证据':
        cap_reasons.append('loss-vendor-conflict')
    elif loss:
        cap_reasons.append('loss')
    elif model is None:
        cap_reasons.append('missing-value')
    else:
        if any('悲观价' in f for f in flags):
            cap_reasons.append('bear>=price')
        if any('悲观价' not in f for f in flags):
            cap_reasons.append('data-flag')
        if capped:
            cap_reasons.append(capped)
        if cls in CYCLICAL and not capped:
            cap_reasons.append('cyclical(no-effect)')
    ratio_line = f'现价 {usd(P)}；{ratio_txt}；未四舍五入计算；盈利 / 股息与倍数均为研究假设，不认证可交易赔率。'
    base_txt = f'基准 {scen[1]["price"].replace("（估值初稿）", "")}（{scen[1]["change"]}）' if model else '情景价 [MISSING]'
    why_rt = {'loss': 'TTM 亏损按规则回避（10-07 原件复核亦为等待证据）', 'loss-vendor-conflict': '供应商 EPS 为负但 10-07 原件复核为观察，口径冲突待核读，保留观察', 'missing-value': '未建立可核验价值，ratio 缺失'}.get(cap_reasons[0] if cap_reasons else '', '')
    if not why_rt:
        why_rt = CAP_TEXT[capped] if capped else ('数据不稳定标记' if flags else (f'赔率 {ratio:.2f}:1' if ratio is not None else ratio_txt))
    method_txt = ('普通股 ROE-PB 法' if model and model['method'] == 'roe-pb' else '股息率法') if method == 'div' else 'PE 法'
    headline = f'{rating}（估值初稿，未认证）：{judgment}；估值：{cname}类{method_txt}，{base_txt}；{why_rt}。仅为研究假设，不构成买卖建议。'

    x = [f'估值初稿（未认证）；{eps_src}。', price_src + '。', fx_note(fc) + f'；证券单位：{models[code]["instrument"]}。']
    if model:
        x.append(mult_note + ('；' + f'dcf-prefill fyh（FCF 收益率历史）now {prefill[code]["fyh"]["now"]}%、分位 {prefill[code]["fyh"]["pct"]}、中位 {prefill[code]["fyh"]["med"]}%（n={prefill[code]["fyh"]["n"]}），现 FCF 收益率低于历史中位' if code in prefill and prefill[code].get('fyh') else '；dcf-prefill 未覆盖该 ADR，无历史倍数分位校准') + '。')
    x.append('经营现金流：2026-10-07 notes.tsv 未见经营现金为负的披露，完整 OCF [MISSING]；cn-itucd 的「经营现金为负封顶观察」本轮无逐家输入，未触发。')
    if flags:
        x.append('数据不稳定标记（评级封顶观察）：' + '；'.join(flags) + '。')
    if capped:
        x.append('评级封顶说明：' + CAP_TEXT[capped] + '。')
    x.append(f'2026-10-07 事实复核评级「{old}」→ 本轮「{rating}」；事实层见 public/research/adr-2026-10-07/{code}.md，本覆盖层只改评级、结论、情景、赔率与纪律。')
    x.append(DISCLAIMER)
    invalid = (f'失效条件：{fo["risk"]}；或下一份财报使供应商前瞻 EPS / 股息下修超过悲观假设，需重算全部情景。' if model else
               f'失效条件：{missing_reason}；补齐可核验输入前不建立情景价。')

    lines = [f'@adr:{code}', f'rt: {rating}', f'h: {headline}']
    lines += [f's: {d["name"]}|{d["prob"]}|{d["assumption"]}|{d["multiple"]}|{d["price"]}|{d["change"]}|{d["trigger"]}' for d in scen]
    lines += [f'ratio: {ratio_line}', *[f'x: {t}' for t in x], f'z: {zone}', f'i: {invalid}']
    for ln in lines:
        assert '\n' not in ln and '`' not in ln and '${' not in ln, (code, ln)
    for d in scen:
        assert all('|' not in v for v in d.values()), code
    blocks.append('\n'.join(lines))
    records.append(dict(code=code, name=patches[code]['name'], cls=cls, cyclical=cls in CYCLICAL, method=('roe-pb' if model and model['method'] == 'roe-pb' else method), price=P, priceDate=s['date'],
                        financialCurrency=fc, epsTTM=eps_t, epsForward=eps_f, dividendRate=q.get('dividendRate'), dividendYield=q.get('dividendYield'),
                        loss=loss, flags=flags, model=model, ratio=ratio, rating=rating, oldRating=old, capped=capped, capReasons=cap_reasons,
                        missing=missing_reason))

TS.write_text('// 由 scripts/review-adr-valuation-2026-10-20.py 生成，勿手改。ADR 66 家估值初稿（未认证）覆盖层：只含 rt/h/s/ratio/x/z/i；SOFI 保留 sofi.ts。\n'
              'export const adrValuationDetails = `\n' + '\n'.join(blocks) + '\n`\n')

dist = Counter(r['rating'] for r in records)
old_dist = Counter(r['oldRating'] for r in records)
caps = Counter(c for r in records for c in r['capReasons'])
(OUT / 'valuation.json').write_text(json.dumps(dict(
    date=DATE, priceDate='2026-10-19', sources=dict(price='src/data/companyMarketSnapshot.json', vendor='public/' + YAHOO_FILE,
                                                    facts='public/research/adr-2026-10-07', prefill='public/data/dcf-prefill.json'),
    classes={k: dict(name=v[0], pe=list(v[1:4]), bearOff=v[5], cyclical=k in CYCLICAL) for k, v in CLS.items()},
    dividend=dict(name=DIV[0], yields=list(DIV[1:4]), dpsFactors=[DIV[4], 1, DIV[5]], minYield=DIV_MIN, maxYield=DIV_MAX),
    distribution=dict(sorted(dist.items())), oldDistribution=dict(sorted(old_dist.items())), capReasons=dict(sorted(caps.items())),
    companies=records), ensure_ascii=False, indent=1) + '\n')

buf = io.StringIO()
w = csv.writer(buf, lineterminator='\n')
w.writerow(['code', 'name', 'class', 'method', 'price', 'bear', 'base', 'bull', 'ratio', 'oldRating', 'rating', 'capReasons'])
for r in records:
    pr = r['model']['price'] if r['model'] else [None] * 3
    w.writerow([r['code'], r['name'], r['cls'], r['method'], f'{r["price"]:.2f}', *[f'{v:.2f}' if v is not None else '[MISSING]' for v in pr],
                f'{r["ratio"]:.2f}' if r['ratio'] is not None else '', r['oldRating'], r['rating'], ';'.join(r['capReasons'])])
(OUT / 'summary.csv').write_text(buf.getvalue())

readme = ['# ADR 估值初稿与评级分档（2026-10-20）', '',
          '估值初稿（未认证），仅为研究假设，不构成买卖建议。生成：`python3 scripts/review-adr-valuation-2026-10-20.py`（无联网、无时间戳，重跑输出不变）。', '',
          '## 方法', '',
          '- 覆盖 2026-10-07 ADR 事实复核的 66 家（public/research/adr-2026-10-07/previous.json）；SOFI 保留 src/data/details/sofi.ts 完整研究，不覆盖。',
          '- 价格：src/data/companyMarketSnapshot.json `adr:<代码>` 的 price（2026-10-19 腾讯延迟行情）。',
          f'- 盈利基数：{YAHOO_FILE}（snapshot 的 valuationSource）中的 epsTrailingTwelveMonths / epsForward，即供应商 PE 反推的每 ADS 美元 EPS，非公司指引、非一手财报。2026-10-07 input.json 的 quotes 没有 forwardEps 字段，也没有 filings 字段（经 coordinator 确认改用此源）。',
          '- PE 法：与 cn-itucd 相同，EPS = TTM × [max(0.15, 1+(g−off)), 1+g, 1+g+20%]，g 为供应商前瞻相对 TTM 的增速（基准 EPS = epsForward）；价格 = EPS × 类别 PE。',
          f'- 银行 / 券商：股息率法，DPS = 供应商 dividendRate × [{DIV[4]}, 1, {DIV[5]}]，目标股息率 {DIV[1]}/{DIV[2]}/{DIV[3]}%；股息率 <{DIV_MIN:.0f}%（不适用）或 >{DIV_MAX:.0f}%（可能含特别股息）记 [MISSING]。PB–ROE 未用：供应商每 ADS 账面价值口径错乱。',
          '- 赔率 = (Base − P) ÷ (P − Bear)，仅在 Bear < P < Base 时计算；评级阶梯逐条照搬 scripts/review-cn-itucd-2026-10-07.py 214–236 行；TTM 亏损统一「回避」。',
          '- 数据不稳定标记：前瞻 / TTM EPS 比值超出 [0.5, 3]、供应商 PE 与 EPS 不自洽、腾讯与 Yahoo 价差 >3%、悲观价 ≥ 现价。',
          '', '## 评级分布', '', '| 评级 | 本轮 | 2026-10-07 |', '| --- | --- | --- |']
for k in sorted(set(dist) | set(old_dist)):
    readme.append(f'| {k} | {dist.get(k, 0)} | {old_dist.get(k, 0)} |')
readme += ['', '## 封顶 / 降级原因', '', '| 原因 | 家数 |', '| --- | --- |'] + [f'| {k} | {v} |' for k, v in sorted(caps.items())]
readme += ['', '逐家明细见 summary.csv 与 valuation.json。']
(OUT / 'README.md').write_text('\n'.join(readme) + '\n')

print('ratings', dict(sorted(dist.items())), 'old', dict(sorted(old_dist.items())))
print('caps', dict(sorted(caps.items())))
