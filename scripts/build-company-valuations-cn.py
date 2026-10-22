#!/usr/bin/env python3
"""Batch conditional draft for comprehensive equity valuation: CN universe (A股).

Reads a .local research universe export plus repo evidence (price snapshot, Yahoo batch quotes,
Lynch growth, DCF prefill) and writes schema-v1 records for the comprehensive-equity-valuation skill.

Everything here is programmatic: review.mode is always 'programmatic', so no record can claim 'reviewed'.
Primary anchor follows the company's own research scenario type (not re-estimated):
  - 金融 companies whose research scenarios are 稳态PB-based → PB = Yahoo 原始 BVPS × 研究 PB 三元组;
  - other companies with explicit PE triplets → PE = Yahoo 前瞻 EPS（一致预期） × 研究 PE 三元组, published as
  kind='undated' (date=null): the forward EPS is not bound to a fiscal year and the research multiples are
  calibrated on 2027 normalized profit, so the result is a recomputable conditional sensitivity, not a
  certified present value (coordinator hard acceptance condition, aligned with US/HK).
Companies whose research multiples were withdrawn ([MISSING] / "持续盈利 PE 不适用") get status
'insufficient' with value=null — no target multiple is invented to fill coverage. The 29 banks whose
稳态PB model the original research explicitly withdrew (ratioNote: 本轮不认证赔率，不恢复原模型) are also
'insufficient': value AND method.values are null; the ROE/g/Ke assumptions stay in inputs/expectations
for re-estimation traceability. Nothing is back-solved from price / PE, and no old scenario price is
copied: every published number is recomputable from the disclosed method inputs (self-asserted in
verify_record, generation aborts on any mismatch). Quotes with marketRefresh.tradability=unverified
are not treated as current prices (coordinator instruction).

Usage:
  python3 scripts/build-company-valuations-cn.py \
      --universe public/research/comprehensive-valuation-2026-10-22/universe-cn.json \
      --as-of 2026-10-22 --output public/data/company-valuations/cn.json
"""
import argparse
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SNAPSHOT = REPO / 'src/data/companyMarketSnapshot.json'
YAHOO = REPO / 'public/research/data-refresh-2026-10-20/yahoo-quote-batch.json'
LYNCH = REPO / 'public/data/lynch.json'
DCF_PREFILL = REPO / 'public/data/dcf-prefill.json'

SCENARIO_ORDER = {'悲观': 'low', '基准': 'base', '乐观': 'high'}
PE_TRIPLET = re.compile(r'([\d.]+)\s*×\s*PE')
PB_TRIPLET = re.compile(r'=\s*([\d.]+)\s*×')  # 稳态PB=(ROE−g)/(Ke−g)=0.700×
RESEARCH_EPS = re.compile(r'正常化归母利润\s*([\d.]+)\s*亿元[^×]*?÷参考股数\s*([\d.]+)\s*亿股')
RESEARCH_BVPS = re.compile(r'普通股BVPS\s*([\d.]+)\s*元')

PB_APPLICABLE_SECTORS = {'金融', '房地产', '公用事业', '能源', '原材料', '化工', '新材料', '工业',
                         '新能源汽车', '自动驾驶', '机器人链', '工程机械', 'AI 算力', '高盛增持'}
PB_NOT_APPLICABLE_SECTORS = {'信息技术', '医药卫生', '通信服务', '可选消费', '主要消费'}
PB_CONTEXT = {
    '金融': '银行/保险以稳态PB=(ROE−g)/(CoE−g)为锚，证券与控股层需母公司NAV折价桥接；目标PB须同口径ROE与股权成本依据',
    '房地产': '资产型（开发物业与投资性房地产），账面值有约束力但重估与减值缺口大；NAV桥接未闭合前不给目标PB',
    '公用事业': '受监管资产型，账面值有约束力；目标PB缺受监管回报率同口径依据，未计值',
    '能源': '资源与资产型，账面值受油价/煤价/周期影响大；目标PB缺中周期ROE依据，未计值',
    '原材料': '周期资产型；目标PB需中周期ROE依据，原研究未给出，未计值',
    '化工': '周期资产型（资本密集产能）；目标PB需中周期ROE依据，未计值',
    '新材料': '材料产能资产型；目标PB需中周期ROE依据，未计值',
    '工业': '资产与产能型；旧盈利模型已撤回，目标PB缺可持续ROE依据，未计值',
    '新能源汽车': '整车/零部件制造，账面值有参照但技术迭代与产能利用率扰动大；目标PB未计值',
    '自动驾驶': '汽车零部件制造，账面值有参照；目标PB缺同口径ROE依据，未计值',
    '机器人链': '设备与零部件制造，账面值有参照；目标PB缺同口径ROE依据，未计值',
    '工程机械': '重资产制造，账面值有参照；目标PB缺同口径ROE依据，未计值',
    'AI 算力': '硬件制造（服务器/光模块/IDC），资本开支重；账面值有参照但折旧与迭代快，目标PB未计值',
    '高盛增持': '该标签为研究批次非行业；按底层业务（工程/资源/半导体制造）账面值有一定约束力，目标PB未计值',
}
PB_NOT_APPLICABLE_CONTEXT = {
    '信息技术': '轻资产（软件/芯片设计/Fabless），研发与人力资本不在账面，账面值约束弱；不以PB定价',
    '医药卫生': '研发管线与品牌主导，账面值约束弱；不以PB定价',
    '可选消费': '品牌/渠道/并购商誉主导，账面值约束弱；不以PB定价',
    '主要消费': '品牌与定价权主导，账面值约束弱；不以PB定价',
    '通信服务': '运营商/内容资产摊销与商誉占比高；除运营商外账面值约束弱，不以PB定价',
}


def load_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def num(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def r2(value):
    return round(value, 2)


def pct(value):
    return f'{value * 100:+.1f}%'


def yahoo_symbol(code):
    return f'{code}.SS' if code.startswith('6') else f'{code}.SZ'


def parse_triplet(scenarios, pattern):
    """Return {low, base, high} multiples parsed from research scenario texts, or None if incomplete."""
    found, notes = {}, []
    for scenario in scenarios or []:
        name = scenario.get('name')
        if name not in SCENARIO_ORDER:
            continue
        text = scenario.get('multiple') or ''
        match = pattern.search(text)
        if match:
            found[SCENARIO_ORDER[name]] = float(match.group(1))
        else:
            notes.append(f'{name} 倍数未解析（{text[:30] or "空"}）')
    if len(found) != 3:
        return None, notes
    triplet = {k: found[k] for k in ['low', 'base', 'high']}
    if not (triplet['low'] <= triplet['base'] <= triplet['high']):
        return None, notes + ['三元组非单调']
    return triplet, notes


def parse_research_eps(scenarios):
    """Research scenario implied EPS（正常化归母利润亿元 ÷ 参考股数亿股 = 元）, for divergence disclosure."""
    found = {'low': None, 'base': None, 'high': None}
    for scenario in scenarios or []:
        key = SCENARIO_ORDER.get(scenario.get('name'))
        if not key:
            continue
        match = RESEARCH_EPS.search(scenario.get('assumption') or '')
        if match:
            profit_yi, shares_yi = float(match.group(1)), float(match.group(2))
            if shares_yi > 0:
                found[key] = round(profit_yi / shares_yi, 2)
    return found


def parse_research_bvps(scenarios):
    for scenario in scenarios or []:
        match = RESEARCH_BVPS.search(scenario.get('assumption') or '')
        if match:
            return float(match.group(1))
    return None


def research_date(entry):
    batch = entry.get('batch') or ''
    match = re.match(r'(\d{4}-\d{2}-\d{2})', batch)
    if match:
        return match.group(1)
    match = re.search(r'(\d{4}-\d{2}-\d{2})', entry.get('asOf') or '')
    return match.group(1) if match else '2026-10-07'


def short(items, n=2):
    return '；'.join(str(x) for x in (items or [])[:n] if x)


def build_record(entry, asof, snapshot, yahoo, yahoo_checked, lynch, dcf):
    market, code = entry['market'], entry['code']
    name, sector = entry['name'], entry['sector']
    key = f'{market}:{code}'
    quote = yahoo.get(yahoo_symbol(code)) or {}
    snap = snapshot.get(key)
    lyn = lynch.get(key)
    dcf_row = dcf.get(code)
    tradability = (entry.get('marketRefresh') or {}).get('tradability')
    ratio_note = entry.get('ratioNote') or ''
    withdrawn = '撤回' in ratio_note or '已暂停' in ratio_note

    sources = []
    if snap:
        sources.append({'id': 'snap-cn', 'title': 'companyMarketSnapshot 价格锚点（腾讯延迟行情，供应商最后报价，非交易所认证收盘）',
                        'url': 'src/data/companyMarketSnapshot.json', 'asOf': snap.get('date') or '2026-10-20'})
    if quote:
        sources.append({'id': 'yahoo-batch', 'title': 'Yahoo 批量报价（原始 trailingEps/forwardEps/bookValue、前瞻一致预期、价格交叉核对）',
                        'url': 'public/research/data-refresh-2026-10-20/yahoo-quote-batch.json',
                        'asOf': yahoo_checked})
    sources.append({'id': 'research-cn', 'title': '原研究公司导出（情景倍数、评级与四维证据，未重估；cn 口径；公开归档底稿）',
                    'url': 'research/comprehensive-valuation-2026-10-22/universe-cn.json', 'asOf': research_date(entry)})
    if lyn:
        sources.append({'id': 'lynch', 'title': 'Lynch 分类与增速（原研究；PE 行情字段 2026-10-20 核验，分类未按新报表重认证）',
                        'url': 'public/data/lynch.json', 'asOf': '2026-10-20'})
    if dcf_row:
        sources.append({'id': 'dcf-prefill', 'title': 'DCF 预填库（东财多年财报原值：收入/经营现金流/资本开支，交叉核对口径）',
                        'url': 'public/data/dcf-prefill.json', 'asOf': dcf_row.get('at') or '2026-10-20'})
    source_ids = {s['id'] for s in sources}

    # ---- price: snapshot first; unverified tradability is not treated as a current price
    price_value, price_date, price_source = None, None, None
    yahoo_price = quote.get('regularMarketPrice')
    if tradability == 'unverified':
        pass  # 换股/终止上市流程等，疑似行情不作为现价（协调者口径）
    elif snap and num(snap.get('price')) and snap['price'] > 0:
        price_value, price_date, price_source = snap['price'], snap['date'], 'snap-cn'
    elif num(yahoo_price) and yahoo_price > 0:
        price_value, price_date, price_source = yahoo_price, yahoo_checked, 'yahoo-batch'
    price_gap = None
    if snap and num(yahoo_price) and yahoo_price > 0 and price_value:
        price_gap = abs(price_value / yahoo_price - 1)

    eps_ttm = quote.get('epsTrailingTwelveMonths')
    eps_fwd = quote.get('epsForward')
    book = quote.get('bookValue')
    currency = quote.get('currency') or 'CNY'
    scenarios = entry.get('scenarios') or []

    # ---- research triplets (company's own anchor type, not re-estimated)
    is_pb_research = any('PB' in (s.get('multiple') or '') for s in scenarios)
    pb_triplet, pb_notes = parse_triplet(scenarios, PB_TRIPLET) if is_pb_research else (None, [])
    pe_triplet, pe_notes = parse_triplet(scenarios, PE_TRIPLET)
    research_eps = parse_research_eps(scenarios)
    research_bvps = parse_research_bvps(scenarios)

    assumptions, missing = [], []
    methods = []
    has_price = price_value is not None
    eps_ok = num(eps_ttm) and eps_ttm > 0 and num(eps_fwd) and eps_fwd > 0
    book_ok = num(book) and book > 0

    # ---- PE
    pe_values = None
    pe_refs = [i for i in ['yahoo-batch', 'research-cn'] if i in source_ids]
    pe_inputs = {
        'epsTrailingTwelveMonths': eps_ttm,
        'epsForward': eps_fwd,
        'researchMultiples': pe_triplet,
        'researchScenarioEPS': research_eps,
        'yahooTrailingPE': quote.get('trailingPE'),
        'yahooForwardPE': quote.get('forwardPE'),
        'priceUsed': price_value,
    }
    if dcf_row and num(dcf_row.get('ni')) and num(dcf_row.get('shares')) and dcf_row['shares'] > 0:
        pe_inputs['dcfPrefillAnnualEPS'] = r2(dcf_row['ni'] / dcf_row['shares'])
        pe_inputs['dcfPrefillFY'] = dcf_row.get('fy')
    if dcf_row and dcf_row.get('fyh') and isinstance(dcf_row['fyh'], dict):
        pe_inputs['dcfPrefillFcfYieldMedianPct'] = dcf_row['fyh'].get('med')
    if is_pb_research:
        pe_reason = ('研究锚为稳态PB而非PE；不拼接 PB 倍数到 PE。'
                     + (f' TTM EPS {eps_ttm:.2f} 为正，PE 可作辅锚敏感性，但无同口径研究PE倍数，未计值。' if eps_ok else
                        ' 供应商 EPS 非正或缺失，PE 不适用。'))
    elif not has_price:
        pe_reason = '无价格，无法比较'
    elif not eps_ok:
        reason = ('TTM 或前瞻 EPS 非正/缺失（供应商口径）' if num(eps_ttm) or num(eps_fwd) else '供应商无 EPS')
        if pe_triplet is None:
            reason += '；且研究情景倍数缺失/非单调（正常化利润、现金或NAV/EV桥接未闭合）'
        pe_reason = reason + '；PE 不适用，不以价格÷PE 倒推 EPS，不以异期分母硬算'
    elif pe_triplet is None:
        withdrawn = any('不适用' in (s.get('multiple') or '') for s in scenarios)
        if withdrawn:
            pe_reason = '原研究明确持续盈利 PE 不适用（亏损/微利或 PS/NAV 口径待核），PE 不作数值锚'
        else:
            pe_reason = '研究情景倍数缺失或非单调（正常化利润/现金或NAV/EV桥接未闭合，旧盈利模型已撤回），PE 主锚未计值'
    else:
        ref = max([v for v in (eps_ttm, research_eps.get('base')) if num(v) and v > 0] or [0])
        fwd_ratio = (eps_fwd / ref) if ref > 0 else None
        if fwd_ratio and fwd_ratio > 10:
            pe_reason = (f'前瞻一致预期 EPS {eps_fwd:.2f} 元为 TTM（{eps_ttm:.2f}）/研究基准（{research_eps.get("base")}）'
                         f'的 {fwd_ratio:.0f}×，疑似低基数爆发或供应商 forward 口径异常，不机械应用，待核公司披露')
        else:
            pe_values = [r2(eps_fwd * pe_triplet[k]) for k in ['low', 'base', 'high']]
            pe_reason = (f'盈利为正（TTM {eps_ttm:.2f}、前瞻 {eps_fwd:.2f} 元），PE 适用；'
                         f'倍数沿用原研究情景（悲观/基准/乐观 {pe_triplet["low"]:g}×/{pe_triplet["base"]:g}×/{pe_triplet["high"]:g}×，未重估）')
            if fwd_ratio and fwd_ratio > 3:
                pe_reason += f'；前瞻 EPS 为 TTM/研究基准的 {fwd_ratio:.1f}×（低基数/复苏口径），结果对共识高度敏感'
            if has_price and abs(pe_triplet['base'] - (price_value / eps_fwd)) / pe_triplet['base'] < 0.01:
                pe_reason += '；注意：基准倍数与现价前瞻 PE 几乎相同，结论近似现价，不构成独立估值'
    methods.append({
        'name': 'PE', 'applicable': bool(eps_ok and has_price), 'reason': pe_reason,
        'formula': '前瞻 EPS（供应商一致预期）× 研究情景 PE（悲观/基准/乐观）',
        'inputs': pe_inputs, 'values': pe_values, 'sourceIds': pe_refs,
    })

    # ---- PEG
    growth = lyn.get('g') if lyn else None
    peg_applicable = bool(eps_ok and has_price and num(growth) and 0 < growth <= 40)
    if lyn is None:
        peg_reason = '缺增速来源（Lynch 未覆盖），PEG 不适用'
    elif not num(growth):
        peg_reason = 'Lynch 覆盖但无有效增速值，PEG 不适用'
    elif growth <= 0:
        peg_reason = f'利润增速 {growth:g}%（Lynch 研究口径）为零或负，PEG 不适用'
    elif growth > 40:
        peg_reason = f'增速 {growth:g}% 过高，可能来自低基数/一次性/周期顶部，不机械应用 PEG'
    else:
        peg_reason = (f'利润增速 {growth:g}%（Lynch 研究口径，非独立一致预期）；PEG 与 PE 共享增长假设，'
                      f'不算两份独立证据；目标 PEG 无同口径依据，未计值')
    methods.append({
        'name': 'PEG', 'applicable': peg_applicable, 'reason': peg_reason,
        'formula': 'PE ÷ EPS 增长率百分数（如 20% 填 20）；目标价=EPS × 目标 PEG × 增长百分数',
        'inputs': {'growthPercent': growth, 'yahooForwardPE': quote.get('forwardPE'),
                   'currentForwardPEComputed': r2(price_value / eps_fwd) if has_price and eps_ok else None},
        'values': None, 'sourceIds': ['lynch'] if lyn else [],
    })

    # ---- PB
    pb_values = None
    pb_refs = [i for i in ['yahoo-batch', 'research-cn'] if i in source_ids]
    pb_inputs = {'bookValuePerShare': book, 'yahooPriceToBook': quote.get('priceToBook'),
                 'researchMultiples': pb_triplet,
                 'researchBvpSubstitute': research_bvps, 'currency': currency}
    if sector in PB_NOT_APPLICABLE_SECTORS:
        pb_applicable, pb_reason = False, PB_NOT_APPLICABLE_CONTEXT[sector]
    elif not book_ok:
        pb_applicable, pb_reason = False, ('账面权益非正或供应商无 BVPS，PB 不适用'
                                           if num(book) else '供应商无账面每股值，PB 不适用')
    elif sector in PB_APPLICABLE_SECTORS:
        pb_applicable = True
        if is_pb_research and pb_triplet:
            if withdrawn:
                # 原研究已撤回/暂停该模型：保留假设留痕，一律不计值、不复活（协调者修正口径）
                pb_reason = (f'原研究稳态PB模型已撤回/暂停（ratioNote：本轮不认证赔率，刷新行情不恢复原模型）；'
                             f'三元组 {pb_triplet["low"]:g}×/{pb_triplet["base"]:g}×/{pb_triplet["high"]:g}× 仅为已撤回模型的 ROE/g/Ke 假设留痕（见 inputs），'
                             f'不得复用为估值；待重估 ROE/g/Ke 或改用 EV/NBV 专用模型后再计值')
            else:
                pb_values = [r2(book * pb_triplet[k]) for k in ['low', 'base', 'high']]
                pb_reason = (f'金融/资产型，PB 主锚；BVPS {book:.2f} 元（供应商原始字段）× 研究稳态PB '
                             f'{pb_triplet["low"]:g}×/{pb_triplet["base"]:g}×/{pb_triplet["high"]:g}×（由原研究 ROE/g/Ke 假设推出，未重估）')
            if research_bvps and abs(research_bvps - book) / research_bvps > 0.05:
                assumptions.append(f'BVPS 口径差：原研究以 H1 普通股BVPS {research_bvps:g} 元暂代，供应商 bookValue {book:.2f} 元，相差 {pct(book / research_bvps - 1)}')
        else:
            pb_reason = PB_CONTEXT.get(sector, '资产型，账面值有参照；目标PB缺同口径依据，未计值')
            if not is_pb_research and pe_triplet is None and sector in ('金融',):
                pb_reason = '控股层/证券业务 PB 需母公司NAV折价桥接，原研究未闭合，未计值'
    else:
        pb_applicable, pb_reason = False, f'行业（{sector}）未归类，PB 辅锚未评估计值'
    methods.append({
        'name': 'PB', 'applicable': pb_applicable, 'reason': pb_reason,
        'formula': '普通股 BVPS × 合理 PB（银行/保险用稳态PB=(ROE−g)/(CoE−g)，须有同口径依据）',
        'inputs': pb_inputs, 'values': pb_values, 'sourceIds': pb_refs,
    })

    # ---- DCF（辅锚：只评估适用性与缺项，无逐家依据不计值）
    dcf_refs = [i for i in ['dcf-prefill'] if i in source_ids]
    fin_row = sector == '金融' or bool(dcf_row and dcf_row.get('fin'))
    years_data, fcf_pos_years = 0, 0
    for y in (dcf_row or {}).get('years') or []:
        ocf, capex = y[2], y[3]
        if num(ocf) and num(capex):
            years_data += 1
            if (ocf - capex) > 0:
                fcf_pos_years += 1
    if fin_row:
        dcf_applicable = False
        dcf_reason = ('金融企业（银行/保险/券商）FCFF/FCFE 框架不适用：资本即原料，自由现金流无经济意义；'
                      '应改 EV/NBV 或剩余收益专用模型；dcf-prefill 金融行表面原值不构成 DCF 输入')
    elif not dcf_row:
        dcf_applicable = False
        dcf_reason = 'dcf-prefill 未覆盖（cn 832 家中仅 300 家），缺多年收入/经营现金流/资本开支原值，无法构建可复算 DCF'
    elif years_data < 3:
        dcf_applicable = False
        dcf_reason = f'dcf-prefill 现金流原值不足（仅 {years_data} 年 OCF/资本开支成对），无法构建可复算 DCF'
    else:
        dcf_applicable = True
        beta_txt = f'，β {dcf_row["beta"]:g}' if num(dcf_row.get('beta')) else ''
        dcf_reason = (f'dcf-prefill 有 {years_data} 年 OCF/资本开支原值{beta_txt}（其中 {fcf_pos_years} 年简式FCF为正），'
                      '数据可支撑 FCFF/FCFE 构建；但本轮无逐家依据的显性期增长、再投资率、利润率路径与 WACC/Ke 假设'
                      '（不硬设统一折现率与永续增长），故只评估适用性、不计值')
    methods.append({
        'name': 'DCF', 'applicable': dcf_applicable, 'reason': dcf_reason,
        'formula': 'FCFF/WACC 或 FCFE/股权成本：显式期增长+利润率+再投资+税+终值（终值增长配再投资）+净债务/少数权益桥',
        'inputs': {'covered': bool(dcf_row), 'ocfCapexYears': years_data, 'simpleFcfPositiveYears': fcf_pos_years,
                   'beta': (dcf_row or {}).get('beta'), 'fcfYieldMedianPct': ((dcf_row or {}).get('fyh') or {}).get('med') if isinstance((dcf_row or {}).get('fyh'), dict) else None},
        'values': None, 'sourceIds': dcf_refs,
    })

    # ---- SOTP/行业锚（辅锚：控股层/多元业务/NAV 情形评估，桥接未闭合不计值）
    sotp_hints = any(('NAV' in (s.get('multiple') or '') or 'EV桥接' in (s.get('multiple') or '') or 'NAV' in (s.get('assumption') or ''))
                     for s in scenarios)
    sotp_relevant = sector in ('工业', '房地产', '金融', '高盛增持') or sotp_hints
    segments = [seg.get('name') for seg in (entry.get('segments') or []) if isinstance(seg, dict) and seg.get('name')]
    if is_pb_research and sector == '金融':
        sotp_applicable = False
        sotp_reason = '单一银行主体，金融专用估值框架（稳态PB/EV-NBV）优先；SOTP 无额外依据'
    elif sotp_relevant:
        sotp_applicable = True
        sotp_reason = ('存在控股层/多元业务/资产重估情形，SOTP/NAV 行业锚原则上适用；'
                       '但分部价值、少数股东权益、母公司现金与控股折价桥接未闭合（原研究注明），无依据不计值')
    else:
        sotp_applicable = False
        sotp_reason = '未见需分部加总的控股折价/多元资产证据；SOTP 无额外依据，不硬凑 NAV'
    methods.append({
        'name': 'SOTP', 'applicable': sotp_applicable, 'reason': sotp_reason,
        'formula': '各分部适用价值（PE/PB/NAV/中周期）→ 一次股权桥：扣总部成本与亏损业务投入，不重复扣债/加现金',
        'inputs': {'segmentsFromResearch': segments, 'bridgeClosed': False},
        'values': None, 'sourceIds': ['research-cn'],
    })

    # ---- record-level value: primary anchor = company's own research type
    value, status, comparison, primary = None, 'insufficient', None, None
    if is_pb_research and pb_values and has_price:
        primary, value, status = 'PB', {
            'low': pb_values[0], 'base': pb_values[1], 'high': pb_values[2],
            'kind': 'present', 'date': asof, 'primaryMethod': 'PB'}, 'conditional'
    elif pe_values and has_price:
        primary, value, status = 'PE', {
            'low': pe_values[0], 'base': pe_values[1], 'high': pe_values[2],
            'kind': 'undated', 'date': None, 'primaryMethod': 'PE'}, 'conditional'
    if status == 'conditional':
        comparison = {
            'label': '期限未定义条件敏感性（估值 / 现价 − 1），非今日内在价值判断', 'priceValue': price_value,
            'priceDate': price_date,
            'low': round(value['low'] / price_value - 1, 4), 'base': round(value['base'] / price_value - 1, 4),
            'high': round(value['high'] / price_value - 1, 4),
        }
    else:
        rec_missing = []
        if tradability == 'unverified':
            rec_missing.append('可交易性未认证（换股/终止上市流程），供应商疑似行情不作为现价')
        elif not has_price:
            rec_missing.append('无可用现价')
        if is_pb_research:
            if withdrawn:
                rec_missing.append('原研究已撤回稳态PB模型（本轮不认证赔率，不恢复原模型）：PB 主锚不得复用撤回数值，'
                                   'value 与 method.values 均置空；待重估 ROE/g/Ke 或改用 EV/NBV 专用模型')
            elif not pb_values:
                rec_missing.append('PB 主锚未计值：BVPS 缺失/非正或研究稳态PB三元组不完整')
        else:
            if pe_triplet is None:
                rec_missing.append('PE 主锚未计值：' + ('原研究明确持续盈利PE不适用（PS/NAV 输入待核）'
                                     if any('不适用' in (s.get('multiple') or '') for s in scenarios)
                                     else '研究倍数缺失/非单调（正常化利润、现金或NAV/EV桥接未闭合，旧模型已撤回）'))
            elif not eps_ok:
                rec_missing.append('PE 分母缺失：供应商 TTM/前瞻 EPS 非正或缺失，无同口径正常化盈利')
            else:
                rec_missing.append('PE 分母疑似异常：前瞻一致预期 EPS 与 TTM/研究基准背离超 10×，待核供应商 forward 口径与公司披露')
        missing.extend(rec_missing)

    # ---- disclosures
    if price_gap is not None and price_gap > 0.005:
        assumptions.append(f'快照价与 Yahoo 批量价相差 {price_gap:.2%}，以快照价为准')
    if num(quote.get('trailingPE')) and has_price and num(eps_ttm) and eps_ttm > 0:
        implied = price_value / eps_ttm
        if abs(implied / quote['trailingPE'] - 1) > 0.05:
            assumptions.append(f'Yahoo TTM PE {quote["trailingPE"]:.2f} 与现价÷TTM EPS {implied:.2f} 相差超 5%，EPS 口径待核')
    if primary == 'PE':
        assumptions.append(f'PE 倍数取原研究情景（{pe_triplet["low"]:g}×/{pe_triplet["base"]:g}×/{pe_triplet["high"]:g}×，未重估，研究假设）')
        assumptions.append(f'分母为 Yahoo 前瞻 EPS（{eps_fwd:.2f} 元，一致预期口径，待与公司披露核对），非价格÷PE 倒推；前瞻 EPS 未绑定财年、研究倍数按 2027 正常化利润校准，兑现期限未定义，故 kind=undated 仅作可复算条件敏感性，不认证今日内在价值，未折现、不报年化')
        assumptions.append('悲观/乐观仅改变倍数，EPS 不变（不等于原研究 EPS 与倍数同时下修/上修情景）')
        if research_eps['base'] and num(eps_fwd):
            assumptions.append(f'方法分歧：原研究基准 EPS 假设 {research_eps["base"]:g} 元（2027 正常化归母利润÷参考股数，未重估）与前瞻一致预期 {eps_fwd:.2f} 元相差 {pct(eps_fwd / research_eps["base"] - 1)}；本批次采用一致预期口径')
    if is_pb_research:
        if primary == 'PB':
            assumptions.append(f'BVPS 取供应商原始 bookValue（{book:.2f} 元，{currency}），稳态PB三元组沿用原研究 ROE/g/Ke 假设（未重估）')
            assumptions.append('原研究三情景 PB 敏感性为未认证草案（"未校准历史分位"），基准情形含账面折价假设，悲观价不托底')
        if withdrawn:
            assumptions.append('原研究 ratioNote 声明：旧盈利模型已撤回／暂停使用，本轮不认证赔率，刷新行情不恢复原模型；'
                               '本记录不复活该模型：value 与 method.values 均置空，仅保留 ROE/g/Ke 假设与三元组于 inputs/expectations 供重估追溯')
    if not is_pb_research and pe_triplet is None and scenarios:
        assumptions.append('原研究三情景为经营情景（倍数[MISSING]或PE不适用），旧盈利模型已撤回／暂停，未认证为数值估值')
    assumptions.append('价格 ' + (f'{price_value} 元（{price_date}，腾讯延迟行情供应商最后报价，非交易所认证收盘）' if has_price else '缺失（可交易性未认证或无价）'))
    missing.append('一手财报与公司公告未在本批次逐家重读（仅供应商 TTM/前瞻 EPS、BVPS 与原研究导出）')
    if dcf_applicable:
        missing.append('DCF 辅锚未计值：缺逐家依据的显性期增长/再投资率/WACC-Ke 假设（不硬设统一折现率与永续增长）')
    else:
        missing.append('DCF 辅锚不适用或未覆盖：' + dcf_reason[:60])
    if sotp_relevant:
        missing.append('SOTP/NAV 行业锚未计值：分部价值、少数股东、母公司现金与控股折价桥接未闭合，输入待核')
    if primary == 'PE' and pb_applicable:
        missing.append('PB 目标倍数缺同口径 ROE/股权成本依据（辅锚未计值）')
    if primary == 'PE':
        missing.append('PE 为期限未定义敏感性：前瞻 EPS 未绑定财年、研究倍数针对 2027 正常化利润，未折现、未绑定兑现日，'
                       '不认证今日内在价值；要转 present 须先锁定同口径正常化盈利与目标倍数依据')

    quality_parts = [entry.get('certainty') or '', short(entry.get('pros'), 1), short(entry.get('moat'), 1)]
    quality = '原研究口径（未重核）：' + '；'.join(p for p in quality_parts if p) if any(quality_parts) else '原研究无质量证据，缺项'
    if primary == 'PB':
        pricing = (f'现价 {price_value} 元（{price_date}）；PB 主锚：BVPS {book:.2f} × 稳态PB {pb_triplet["low"]:g}/{pb_triplet["base"]:g}/{pb_triplet["high"]:g} → '
                   f'{pb_values[0]}/{pb_values[1]}/{pb_values[2]} 元，相对现价 {pct(pb_values[1] / price_value - 1)}（基准）；'
                   f'PE：{"适用（辅锚，TTM " + format(eps_ttm, ".2f") + " 元）" if eps_ok else pe_reason}；PEG：{peg_reason}')
    elif primary == 'PE':
        pricing = (f'现价 {price_value} 元（{price_date}）；PE 期限未定义敏感性（kind=undated）：前瞻 EPS {eps_fwd:.2f} × 研究倍数 → '
                   f'{pe_values[0]}/{pe_values[1]}/{pe_values[2]} 元，对现价的机械差额 {pct(pe_values[1] / price_value - 1)}（基准，非今日内在价值、非低估结论）；'
                   f'PEG：{"适用但与 PE 共享增长假设" if peg_applicable else peg_reason}；PB：{"适用但缺目标倍数" if pb_applicable else pb_reason}')
    else:
        pricing = (f'现价 {price_value if has_price else "缺失"}（{price_date or "无日期"}）；'
                   f'PE 不作数值锚：{pe_reason}；PEG：{peg_reason}；PB：{pb_reason}')
    expectations = (f'前瞻 EPS 一致预期 {eps_fwd:.2f} 元（供应商口径）' if num(eps_fwd) else '前瞻 EPS 缺失')
    if is_pb_research:
        expectations += f'；原研究稳态PB假设（ROE/g/Ke，未重估）：{short([s.get("assumption") for s in scenarios], 1)}'
    expectations += f'；验证节点：{short(entry.get("calendar"), 1) or "原研究未列"}；持续期：{entry.get("duration") or "原研究未列"}'
    risk_items = [short(entry.get('risk'), 2), short(entry.get('cons'), 1)]
    tail = ''
    if value and has_price:
        tail = f'；压力：悲观价 {value["low"]} 元相对现价 {pct(value["low"] / price_value - 1)}，为倍数/假设压缩情景而非下限，另需检融资、摊薄与股权归零'
    risk = '；'.join(p for p in risk_items if p) + tail
    if not risk.strip('；'):
        risk = '原研究未列明风险，缺项'

    discipline = entry.get('discipline') or {}
    rec = {
        'key': key, 'market': market, 'code': code, 'name': name, 'sector': sector,
        'currency': currency, 'asOf': asof,
        'price': {'value': price_value, 'date': price_date, 'currency': currency, 'source': price_source},
        'status': status, 'value': value, 'comparison': comparison,
        'methods': methods,
        'quality': quality, 'pricing': pricing, 'expectations': expectations, 'risk': risk,
        'assumptions': assumptions, 'missing': missing,
        'sources': sources,
        'review': {'mode': 'programmatic', 'by': 'scripts/build-company-valuations-cn.py（Orca 批量脚本）',
                   'note': ('程序化条件初稿：研究倍数未重估，财务分母取供应商原始 EPS/BVPS；未逐家重读财报，不得标已复核；'
                            + ('银行稳态PB模型原研究已撤回，本记录不复活该模型：value 与 method.values 均置空，仅留假设追溯。' if (is_pb_research and withdrawn)
                               else ''))},
        'legacy': {'rating': entry.get('rating') or '', 'headline': entry.get('headline') or '',
                   'discipline': discipline.get('zone') or '',
                   'note': '旧研究评级与旧价格纪律区（旧价口径，仅作历史参考），未随本轮价格静默改写'},
    }
    if status == 'insufficient':
        rec['value'] = None
    return rec


def verify_record(rec, asof):
    """Arithmetic and contract self-checks for one record. Returns a list of error strings."""
    errors = []
    key = rec.get('key', '?')
    methods = {m['name']: m for m in rec.get('methods', []) if isinstance(m, dict)}
    for name in ['PE', 'PEG', 'PB']:
        if name not in methods:
            errors.append(f'{key}: 缺 {name} 适用性评估')
    src_ids = [s['id'] for s in rec.get('sources', [])]
    if len(src_ids) != len(set(src_ids)):
        errors.append(f'{key}: 来源 id 重复')
    for s in rec.get('sources', []):
        url = s.get('url', '')
        if url.startswith('.local/'):
            errors.append(f'{key}: 来源未归档：{url}')
        if not re.match(r'^https?://', url):
            path = REPO / (('public/' + url) if re.match(r'^(research|data)/', url) else url)
            if not path.exists():
                errors.append(f'{key}: 来源路径不存在：{url}')
    value, status = rec.get('value'), rec.get('status')
    if status == 'insufficient':
        if value is not None:
            errors.append(f'{key}: insufficient 却有数值 value')
        if not rec.get('missing'):
            errors.append(f'{key}: insufficient 缺缺项说明')
    if value is not None:
        pm = methods.get(value.get('primaryMethod'))
        if pm is None:
            errors.append(f'{key}: primaryMethod 无对应 method')
        else:
            vals = [value.get('low'), value.get('base'), value.get('high')]
            if pm.get('values') != vals:
                errors.append(f'{key}: value 与主锚 method.values 不一致')
            # 按披露 inputs 复算：PE=epsForward×倍数；PB=bookValue×倍数
            inp = pm.get('inputs') or {}
            tri = inp.get('researchMultiples') or {}
            if value['primaryMethod'] == 'PE':
                eps = inp.get('epsForward')
                if not (num(eps) and eps > 0 and all(num(tri.get(k)) and tri[k] > 0 for k in ['low', 'base', 'high'])):
                    errors.append(f'{key}: PE 复算输入不完整')
                else:
                    for k, v in zip(['low', 'base', 'high'], vals):
                        if abs(round(eps * tri[k], 2) - v) > 0.011:
                            errors.append(f'{key}: PE 算术不符 {k}: {eps}×{tri[k]}≠{v}')
            if value['primaryMethod'] == 'PB':
                bv = inp.get('bookValuePerShare')
                if not (num(bv) and bv > 0 and all(num(tri.get(k)) and tri[k] > 0 for k in ['low', 'base', 'high'])):
                    errors.append(f'{key}: PB 复算输入不完整')
                else:
                    for k, v in zip(['low', 'base', 'high'], vals):
                        if abs(round(bv * tri[k], 2) - v) > 0.011:
                            errors.append(f'{key}: PB 算术不符 {k}: {bv}×{tri[k]}≠{v}')
        if not (num(vals[0]) and num(vals[1]) and num(vals[2]) and 0 <= vals[0] <= vals[1] <= vals[2]):
            errors.append(f'{key}: 价值区间非 0≤low≤base≤high')
        if value.get('kind') == 'present' and value.get('date') != asof:
            errors.append(f'{key}: present 日期须等于基准日')
        if value.get('kind') == 'undated' and value.get('date') is not None:
            errors.append(f'{key}: undated 日期必须为 null')
        price = rec.get('price') or {}
        comp = rec.get('comparison') or {}
        if num(price.get('value')) and price['value'] > 0:
            for k in ['low', 'base', 'high']:
                expect = round(vals[['low', 'base', 'high'].index(k)] / price['value'] - 1, 4)
                if abs(comp.get(k, 0) - expect) > 0.0001:
                    errors.append(f'{key}: comparison.{k} 算术不符')
        if price.get('currency') != rec.get('currency'):
            errors.append(f'{key}: 价格币种与记录币种不一致')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--universe', required=True, type=Path)
    parser.add_argument('--as-of', required=True, help='valuation base date YYYY-MM-DD')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--limit', type=int, default=0, help='first N companies only (sample check)')
    parser.add_argument('--codes', default='', help='comma-separated codes to include (sample check, e.g. 603596,000001,000009)')
    args = parser.parse_args()

    universe = load_json(args.universe)
    if args.codes:
        wanted = set(args.codes.split(','))
        universe = [e for e in universe if e['code'] in wanted]
    elif args.limit:
        universe = universe[:args.limit]
    snapshot = load_json(SNAPSHOT)
    yahoo_doc = load_json(YAHOO)
    yahoo = yahoo_doc['quotes']
    lynch = load_json(LYNCH)
    dcf = {row['c']: row for row in load_json(DCF_PREFILL)['items'] if row.get('m') == 'cn'}
    yahoo_checked = yahoo_doc['checkedAt'][:10]

    records = [build_record(e, args.as_of, snapshot, yahoo, yahoo_checked, lynch, dcf) for e in universe]
    verify_errors = [err for rec in records for err in verify_record(rec, args.as_of)]
    if verify_errors:
        print('\n'.join(verify_errors[:50]))
        raise SystemExit(f'算术/契约断言失败 {len(verify_errors)} 处，拒绝写出')
    document = {'schemaVersion': 1, 'asOf': args.as_of, 'generatedBy': 'scripts/build-company-valuations-cn.py',
                'records': records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    counts, primaries = {}, {}
    for rec in records:
        counts[rec['status']] = counts.get(rec['status'], 0) + 1
        p = rec['value']['primaryMethod'] if rec['value'] else 'none'
        primaries[p] = primaries.get(p, 0) + 1
    print(json.dumps({'records': len(records), 'status': counts, 'primary': primaries, 'output': str(args.output)},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
