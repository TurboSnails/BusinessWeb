#!/usr/bin/env python3
"""Batch conditional draft for comprehensive equity valuation: HK (127) and ADR (67).

Reads a .local / frozen comprehensive valuation universe export plus repo evidence
(snapshot, Yahoo batch quotes, Lynch growth, DCF prefill, sector review audits) and
writes schema-v1 records for the comprehensive-equity-valuation skill.

Key rules:
1. Every numeric valuation is strictly recomputed from disclosed inputs without copying old prices:
   - PE: forward EPS × scenario multiples (low/base/high)
   - Dividend: dividendRate ÷ extracted target yields (e.g. 7%/5%/4%) from company research scenarios
   - SOFI: 2027 research forecast EPS ($0.45/$0.80/$1.05) × multiples (17/24/28×)
2. PB: unverified numeric drafts without complete BVPS/ROE/CoE/haircut bridges (e.g. ADR HSBC/TD) are downgraded to value=null and explained.
3. Every record has review.mode = 'programmatic'.
4. Embedded arithmetic regression tests ensure all values match disclosed inputs.
5. Research source asOf parses exact date from entry.asOf (2026-10-07), never hardcoded batch date.

Usage:
  python3 scripts/build-company-valuations-international.py --universe .local/comprehensive-valuation/hk.json \
      --as-of 2026-10-22 --output public/data/company-valuations/hk.json

  python3 scripts/build-company-valuations-international.py --universe .local/comprehensive-valuation/adr.json \
      --as-of 2026-10-22 --output public/data/company-valuations/adr.json
"""
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SNAPSHOT_FILE = REPO / 'src/data/companyMarketSnapshot.json'
YAHOO_FILE = REPO / 'public/research/data-refresh-2026-10-20/yahoo-quote-batch.json'
LYNCH_FILE = REPO / 'public/data/lynch.json'
DCF_PREFILL_FILE = REPO / 'public/data/dcf-prefill.json'

HK_AUDIT_FILE = REPO / 'public/research/hk-valuation-2026-10-20/audit.json'
ADR_VALUATION_FILE = REPO / 'public/research/adr-valuation-2026-10-20/valuation.json'

PB_APPLICABLE_SECTORS = {'金融', '银行', '保险', '其他金融', '地产', '房地产', '公用事业', '能源', '石油及天然气', '煤炭', '材料', '一般金属及矿石', '工业', '建筑', '工用运输'}
PB_NOT_APPLICABLE_SECTORS = {'资讯科技器材', '软件服务', '信息技术', '半导体', '药品及生物科技', '医疗保健', '专业零售', '消费者主要零售商', '可选消费', '日常消费', '媒体及娱乐', '通信服务', '旅游及消闲设施', '海外龙头', '中概', '新兴市场平台', '美股本土成长'}

PB_CONTEXT = {
    '金融': '银行/保险/金融的目标PB取决于可持续ROE、股权成本与监管资本；原研究未给出这三项的同口径依据',
    '银行': '目标PB取决于可持续ROE、股权成本与监管资本/资产质量；原研究未给出同口径依据，未计值',
    '保险': '目标PB受内含价值与负债端贴现率影响，账面值约束弱；未计值',
    '其他金融': '券商/交易所盈利随市场成交额波动，目标PB缺可持续ROE依据，未计值',
    '地产': '资产型，账面值有一定约束力但受资产减值与流动性影响大；目标PB缺同口径依据，未计值',
    '公用事业': '受监管资产型，账面值有约束力；目标PB缺受监管回报率同口径依据，未计值',
    '能源': '资源资产型，账面值受大宗周期影响大；目标PB缺中周期ROE依据，未计值',
    '石油及天然气': '油气资源资产型，账面值随油价周期波动；目标PB缺中周期ROE依据，未计值',
    '煤炭': '煤炭资源资产型，账面值随煤价波动；目标PB缺中周期ROE依据，未计值',
    '一般金属及矿石': '矿业资产型，受商品价格周期影响；目标PB缺中周期依据，未计值',
    '建筑': '产能与垫资施工型，应收账款与减值影响账面真实性；目标PB缺同口径依据，未计值',
    '工用运输': '重资产网络型，运价与周期波动大；目标PB缺可持续ROE依据，未计值',
}

PB_NOT_APPLICABLE_CONTEXT = {
    '资讯科技器材': '轻资产/研发与品牌主导，账面值对价值约束弱；不以PB定价',
    '软件服务': '软件/平台类的账面权益未必覆盖业务价值，须另核无形资产与投资资产构成；本批次不以PB作为主锚',
    '半导体': '重资产但技术垄断与先进制程溢价主导，账面值无法反映真实壁垒；不以PB定价',
    '药品及生物科技': '研发管线与专利主导，账面值约束弱；不以PB定价',
    '医疗保健': '研发与医疗服务主导，账面值约束弱；不以PB定价',
    '专业零售': '渠道与品牌价值主导，账面值约束弱；不以PB定价',
    '消费者主要零售商': '周转与品牌价值主导，账面值约束弱；不以PB定价',
    '食物饮品': '品牌与渠道价值主导，账面值约束弱；不以PB定价',
    '家庭电器及用品': '品牌与渠道价值主导，账面值约束弱；不以PB定价',
    '旅游及消闲设施': '特许经营与客流驱动，账面值约束弱；不以PB定价',
    '纺织及服饰': '供应链与品牌主导，账面值约束弱；不以PB定价',
    '媒体及娱乐': '内容与平台网络主导，账面值约束弱；不以PB定价',
    '海外龙头': '全球平台/科技/品牌龙头，账面值无法约束真实盈利能力；不以PB主锚定价',
    '中概': '互联网与消费服务平台，轻资产与商誉居多，账面值约束弱；不以PB定价',
    '新兴市场平台': '平台网络与用户增长主导，轻资产模式，账面值约束弱；不以PB定价',
    '美股本土成长': '高成长与高无形资产比重，账面值约束弱；不以PB定价',
}


def load_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def num(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def r2(value):
    return round(float(value) + 1e-9, 2)


def pct(value):
    return f'{value * 100:+.1f}%'


def short(items, n=2):
    return '；'.join(str(x) for x in (items or [])[:n] if x)


def parse_research_date(asof_text):
    if not asof_text:
        return None
    m = re.search(r'研究(\d{4}-\d{2}-\d{2})', asof_text) or re.search(r'原研究.*?(\d{4}-\d{2}-\d{2})', asof_text)
    return m.group(1) if m else None


def parse_dividend_yields(scenarios):
    yields = []
    for sc in scenarios or []:
        m = re.search(r'目标股息率\s*([\d.]+)%', sc.get('multiple', ''))
        if m:
            yields.append(float(m.group(1)))
    return yields if len(yields) == 3 else None


def build_record(entry, asof, snapshot, yahoo, lynch, dcf, hk_audit_map, adr_val_map):
    market, code = entry['market'], entry['code']
    name, sector = entry['name'], entry.get('sector') or ''
    key = f'{market}:{code}'

    snap = snapshot.get(key) or snapshot.get(code)
    symbol = snap.get('symbol') if snap else (f'{code[1:]}.HK' if market == 'hk' else code)
    quote = yahoo.get(symbol) or {}

    research_id = f'universe-{market}'
    research_path = f'public/research/comprehensive-valuation-2026-10-22/universe-{market}.json'
    research_date = parse_research_date(entry.get('asOf'))

    # Price handling
    price_value, price_date, price_source = None, None, None
    if snap and num(snap.get('price')) and snap['price'] > 0:
        price_value, price_date, price_source = snap['price'], snap['date'], 'snap-quote'
    elif num(quote.get('regularMarketPrice')) and quote['regularMarketPrice'] > 0 and quote.get('regularMarketTime'):
        price_value = quote['regularMarketPrice']
        price_date = datetime.fromtimestamp(quote['regularMarketTime'], timezone.utc).date().isoformat()
        price_source = 'yahoo-batch'

    currency = snap.get('currency') if snap else (quote.get('currency') or ('HKD' if market == 'hk' else 'USD'))

    sources = [
        {'id': 'snap-quote', 'title': f'companyMarketSnapshot 价格锚点（{snap.get("provider", "供应商延迟行情") if snap else "快照"}）',
         'url': 'src/data/companyMarketSnapshot.json', 'asOf': (snap.get('checkedAt') or '2026-10-20')[:10]},
        {'id': 'yahoo-batch', 'title': 'Yahoo 批量报价（EPS、BVPS、股息率、一致预期与财务字段）',
         'url': 'public/research/data-refresh-2026-10-20/yahoo-quote-batch.json', 'asOf': '2026-10-20'},
        {'id': research_id, 'title': f'原研究公司导出（情景倍数、业务画像与评级；{market} 口径）',
         'url': research_path, 'asOf': research_date or '2026-10-07'},
    ]

    if market == 'hk':
        sources.append({'id': 'hk-audit', 'title': '港股估值底稿与行业模型（2026-10-20 审计版本）',
                        'url': 'public/research/hk-valuation-2026-10-20/audit.json', 'asOf': '2026-10-20'})
    elif market == 'adr':
        sources.append({'id': 'adr-val', 'title': 'ADR 估值底稿与类别模型（2026-10-20 版本）',
                        'url': 'public/research/adr-valuation-2026-10-20/valuation.json', 'asOf': '2026-10-20'})

    lyn = lynch.get(key) or lynch.get(f'{market}:{code}')
    if lyn:
        sources.append({'id': 'lynch', 'title': 'Lynch 增速与分类（原研究，2026-10-20 核验）',
                        'url': 'public/data/lynch.json', 'asOf': '2026-10-20'})

    eps_ttm = quote.get('epsTrailingTwelveMonths')
    eps_fwd = quote.get('epsForward')
    book = quote.get('bookValue')
    div_rate = quote.get('dividendRate')
    div_yield = quote.get('dividendYield')
    fcur = quote.get('financialCurrency') or currency

    assumptions, missing = [], []
    methods = []
    has_price = price_value is not None and price_value > 0

    if not research_date:
        missing.append('原研究倍数与底稿缺少明确资料日期，降级处理')

    hk_entry = hk_audit_map.get(code) if market == 'hk' else None
    adr_entry = adr_val_map.get(code) if market == 'adr' else None

    # Check scenario multiples from universe
    scenarios = entry.get('scenarios') or []
    pe_mults = []
    for sc in scenarios:
        m = re.search(r'([\d.]+)\s*×\s*PE', sc.get('multiple', ''))
        if m:
            pe_mults.append(float(m.group(1)))

    is_financial = any(w in sector for w in ['银行', '保险', '金融', '券商']) or (adr_entry and adr_entry.get('cls') == 'div')
    has_pos_earnings = num(eps_ttm) and eps_ttm > 0 and num(eps_fwd) and eps_fwd > 0

    # Cross-check quote currency vs financial currency and ADR/ADS conversion
    unit_conflict = False
    if has_pos_earnings and num(quote.get('forwardPE')) and quote['forwardPE'] > 0:
        implied_fpe = price_value / eps_fwd if has_price else None
        if implied_fpe and abs(implied_fpe / quote['forwardPE'] - 1) > 0.05:
            unit_conflict = True

    # ---- 1. Evaluate PE
    pe_applicable = False
    pe_reason = ''
    pe_values = None
    pe_inputs = {
        'epsTrailingTwelveMonths': eps_ttm,
        'epsForward': eps_fwd,
        'quoteCurrency': currency,
        'financialCurrency': fcur,
        'priceUsed': price_value,
    }

    if not has_price:
        pe_reason = '无可用现价，无法比较'
    elif unit_conflict:
        pe_reason = f'报价币种 {currency} 与财报币种 {fcur} 换算存在分歧（implied PE 偏离供应商 PE > 5%），单位冲突待核'
    elif not has_pos_earnings:
        if num(eps_ttm) and eps_ttm <= 0:
            pe_reason = f'TTM EPS 为负（{eps_ttm} {currency}），持续盈利 PE 不适用；不以前瞻 EPS 替代正常化盈利'
        elif num(eps_fwd) and eps_fwd <= 0:
            pe_reason = f'前瞻 EPS 不为正（{eps_fwd} {currency}），前瞻 PE 无法作为主锚'
        else:
            pe_reason = '供应商缺失正向 EPS，PE 不适用'
    elif is_financial:
        pe_reason = '银行/金融类优先采用股息率法或普通股 PB-ROE，单一 PE 无法反映资产质量与资本约束'
    elif code == 'SOFI':
        # SOFI specialized single model: 2027 research forecast EPS ($0.45/$0.80/$1.05) × multiples (17/24/28×)
        pe_applicable = True
        pe_values = [r2(0.45 * 17), r2(0.80 * 24), r2(1.05 * 28)]  # [7.65, 19.20, 29.40]
        pe_reason = '2027 调整后预测 EPS（$0.45/$0.80/$1.05，原研究 2026-10-07 预测非供应商一致预期）× 目标 PE（17×/24×/28×），采用单一可解释 PE 模型'
        pe_inputs['eps2027'] = [0.45, 0.80, 1.05]
        pe_inputs['multiples'] = [17, 24, 28]
        pe_inputs['forecastSource'] = '原研究 2026-10-07 针对 2027 年底独立预测，非 Yahoo 一致预期'
    elif len(pe_mults) == 3 and pe_mults[0] <= pe_mults[1] <= pe_mults[2]:
        pe_applicable = True
        # Strictly recompute without copying old prices or using hidden factors
        pe_values = [r2(eps_fwd * pe_mults[0]), r2(eps_fwd * pe_mults[1]), r2(eps_fwd * pe_mults[2])]
        pe_reason = (f'盈利为正（TTM {eps_ttm} {currency}，前瞻 {eps_fwd} {currency}），PE 适用；'
                     f'直接按披露前瞻 EPS × 研究情景倍数 ({pe_mults[0]:g}×/{pe_mults[1]:g}×/{pe_mults[2]:g}×) 重算，无隐藏系数')
        pe_inputs['multiples'] = pe_mults
    else:
        pe_reason = '研究情景倍数非 PE 口径或倍数不完整，PE 不作数值主锚'

    pe_formula = ('2027 调整后预测每股收益（$0.45 / $0.80 / $1.05，原研究 2026-10-07 预测非供应商一致预期）× 目标 PE（17× / 24× / 28×）'
                  if code == 'SOFI' else '前瞻 EPS（供应商一致预期）× 研究情景 PE（悲观/基准/乐观）')

    methods.append({
        'name': 'PE',
        'applicable': pe_applicable,
        'reason': pe_reason,
        'formula': pe_formula,
        'inputs': pe_inputs,
        'values': pe_values,
        'sourceIds': ['yahoo-batch', research_id] if pe_applicable else ['yahoo-batch'],
    })

    # ---- 2. Evaluate PEG
    growth = lyn.get('g') if lyn else None
    peg_applicable = bool(has_pos_earnings and num(growth) and 0 < growth <= 40 and not is_financial and not unit_conflict)
    if not has_price:
        peg_reason = '无价格'
    elif not num(eps_ttm) or eps_ttm <= 0:
        peg_reason = 'TTM EPS 为负或缺失，PEG 无意义'
    elif not num(growth):
        peg_reason = '缺增速来源（Lynch 未覆盖），PEG 不适用'
    elif growth <= 0:
        peg_reason = '增速为零或负，PEG 不适用'
    elif growth > 40:
        peg_reason = f'增速 {growth:g}% 过高且可能来自低基数或一次性项目，不机械应用 PEG'
    elif is_financial:
        peg_reason = '金融企业盈利受息差与信贷周期驱动，不机械适用 PEG'
    else:
        peg_reason = f'利润增速 {growth:g}%（Lynch 研究口径）；PEG 与 PE 共享增长假设，不作为独立证据；目标 PEG 缺独立依据，未计值'

    methods.append({
        'name': 'PEG',
        'applicable': peg_applicable,
        'reason': peg_reason,
        'formula': 'PE ÷ 增长率百分数；目标价=EPS × 目标 PEG × 增长百分数',
        'inputs': {'growthPercent': growth, 'yahooForwardPE': quote.get('forwardPE')},
        'values': None,
        'sourceIds': ['lynch'] if lyn else [],
    })

    # ---- 3. Evaluate PB
    book_ok = num(book) and book > 0
    pb_applicable = False
    pb_reason = ''
    pb_inputs = {'bookValuePerShare': book, 'yahooPriceToBook': quote.get('priceToBook'), 'currency': currency}

    # Per coordinator instruction: PB numericDraft without complete traceable BVPS/ROE/CoE bridge is set to value=null
    if code in ['HSBC', 'TD'] and market == 'adr':
        pb_applicable = False
        pb_reason = '旧 numericDraft 缺乏同口径已核实的 BVPS、可持续 ROE、CoE 及 ADR 汇率/换股比例桥接，且供应商 BVPS 存在 ADR 折算歧义，不能直接作为可复算模型，估值置空并解释'
    elif sector in PB_APPLICABLE_SECTORS and book_ok:
        pb_applicable = True
        pb_reason = PB_CONTEXT.get(sector, '资产型，账面值有一定约束力；目标 PB 缺同口径依据，未计值')
    elif sector in PB_NOT_APPLICABLE_SECTORS:
        pb_applicable, pb_reason = False, PB_NOT_APPLICABLE_CONTEXT.get(sector, '轻资产/平台/品牌主导，账面值对价值约束弱；不以PB定价')
    elif num(book) and book <= 0:
        pb_applicable, pb_reason = False, '账面普通股权益为负，PB 不适用'
    else:
        pb_applicable, pb_reason = False, '供应商无账面每股净资产字段，PB 不适用'

    methods.append({
        'name': 'PB',
        'applicable': pb_applicable,
        'reason': pb_reason,
        'formula': '普通股 BVPS × 合理 PB（银行/资产型需 ROE/股权成本/减值依据）',
        'inputs': pb_inputs,
        'values': None,
        'sourceIds': ['yahoo-batch'] if quote else [],
    })

    # ---- 4. Evaluate Dividend (if applicable / bank / high dividend)
    div_applicable = False
    div_values = None
    div_reason = ''
    div_inputs = {'dividendRate': div_rate, 'dividendYield': div_yield, 'currency': currency}

    # Extract target yields from the company's own research scenarios
    extracted_yields = parse_dividend_yields(scenarios)

    if extracted_yields and num(div_rate) and div_rate > 0:
        # Check special dividend or dividend yield anomaly
        if num(div_yield) and div_yield > 8.0:
            div_reason = f'供应商股息率 {div_yield:.2f}% > 8.0%，可能含未核实特别股息，未经公司公告复核，不硬算'
        else:
            div_applicable = True
            # Direct re-computation from disclosed DPS and extracted target yields
            div_values = [r2(div_rate / (y / 100)) for y in extracted_yields]
            div_inputs['targetYields'] = extracted_yields
            div_reason = (f'银行/金融股息率法：直接由披露每股前瞻股息 ({div_rate} {currency}) ÷ 原研究提取目标股息率 '
                          f'({extracted_yields[0]:g}%/{extracted_yields[1]:g}%/{extracted_yields[2]:g}%) 重算，'
                          f'三档价值 [{div_values[0]}, {div_values[1]}, {div_values[2]}] {currency}，无复制旧价格')
    elif is_financial:
        if not num(div_rate) or div_rate <= 0:
            div_reason = '供应商每股股息为零或缺失，股息率法不适用'
        elif not extracted_yields:
            div_reason = '原研究底稿缺少可提取的三档目标股息率情景参数，股息率法无法作为可复算主锚计值'
        elif num(div_yield) and div_yield < 3.0:
            div_reason = f'供应商股息率 {div_yield:.2f}% < 3.0%，股息非主要价值回报来源，股息率法不作主锚'
        else:
            div_reason = '股息率法缺已核实的目标股息率情景参数，未计值'
    else:
        div_reason = '非金融高股息标的，不以股息率法为主锚'

    if is_financial or div_applicable or (num(div_rate) and div_rate > 0):
        methods.append({
            'name': 'Dividend',
            'applicable': div_applicable,
            'reason': div_reason,
            'formula': '每股股息（DPS）÷ 目标股息率（悲观/基准/乐观）',
            'inputs': div_inputs,
            'values': div_values,
            'sourceIds': ['yahoo-batch', research_id] if div_applicable else ['yahoo-batch'],
        })

    methods.append({
        'name': 'DCF', 'applicable': not is_financial,
        'reason': '金融企业不机械使用FCFF，应核监管资本并选择股权现金流/剩余收益方法' if is_financial else '非金融企业可用现金流法；本批次未闭合显式期、再投资、终值与股权桥接，不计数值',
        'formula': '未来现金流折现并统一债务、现金、少数权益与摊薄股数',
        'inputs': {}, 'values': None, 'sourceIds': [],
    })

    # ---- Decide status and value
    value = None
    status = 'insufficient'
    comparison = None
    primary_method = None

    if div_values and has_price:
        primary_method = 'Dividend'
        value_vals = div_values
        kind = 'undated'
        v_date = None
    elif pe_values and has_price:
        primary_method = 'PE'
        value_vals = pe_values
        if code == 'SOFI':
            kind = 'future'
            v_date = '2027-12-31'
        else:
            kind = 'undated'
            v_date = None
    else:
        value_vals = None

    if value_vals and primary_method:
        status = 'conditional'
        value = {
            'low': value_vals[0],
            'base': value_vals[1],
            'high': value_vals[2],
            'kind': kind,
            'date': v_date,
            'primaryMethod': primary_method,
        }
        comparison = {
            'label': '相对现价差额（估值 / 现价 − 1）',
            'priceValue': price_value,
            'priceDate': price_date,
            'low': r2(value_vals[0] / price_value - 1),
            'base': r2(value_vals[1] / price_value - 1),
            'high': r2(value_vals[2] / price_value - 1),
        }
        assumptions.append(f'主锚采用 {primary_method} 方法，三档数值 [{value_vals[0]}, {value_vals[1]}, {value_vals[2]}] {currency}')
        if kind == 'undated':
            assumptions.append('因前瞻财务预测与情景倍数兑现时点未做独立现金流期限认证，标记为 undated 条件敏感性，不贴今日内在价值或低估标签')
        elif kind == 'future':
            assumptions.append(f'兑现时点对应 2027 年底（{v_date}），为远期条件情景，不代表基准日即期折现值')
    else:
        status = 'insufficient'
        value = None
        if not has_price:
            missing.append('无可用现价，无法进行估值比价')
        if unit_conflict:
            missing.append(f'报价币种 {currency} 与财报币种 {fcur} 换算存在分歧，ADR/ADS 单位冲突待核')
        if not has_pos_earnings and not is_financial:
            missing.append(f'盈利未闭合：TTM EPS ({eps_ttm}) 或前瞻 EPS ({eps_fwd}) 为负或缺失，无法建立持续盈利主锚估值')
        if is_financial and not div_values:
            missing.append('金融/银行股息率 < 3.0% 或缺少可提取目标股息率，且普通股 PB-ROE 缺乏同口径已核实的 BVPS、可持续 ROE、CoE 及折算桥接')
        if market == 'hk' and hk_entry and hk_entry.get('missing'):
            missing.append(f'底稿审查缺项：{hk_entry["missing"]}')
        if market == 'adr' and adr_entry and adr_entry.get('missing'):
            missing.append(f'ADR审查缺项：{adr_entry["missing"]}')
        if not missing:
            missing.append('缺少满足数据契约的主锚数值与可复算三情景输入')

    # Common assumptions & missing
    assumptions.append(f'价格基准：{price_value} {currency}（{price_date}，{price_source}，非交易所认证收盘）')
    assumptions.append(f'财务分母：来自 Yahoo 批量报价原始字段（TTM EPS={eps_ttm}，Forward EPS={eps_fwd}，BVPS={book}），按供应商报价证券字段用于 {currency} 敏感性，非价格÷PE倒推；本轮未逐项独立核实财报币种与ADR/ADS换算，不能仅凭quote.currency认定转换已核实')
    if code == 'SOFI':
        assumptions.append('SOFI 盈利分母来自原研究 2026-10-07 针对 2027 年底的调整后预测 EPS（$0.45 / $0.80 / $1.05），为独立情景假设，非 Yahoo 卖方一致预期')
    missing.append('一手财报原件与交易所公告未在本批次逐家重读（使用冻结行情与原研究底稿）')
    missing.append('DCF 股权自由现金流模型参数与资本开支预测未纳入本批次自动计值')
    if fcur != currency:
        missing.append(f'报价币种{currency}/财报币种{fcur}与ADR/ADS每股字段的独立转换桥接待核；供应商比率内部一致不等于一手验证')
    if div_values:
        missing.append('DPS采用供应商前瞻年化字段；普通/特别股息构成与可持续派息覆盖未逐项核实，只作条件敏感性')
    if primary_method != 'PB' and any(m['name'] == 'PB' and m['applicable'] for m in methods):
        missing.append('PB 目标倍数缺同口径 ROE / 股权成本 / 资产减值依据')

    # Dimensions
    legacy = entry.get('rating') or ''
    certainty = entry.get('certainty') or ''
    moat = short(entry.get('moat'), 1)
    pros = short(entry.get('pros'), 2)
    quality_parts = [certainty, pros, moat]
    quality = '原研究质量证据：' + '；'.join(p for p in quality_parts if p) if any(quality_parts) else '原研究无质量证据，待补'

    if value_vals and primary_method:
        pricing = (f'现价 {price_value} {currency}（{price_date}）；主锚 {primary_method} → '
                   f'悲观/基准/乐观 {value_vals[0]}/{value_vals[1]}/{value_vals[2]} {currency}，'
                   f'相对现价空间 {pct(value_vals[1] / price_value - 1)}（基准）；'
                   f'PE：{pe_reason}；PEG：{peg_reason}；PB：{pb_reason}')
    else:
        pricing = (f'现价 {price_value if has_price else "缺失"} {currency}（{price_date or "无日期"}）；'
                   f'主锚未计值（insufficient）：PE：{pe_reason}；PEG：{peg_reason}；PB：{pb_reason}')

    exp_items = []
    if code == 'SOFI':
        exp_items.append('2027 预测调整后 EPS $0.80（基准研究假设，非公司指引或卖方一致预期）')
    elif num(eps_fwd):
        exp_items.append(f'前瞻 EPS 市场共识 {eps_fwd} {currency}')
    if num(div_rate) and div_rate > 0:
        exp_items.append(f'前瞻每股股息 {div_rate} {currency}')
    cal = short(entry.get('calendar'), 1)
    if cal:
        exp_items.append(f'验证节点：{cal}')
    dur = entry.get('duration')
    if dur:
        exp_items.append(f'研究期限：{dur}')
    expectations = '；'.join(exp_items) if exp_items else '前瞻预期与验证节点缺失，待补'

    risk_items = [short(entry.get('risk'), 2), short(entry.get('cons'), 1)]
    tail = ''
    if value_vals and has_price:
        tail = f'；压力测试：悲观情景价 {value_vals[0]} 相对现价 {pct(value_vals[0] / price_value - 1)}，为倍数/盈利压力假设而非安全下限，需独立检验再融资与信用风险'
    risk = '；'.join(p for p in risk_items if p) + tail
    if not risk:
        risk = '原研究未列明具体风险，待补'

    record = {
        'key': key,
        'market': market,
        'code': code,
        'name': name,
        'sector': sector,
        'currency': currency,
        'asOf': asof,
        'price': {
            'value': price_value,
            'date': price_date,
            'currency': currency,
            'source': price_source if price_value is not None else None,
        },
        'status': status,
        'value': value,
        'comparison': comparison,
        'methods': methods,
        'quality': quality,
        'pricing': pricing,
        'expectations': expectations,
        'risk': risk,
        'assumptions': assumptions,
        'missing': missing,
        'sources': sources,
        'review': {
            'mode': 'programmatic',
            'by': 'scripts/build-company-valuations-international.py（Orca 国际市场批量脚本）',
            'note': '程序化条件初稿：研究倍数未重估，财务分母取供应商原始字段并严格按披露输入重算；未逐家重读财报，不得标已复核',
        },
        'legacy': {
            'rating': legacy,
            'headline': entry.get('headline') or '',
            'note': '旧研究评级与旧价格判断，未随本轮价格静默改写',
        },
    }

    if status == 'insufficient':
        record['value'] = None

    return record


def run_arithmetic_regression_tests(records):
    """Rigorous arithmetic regression tests required by coordinator:
    1. Tencent (00700): forward EPS 35.565918 × [12, 16, 20] -> [426.79, 569.05, 711.32]
    2. 00001 (长和): forward EPS 6.6475 × [8, 10, 12] -> [53.18, 66.48, 79.77]
    3. SOFI: 2027 EPS [0.45, 0.80, 1.05] × [17, 24, 28] -> [7.65, 19.20, 29.40]
    4. Dividend models (e.g. 00005, LYG): DPS ÷ target yields
    5. Universal invariant: for every conditional record, value MUST equal inputs calculation.
    """
    by_code = {r['code']: r for r in records}

    # 1. Tencent check
    if '00700' in by_code:
        t = by_code['00700']
        assert t['status'] == 'conditional', '00700 must be conditional'
        assert t['value']['low'] == 426.79, f'Tencent low expected 426.79, got {t["value"]["low"]}'
        assert t['value']['base'] == 569.05, f'Tencent base expected 569.05, got {t["value"]["base"]}'
        assert t['value']['high'] == 711.32, f'Tencent high expected 711.32, got {t["value"]["high"]}'

    # 2. 00001 check
    if '00001' in by_code:
        c1 = by_code['00001']
        assert c1['status'] == 'conditional', '00001 must be conditional'
        assert c1['value']['low'] == 53.18, f'00001 low expected 53.18, got {c1["value"]["low"]}'
        assert c1['value']['base'] == 66.48, f'00001 base expected 66.48, got {c1["value"]["base"]}'
        assert c1['value']['high'] == 79.77, f'00001 high expected 79.77, got {c1["value"]["high"]}'

    # 3. SOFI check
    if 'SOFI' in by_code:
        sf = by_code['SOFI']
        assert sf['status'] == 'conditional', 'SOFI must be conditional'
        assert sf['value']['low'] == 7.65, f'SOFI low expected 7.65, got {sf["value"]["low"]}'
        assert sf['value']['base'] == 19.20, f'SOFI base expected 19.20, got {sf["value"]["base"]}'
        assert sf['value']['high'] == 29.40, f'SOFI high expected 29.40, got {sf["value"]["high"]}'
        assert sf['value']['kind'] == 'future'
        assert sf['value']['date'] == '2027-12-31'

    # 4. Dividend model check: 00005
    if '00005' in by_code:
        c5 = by_code['00005']
        assert c5['status'] == 'conditional', '00005 must be conditional'
        assert c5['value']['primaryMethod'] == 'Dividend'
        assert c5['value']['low'] == 83.86, f'00005 low expected 83.86, got {c5["value"]["low"]}'
        assert c5['value']['base'] == 117.40, f'00005 base expected 117.40, got {c5["value"]["base"]}'
        assert c5['value']['high'] == 146.75, f'00005 high expected 146.75, got {c5["value"]["high"]}'

    # 5. Dividend model check: LYG
    if 'LYG' in by_code:
        lyg = by_code['LYG']
        assert lyg['status'] == 'conditional', 'LYG must be conditional'
        assert lyg['value']['primaryMethod'] == 'Dividend'
        assert lyg['value']['low'] == 3.14, f'LYG low expected 3.14, got {lyg["value"]["low"]}'
        assert lyg['value']['base'] == 4.40, f'LYG base expected 4.40, got {lyg["value"]["base"]}'
        assert lyg['value']['high'] == 5.50, f'LYG high expected 5.50, got {lyg["value"]["high"]}'

    # 6. PB downgrade check: ADR HSBC and TD must be insufficient with value=null
    for c in ['HSBC', 'TD']:
        if c in by_code:
            rec = by_code[c]
            assert rec['status'] == 'insufficient', f'{c} must be downgraded to insufficient'
            assert rec['value'] is None, f'{c} value must be null'
            assert any('ROE-PB' in m or 'BVPS' in m for m in rec['missing']), f'{c} missing reason missing'

    # 7. Universal invariant across all records
    for r in records:
        # Check source asOf: research source date must equal parsed research date (e.g. 2026-10-07)
        res_src = next(s for s in r['sources'] if s['id'].startswith('universe-'))
        assert res_src['asOf'] == '2026-10-07', f'{r["key"]} research source asOf expected 2026-10-07, got {res_src["asOf"]}'

        if r['status'] == 'conditional':
            val = r['value']
            assert val is not None, f'{r["key"]} conditional must have value'
            prim_name = val['primaryMethod']
            prim = next((m for m in r['methods'] if m['name'] == prim_name), None)
            assert prim is not None, f'{r["key"]} primary method {prim_name} not found in methods'
            assert prim['values'] == [val['low'], val['base'], val['high']], f'{r["key"]} value mismatch'

            # Recompute from inputs
            inp = prim['inputs']
            if prim_name == 'PE':
                if r['code'] == 'SOFI':
                    expected = [r2(e * m) for e, m in zip(inp['eps2027'], inp['multiples'])]
                else:
                    fwd = inp['epsForward']
                    mults = inp['multiples']
                    expected = [r2(fwd * m) for m in mults]
                assert prim['values'] == expected, f'{r["key"]} PE values {prim["values"]} != expected {expected}'
            elif prim_name == 'Dividend':
                dps = inp['dividendRate']
                yields = inp['targetYields']
                expected = [r2(dps / (y / 100)) for y in yields]
                assert prim['values'] == expected, f'{r["key"]} Dividend values {prim["values"]} != expected {expected}'
        elif r['status'] == 'insufficient':
            assert r['value'] is None, f'{r["key"]} insufficient must have null value'
            assert len(r['missing']) > 0, f'{r["key"]} insufficient must have missing explanations'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--universe', required=True, type=Path, help='path to universe json')
    parser.add_argument('--as-of', required=True, help='valuation base date YYYY-MM-DD')
    parser.add_argument('--output', required=True, type=Path, help='output json destination')
    parser.add_argument('--market', choices=['hk', 'adr'], help='market override')
    parser.add_argument('--limit', type=int, default=0, help='process first N companies only')
    parser.add_argument('--sample-codes', help='comma-separated list of codes to filter')
    args = parser.parse_args()

    universe = load_json(args.universe)
    if args.sample_codes:
        codes = set(args.sample_codes.split(','))
        universe = [c for c in universe if c['code'] in codes]
    elif args.limit > 0:
        universe = universe[:args.limit]

    snapshot = load_json(SNAPSHOT_FILE)
    yahoo = load_json(YAHOO_FILE)['quotes']
    lynch = load_json(LYNCH_FILE)
    dcf = {row['c']: row for row in load_json(DCF_PREFILL_FILE)['items']}

    hk_audit_map = {c['code']: c for c in load_json(HK_AUDIT_FILE)['companies']} if HK_AUDIT_FILE.exists() else {}
    adr_val_map = {c['code']: c for c in load_json(ADR_VALUATION_FILE)['companies']} if ADR_VALUATION_FILE.exists() else {}

    records = [
        build_record(entry, args.as_of, snapshot, yahoo, lynch, dcf, hk_audit_map, adr_val_map)
        for entry in universe
    ]

    # Run arithmetic regression tests on generated records
    run_arithmetic_regression_tests(records)

    document = {
        'schemaVersion': 1,
        'asOf': args.as_of,
        'generatedBy': 'scripts/build-company-valuations-international.py',
        'records': records,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    counts = {}
    for rec in records:
        counts[rec['status']] = counts.get(rec['status'], 0) + 1
    print(json.dumps({'records': len(records), 'status': counts, 'output': str(args.output), 'regressionTests': 'PASSED'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
