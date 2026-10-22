#!/usr/bin/env python3
"""Batch conditional draft for comprehensive equity valuation: US universe and NDX-10.

Reads a .local research universe export plus repo evidence (price snapshot, Yahoo batch quotes,
Lynch growth, DCF prefill) and writes schema-v1 records for the comprehensive-equity-valuation skill.

Everything here is programmatic: review.mode is always 'programmatic', so no record can claim 'reviewed'.
The PE band uses each company's own research scenario multiples (not re-estimated); the denominator is
the Yahoo forward EPS consensus. Nothing is back-solved from price / PE.

Usage:
  python3 scripts/build-company-valuations-us.py --universe .local/comprehensive-valuation/us.json \
      --as-of 2026-10-22 --output public/data/company-valuations/us.json
"""
import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

REPO = Path(__file__).resolve().parent.parent
SNAPSHOT = REPO / 'src/data/companyMarketSnapshot.json'
YAHOO = REPO / 'public/research/data-refresh-2026-10-20/yahoo-quote-batch.json'
LYNCH = REPO / 'public/data/lynch.json'
DCF_PREFILL = REPO / 'public/data/dcf-prefill.json'
DCF_AUTO = REPO / 'public/data/dcf-auto.json'

SCENARIO_ORDER = {'悲观': 'low', '基准': 'base', '乐观': 'high'}
PB_APPLICABLE_SECTORS = {'金融', '房地产', '公用事业', '能源', '材料', '工业'}
PB_NOT_APPLICABLE_SECTORS = {'信息技术', '医疗保健', '可选消费', '日常消费', '通信服务'}
PB_CONTEXT = {
    '金融': '银行/保险的目标PB取决于可持续ROE、股权成本与监管资本；原研究未给出这三项的同口径依据',
    '房地产': '资产型，账面值有一定约束力；目标PB缺同口径ROE/股权成本依据，未计值',
    '公用事业': '受监管资产型，账面值有约束力；目标PB缺受监管回报率的同口径依据，未计值',
    '能源': '资源与资产型，账面值受油价/周期影响大；目标PB缺中周期ROE依据，未计值',
    '材料': '周期资产型；目标PB需中周期ROE依据，原研究未给出，未计值',
    '工业': '资产与产能型；目标PB需可持续ROE依据，原研究未给出，未计值',
}
PB_NOT_APPLICABLE_CONTEXT = {
    '信息技术': '轻资产，无形资产与商誉占比高，账面值对价值约束弱；不以PB定价',
    '医疗保健': '研发与管线价值主导，账面值对价值约束弱；不以PB定价',
    '可选消费': '品牌与渠道价值主导，账面值约束弱；不以PB定价',
    '日常消费': '品牌与渠道价值主导，账面值约束弱；不以PB定价',
    '通信服务': '网络与内容资产带来大量商誉与无形资产；账面值约束弱，不以PB定价',
}


def load_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def num(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def r2(value):
    return round(value, 2)


def pct(value):
    return f'{value * 100:+.1f}%'


def parse_pe_triplet(scenarios):
    """Return ({low, base, high}: multiple or None, notes, inferred) from research scenarios that are PE-based.

    A bare 'N×' multiple counts as PE only when the same scenario states an EPS basis and no other
    multiple unit; scenarios flagged as not rebuilt against current facts are never used.
    """
    found, notes, inferred = {}, [], False
    for scenario in scenarios or []:
        name = scenario.get('name')
        if name not in SCENARIO_ORDER:
            continue
        text = scenario.get('multiple') or ''
        assumption = scenario.get('assumption') or ''
        if '未按本轮事实重建' in assumption:
            notes.append(f'{name} 研究假设标注为旧模型、未按本轮事实重建')
            continue
        match = re.search(r'([\d.]+)\s*×\s*PE\b', text)
        bare = re.fullmatch(r'\s*([\d.]+)×\s*', text)
        if match:
            found[SCENARIO_ORDER[name]] = float(match.group(1))
        elif bare and 'EPS' in assumption and not re.search(r'(?<![A-Za-z])(PB|PS|EV|NAV)(?![A-Za-z])|净资产|营收', assumption):
            found[SCENARIO_ORDER[name]] = float(bare.group(1))
            inferred = True
        else:
            notes.append(f'{name} 倍数非 PE 口径（{text or "空"}）')
    triplet = {k: found.get(k) for k in ['low', 'base', 'high']}
    return triplet, notes, inferred


def parse_research_eps(scenarios):
    """Research scenario EPS basis: first number after 'EPS' in the assumption; EUR text is skipped."""
    found = {'low': None, 'base': None, 'high': None}
    for scenario in scenarios or []:
        key = SCENARIO_ORDER.get(scenario.get('name'))
        text = scenario.get('assumption') or ''
        if not key or '€' in text or '未按本轮事实重建' in text:
            continue
        match = re.search(r'EPS\s*(?:US\$|\$)?\s*([\d.]+)', text)
        if match:
            found[key] = float(match.group(1))
    return found


def research_basis(text):
    """Research basis date: first explicit date after the '原研究' marker. No date means no basis."""
    marker = re.search(r'原研究[：:]', text or '')
    if not marker:
        return None, ''
    match = re.search(r'\d{4}-\d{2}-\d{2}', text[marker.end():])
    if not match:
        return None, ''
    phrase = text[marker.end():marker.end() + 60].split('；')[0]
    return match.group(0), phrase


def et_date(epoch_seconds):
    return datetime.fromtimestamp(epoch_seconds, ZoneInfo('America/New_York')).date().isoformat()


def short(items, n=2):
    return '；'.join(str(x) for x in (items or [])[:n] if x)


def build_record(entry, asof, snapshot, yahoo, yahoo_checked, lynch, dcf, dcf_auto, dcf_checked):
    market, code = entry['market'], entry['code']
    name, sector = entry['name'], entry['sector']
    key = f'{market}:{code}'
    lookup = code.replace('.', '-')  # Yahoo uses BRK-B / BF-B
    quote = yahoo.get(lookup) or {}
    snap = snapshot.get(f'us:{code}')
    lyn = lynch.get(f'us:{code}')
    dcf_row = dcf.get(code)
    research_id = 'research-us' if market == 'us' else 'research-ndx'
    research_date, research_phrase = research_basis(entry.get('asOf'))
    quote_currency = quote.get('currency') or 'USD'
    # ---- price: snapshot first (what the page renders), Yahoo as cross-check / fallback; currency must match
    price_value, price_date, price_source = None, None, None
    yahoo_price = quote.get('regularMarketPrice')
    # Securities whose tradability is unverified never auto-promote a quote to current price.
    tradable = (entry.get('marketRefresh') or {}).get('tradability') != 'unverified'
    if tradable and snap and num(snap.get('price')) and snap['price'] > 0 and snap.get('currency') == quote_currency:
        price_value, price_date, price_source = snap['price'], snap['date'], 'snap-us'
    elif tradable and num(yahoo_price) and yahoo_price > 0 and quote.get('regularMarketTime') and quote_currency == 'USD':
        price_value, price_date, price_source = yahoo_price, et_date(quote['regularMarketTime']), 'yahoo-batch'
    price_gap = None
    if snap and num(yahoo_price) and yahoo_price > 0 and price_value:
        price_gap = abs(price_value / yahoo_price - 1)

    sources = []
    if price_source == 'snap-us' or snap:
        sources.append({'id': 'snap-us', 'title': 'companyMarketSnapshot 价格锚点（腾讯延迟行情，供应商最后报价）',
                        'url': 'src/data/companyMarketSnapshot.json', 'asOf': snap['checkedAt'][:10]})
    if quote:
        sources.append({'id': 'yahoo-batch', 'title': 'Yahoo 批量报价（EPS、BVPS、前瞻 EPS 一致预期、价格交叉核对）',
                        'url': 'research/data-refresh-2026-10-20/yahoo-quote-batch.json',
                        'asOf': yahoo_checked})
    if research_date:
        sources.append({'id': research_id, 'title': f'原研究公司导出（情景倍数与评级，未重估；{market} 口径）',
                        'url': f'research/comprehensive-valuation-2026-10-22/universe-{market}.json',
                        'asOf': research_date})

    eps_ttm = quote.get('epsTrailingTwelveMonths')
    eps_fwd = quote.get('epsForward')
    book = quote.get('bookValue')
    currency = quote.get('currency') or 'USD'
    shares = quote.get('sharesOutstanding')

    assumptions, missing = [], []
    methods = []
    has_price = price_value is not None

    # ---- PE (primary candidate)
    triplet, scen_notes, inferred_pe = parse_pe_triplet(entry.get('scenarios'))
    pe_ok = num(eps_ttm) and eps_ttm > 0 and num(eps_fwd) and eps_fwd > 0
    pe_reason = ''
    pe_values = None
    pe_refs = [id_ for id_ in ['yahoo-batch', research_id] if any(s['id'] == id_ for s in sources)]
    research_eps = parse_research_eps(entry.get('scenarios'))
    # Consensus forward EPS must sit within 2x of the research EPS basis (or TTM when none is stated).
    eps_conflict = None
    if pe_ok:
        if research_eps['base']:
            ratio, ref = eps_fwd / research_eps['base'], f'原研究基准 EPS {research_eps["base"]:g}'
        else:
            ratio, ref = eps_fwd / eps_ttm, f'TTM EPS {eps_ttm:.2f}'
        if ratio > 2 or ratio < 0.5:
            eps_conflict = (f'一致预期前瞻 EPS {eps_fwd:.2f} 与{ref}相差 {ratio:.1f} 倍，口径冲突'
                            f'（财年、单位或一次性项目未核），不计 PE 数值')
    pe_inputs = {
        'epsTrailingTwelveMonths': eps_ttm,
        'epsForward': eps_fwd,
        'researchMultiples': triplet,
        'researchScenarioEPS': research_eps,
        'forwardYearBound': False,
        'researchScenarioCount': len(entry.get('scenarios') or []),
        'yahooTrailingPE': quote.get('trailingPE'),
        'yahooForwardPE': quote.get('forwardPE'),
        'priceUsed': price_value,
    }
    if dcf_row and num(dcf_row.get('ni')) and num(dcf_row.get('shares')) and dcf_row['shares'] > 0:
        pe_inputs['dcfPrefillAnnualEPS'] = r2(dcf_row['ni'] / dcf_row['shares'])
        pe_inputs['dcfPrefillFY'] = dcf_row.get('fy')
    if not has_price:
        pe_reason = '无价格，无法比较'
    elif not pe_ok:
        pe_reason = ('TTM EPS 或前瞻 EPS 不为正（供应商口径），PE 不适用；不以前瞻 EPS 替代正常化盈利'
                     if num(eps_ttm) or num(eps_fwd) else '供应商无 EPS，PE 不适用')
    elif not research_date:
        pe_reason = '原研究情景缺证据日期，无法说明倍数依据时点，不计值'
    elif any(v is None for v in triplet.values()):
        pe_reason = '研究情景倍数不是 PE 口径或缺失：' + ('；'.join(scen_notes) if scen_notes else '缺悲观/基准/乐观中至少一项')
    elif not (triplet['low'] <= triplet['base'] <= triplet['high']):
        pe_reason = f'研究情景倍数非单调（{triplet}），不计值'
    elif eps_conflict:
        pe_reason = eps_conflict
    else:
        pe_values = [r2(eps_fwd * triplet[k]) for k in ['low', 'base', 'high']]
        pe_reason = (f'盈利为正（TTM {eps_ttm:.2f}、前瞻 {eps_fwd:.2f}），可用 PE；'
                     f'倍数沿用原研究情景（悲观/基准/乐观 {triplet["low"]:g}×/{triplet["base"]:g}×/{triplet["high"]:g}×，未重估）')
        if inferred_pe:
            pe_reason += '；部分倍数单位省略，按假设文本的 EPS 口径视为 PE'
        if abs(triplet['base'] - (price_value / eps_fwd)) / triplet['base'] < 0.01:
            pe_reason += '；注意：基准倍数与现价前瞻 PE 几乎相同，结论等同现价，不构成独立估值'
    pe_formula = '前瞻 EPS（供应商一致预期）× 研究情景 PE（悲观/基准/乐观）'
    methods.append({
        'name': 'PE', 'applicable': bool(pe_ok and has_price), 'reason': pe_reason, 'formula': pe_formula,
        'inputs': pe_inputs, 'values': pe_values, 'sourceIds': pe_refs,
    })

    # ---- PEG
    growth = lyn.get('g') if lyn else None
    peg_applicable = bool(pe_ok and num(growth) and 0 < growth <= 40)
    if not has_price:
        peg_reason = '无价格'
    elif not num(eps_ttm) or eps_ttm <= 0:
        peg_reason = 'TTM EPS 为负，PEG 无意义'
    elif not num(growth):
        peg_reason = '缺增速来源（Lynch 未覆盖），PEG 不适用'
    elif growth <= 0:
        peg_reason = '增速为零或负，PEG 不适用'
    elif growth > 40:
        peg_reason = f'增速 {growth:g}% 过高且可能来自低基数或一次性项目，不机械应用 PEG'
    else:
        peg_reason = (f'利润增速 {growth:g}%（Lynch 研究口径，非独立一致预期）；PEG 与 PE 共享增长假设，'
                      f'不作为独立证据；目标 PEG 无同口径依据，未计值')
    methods.append({
        'name': 'PEG', 'applicable': peg_applicable, 'reason': peg_reason,
        'formula': 'PE ÷ 增长率百分数（如 20% 填 20）；目标价=EPS × 目标 PEG × 增长百分数',
        'inputs': {'growthPercent': growth, 'yahooForwardPE': quote.get('forwardPE'), 'currentForwardPEComputed': r2(price_value / eps_fwd) if has_price and pe_ok else None},
        'values': None, 'sourceIds': ['lynch'] if lyn else [],
    })
    if lyn:
        sources.append({'id': 'lynch', 'title': 'Lynch 增速与分类（原研究，PE 行情字段 2026-10-20 核验）',
                        'url': 'data/lynch.json', 'asOf': '2026-10-20'})

    # ---- PB
    book_ok = num(book) and book > 0
    if sector in PB_APPLICABLE_SECTORS and book_ok:
        pb_applicable = True
        pb_reason = PB_CONTEXT.get(sector, '资产型，账面值有一定约束力；目标 PB 缺依据，未计值')
    elif sector in PB_NOT_APPLICABLE_SECTORS:
        pb_applicable, pb_reason = False, PB_NOT_APPLICABLE_CONTEXT[sector]
    elif num(book) and book <= 0:
        pb_applicable, pb_reason = False, '账面权益为负，PB 不适用'
    else:
        pb_applicable, pb_reason = False, '供应商无账面每股值，PB 不适用'
    methods.append({
        'name': 'PB', 'applicable': pb_applicable, 'reason': pb_reason,
        'formula': '普通股 BVPS × 合理 PB（需 ROE/股权成本依据）',
        'inputs': {'bookValuePerShare': book, 'yahooPriceToBook': quote.get('priceToBook'), 'currency': currency},
        'values': None, 'sourceIds': ['yahoo-batch'] if quote else [],
    })

    # ---- DCF: prefill has history and balance-sheet items, but no explicit forecast, reinvestment or terminal
    # assumptions, so it is assessed for applicability only. The legacy auto-DCF is archived, never a current value.
    dcf_ok = bool(dcf_row and dcf_row.get('years') and num(dcf_row.get('shares')) and dcf_row['shares'] > 0)
    if sector == '金融':
        dcf_applicable = False
        dcf_reason = '金融公司以利息与监管资本为经营要素，不以 FCFF 估值；需股权现金流或 PB-ROE/EV-NBV 口径，本批次不适用'
    elif dcf_ok:
        dcf_applicable = True
        dcf_reason = (f'有预取历史财报（FY {dcf_row.get("fy")}，{len(dcf_row["years"])} 年）、股数与资产负债项，可作输入；'
                      '缺显式预测期、再投资率与终值假设，本批次不计值')
    else:
        dcf_applicable = False
        dcf_reason = '缺预取财报或股数，无法复算 DCF 输入，本批次不适用'
    methods.append({
        'name': 'DCF', 'applicable': dcf_applicable, 'reason': dcf_reason,
        'formula': 'FCFF 显式期现值 + 终值；股权价 = (EV − 债务 + 现金 − 少数权益) ÷ 摊薄股数',
        'inputs': {'fy': dcf_row.get('fy'), 'cash': dcf_row.get('cash'), 'debt': dcf_row.get('debt'),
                   'minorityInterest': dcf_row.get('mi'), 'shares': dcf_row.get('shares'),
                   'beta': dcf_row.get('beta')} if dcf_applicable else {},
        'values': None, 'sourceIds': ['dcf-prefill'] if dcf_applicable else [],
    })
    if dcf_applicable:
        sources.append({'id': 'dcf-prefill', 'title': 'DCF 预取财报（历史收入、利润、股数、资产负债项）',
                        'url': 'data/dcf-prefill.json', 'asOf': dcf_checked})
        missing.append('DCF 缺显式预测期、再投资与终值假设，未计值')
    legacy_auto = dcf_auto.get(f'us:{code}') if market == 'us' else dcf_auto.get(f'{market}:{code}')
    if legacy_auto:
        sources.append({'id': 'dcf-auto', 'title': 'DCF 旧自动值（字段口径未核，仅存档）',
                        'url': 'data/dcf-auto.json', 'asOf': dcf_checked})

    # ---- industry anchor for financials and real estate (named by the company's long name)
    long_name = quote.get('longName') or quote.get('shortName') or ''
    anchor = None
    if sector == '金融':
        if re.search(r'Insurance|Assurance|Reinsurance|Life|Annuit', long_name, re.I):
            anchor = ('EV/NBV', True, '保险公司可用 EV/NBV（内含价值与新业务价值）；本批次无 EV 与 NBV 数据，缺项')
        else:
            anchor = ('PB-ROE', pb_applicable, 'ROE 可由 TTM EPS÷BVPS 推导作比率参考，但目标 PB 需股权成本与可持续增长依据；本批次缺失')
    elif sector == '房地产':
        # Vendor long names cannot reliably identify REITs (e.g. American Tower), so status is marked for confirmation.
        anchor = ('NAV/AFFO', True, '需先核实是否为 REIT：是则用 AFFO 与物业 NAV；否则需分部资产估值。'
                  '供应商长名「' + long_name + '」不能可靠识别身份，本批次无 AFFO 或物业估值数据，缺项')
    if anchor:
        name, applicable, reason = anchor
        methods.append({'name': name, 'applicable': applicable, 'reason': reason,
                        'formula': '行业辅锚，需对应口径的分母与倍数依据（本批次未计值）',
                        'inputs': {'longName': long_name, 'bookValuePerShare': book}, 'values': None,
                        'sourceIds': ['yahoo-batch'] if quote else []})
        if applicable:
            missing.append(f'行业辅锚 {name} 缺输入，未计值')

    # ---- record-level value
    value = None
    status = 'insufficient'
    comparison = None
    if pe_values and has_price:
        # Forward-year binding is unknown and research multiples were set on future-year EPS,
        # so this is an undated sensitivity: never a present value and never a 'today undervalued' label.
        value = {'low': pe_values[0], 'base': pe_values[1], 'high': pe_values[2], 'kind': 'undated', 'date': None,
                 'primaryMethod': 'PE'}
        status = 'conditional'
        comparison = {
            'label': '敏感性价相对现价差额（估值 / 现价 − 1，未定期限）', 'priceValue': price_value, 'priceDate': price_date,
            'low': r2(pe_values[0] / price_value - 1), 'base': r2(pe_values[1] / price_value - 1),
            'high': r2(pe_values[2] / price_value - 1),
        }
        comparison = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in comparison.items()}
    else:
        if not has_price:
            missing.append('无可用现价')
        missing.append(f'PE 敏感性未计值：{pe_reason}')

    if price_gap is not None and price_gap > 0.005:
        assumptions.append(f'快照价与 Yahoo 批量价相差 {price_gap:.2%}，以快照价为准')
    if num(quote.get('trailingPE')) and has_price and num(eps_ttm) and eps_ttm > 0:
        implied = price_value / eps_ttm
        if abs(implied / quote['trailingPE'] - 1) > 0.05:
            assumptions.append(f'Yahoo TTM PE {quote["trailingPE"]:.2f} 与现价÷TTM EPS {implied:.2f} 相差超过 5%，EPS 口径待核')

    if pe_values:
        assumptions.append(f'PE 倍数取原研究情景（{triplet["low"]:g}×/{triplet["base"]:g}×/{triplet["high"]:g}×，未重估，研究假设）')
        base_gap = pe_values[1] / price_value - 1
        if abs(base_gap) > 1:
            missing.append(f'基准倍数 {triplet["base"]:g}× 相对现价前瞻 PE 偏离过大（基准价相对现价 {pct(base_gap)}），需重核研究倍数依据后才可作估值参考')
        assumptions.append(f'分母为 Yahoo 前瞻 EPS（{eps_fwd:.2f}，一致预期口径，待与公司披露核对），非价格÷PE 倒推')
        assumptions.append('悲观/乐观仅改变倍数，EPS 不变（不等于原研究的 EPS 与倍数同时下修/上修情景）')
        if research_eps['base'] and num(eps_fwd):
            gap = eps_fwd / research_eps['base'] - 1
            assumptions.append(f'方法分歧：原研究基准 EPS 假设 {research_eps["base"]:g}（未重估）与前瞻一致预期 {eps_fwd:.2f} 相差 {pct(gap)}；'
                               f'本批次采用一致预期口径，原研究 EPS 口径未采用')
        elif any('€' in (s.get('assumption') or '') for s in entry.get('scenarios') or []):
            assumptions.append('方法分歧：原研究 EPS 假设为欧元口径，未换算，不与前瞻 EPS 比较')
    assumptions.append('价格 ' + (f'{price_value}（{price_date}，供应商最后报价）' if has_price else '缺失'))
    if research_date:
        assumptions.append(f'原研究资料日期：{research_date}（原文：{research_phrase}）')
    if pe_values:
        missing.append('前瞻 EPS 预测财年未绑定，PE 值仅为未定期限敏感性，不是今日估值；需确定预测年度与倍数时点')
    missing.append('一手财报与公司公告未在本批次逐家重读（仅供应商 TTM/前瞻 EPS 与原研究）')
    missing.append('DCF、FCF 与资本开支未纳入本批次自动计值')
    if pe_values and any(m['name'] == 'PB' and m['applicable'] for m in methods):
        missing.append('PB 目标倍数缺同口径 ROE/股权成本依据')
    if not sources or not any(s['id'] == 'yahoo-batch' for s in sources):
        missing.append('缺供应商 EPS/BVPS 原始数据')

    legacy = entry.get('rating') or ''
    quality_parts = [entry.get('certainty') or '', short(entry.get('pros'), 1), short(entry.get('moat'), 1)]
    quality = '原研究口径（未重核）：' + '；'.join(p for p in quality_parts if p) if any(quality_parts) else '原研究无质量证据，缺项'
    if pe_values:
        pricing = (f'现价 {price_value}（{price_date}，{"快照" if price_source == "snap-us" else "Yahoo"}）；'
                   f'PE 敏感性（未定期限，非今日价值）：前瞻 EPS {eps_fwd:.2f} × 研究倍数 → 悲观/基准/乐观 {pe_values[0]}/{pe_values[1]}/{pe_values[2]}，'
                   f'相对现价 {pct(pe_values[1] / price_value - 1)}（基准）'
                   + (f'；一致预期 EPS 与原研究基准 EPS 口径差 {pct(eps_fwd / research_eps["base"] - 1)}' if research_eps['base'] and num(eps_fwd) else '') + '；'
                   f'PEG：{"适用但与 PE 共享增长假设" if peg_applicable else peg_reason}；'
                   f'PB：{"适用但缺目标倍数" if pb_applicable else pb_reason}')
    else:
        pricing = (f'现价 {price_value if has_price else "缺失"}（{price_date or "无日期"}）；'
                   f'PE 不计数值：{pe_reason}；PEG：{peg_reason}；PB：{pb_reason}')
    expectations = (f'前瞻 EPS 一致预期 {eps_fwd:.2f}（供应商口径）' if num(eps_fwd) else '前瞻 EPS 缺失')
    expectations += f'；验证节点：{short(entry.get("calendar"), 1) or "原研究未列"}；持续期：{entry.get("duration") or "原研究未列"}'
    risk_items = [short(entry.get('risk'), 2), short(entry.get('cons'), 1)]
    tail = ''
    if value and has_price:
        tail = f'；压力：悲观价 {value["low"]} 相对现价 {pct(value["low"] / price_value - 1)}，倍数压缩情景而非下限，另需检融资与股权稀释'
    risk = '；'.join(p for p in risk_items if p) + tail
    if not risk:
        risk = '原研究未列明风险，缺项'

    discipline = entry.get('discipline') or {}

    rec = {
        'key': key, 'market': market, 'code': code, 'name': name, 'sector': sector,
        'currency': currency, 'asOf': asof,
        'price': {'value': price_value, 'date': price_date, 'currency': currency,
                  'source': price_source},
        'status': status, 'value': value, 'comparison': comparison,
        'methods': methods,
        'quality': quality, 'pricing': pricing, 'expectations': expectations, 'risk': risk,
        'assumptions': assumptions, 'missing': missing,
        'sources': sources,
        'review': {'mode': 'programmatic', 'by': 'scripts/build-company-valuations-us.py（Orca 批量脚本）',
                   'note': '程序化条件初稿：研究倍数未重估，财务分母取供应商口径；未逐家重读财报，不得标已复核'},
        'legacy': {'rating': legacy, 'headline': entry.get('headline') or '',
                   'discipline': discipline.get('zone') or '',
                   'dcfAuto': legacy_auto or None,
                   'dcfAutoNote': '旧 DCF 自动值原始数组，字段口径未核，不计入本轮估值',
                   'note': '旧研究评级与旧价格纪律区（旧价口径，仅作历史参考），未随本轮价格静默改写'},
    }
    if status == 'insufficient':
        rec['value'] = None
    return rec


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--universe', required=True, type=Path)
    parser.add_argument('--as-of', required=True, help='valuation base date YYYY-MM-DD')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--limit', type=int, default=0, help='first N companies only (sample check)')
    args = parser.parse_args()

    universe = load_json(args.universe)
    if args.limit:
        universe = universe[:args.limit]
    snapshot = load_json(SNAPSHOT)
    yahoo = load_json(YAHOO)['quotes']
    lynch = load_json(LYNCH)
    dcf = {row['c']: row for row in load_json(DCF_PREFILL)['items'] if row.get('m') == 'us'}

    yahoo_checked = load_json(YAHOO)['checkedAt'][:10]
    dcf_auto = load_json(DCF_AUTO)['items']
    dcf_checked = load_json(DCF_PREFILL)['generatedAt'][:10]
    records = [build_record(entry, args.as_of, snapshot, yahoo, yahoo_checked, lynch, dcf, dcf_auto, dcf_checked)
               for entry in universe]
    document = {'schemaVersion': 1, 'asOf': args.as_of, 'generatedBy': 'scripts/build-company-valuations-us.py',
                'records': records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    counts = {}
    for rec in records:
        counts[rec['status']] = counts.get(rec['status'], 0) + 1
    print(json.dumps({'records': len(records), 'status': counts, 'output': str(args.output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
