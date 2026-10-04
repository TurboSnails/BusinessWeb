import { fetchJson, eastmoneyUrl } from "./network.mjs";
import { fact } from "./normalize.mjs";
const sum = (values) =>
  values.some((v) => v != null)
    ? values.reduce((a, v) => a + (Number(v) || 0), 0)
    : null;
const unitOf = (key) =>
  key === "shares"
    ? "shares"
    : /^(eps|dps)/.test(key)
      ? "currency/share"
      : "currency";
const INSTANT = new Set([
  "equity",
  "shares",
  "cash",
  "shortTermDeposits",
  "minority",
  "preferred",
  "totalAssets",
  "totalLiabilities",
  "receivables",
  "inventory",
  "currentAssets",
  "currentLiabilities",
  "goodwill",
  "debt",
  "contractLiabilities",
]);
function addFacts(target, entries, { date, currency, suffix = "", sourceId }) {
  for (const [key, spec] of Object.entries(entries)) {
    const { value, note } =
      typeof spec === "object" && spec !== null ? spec : { value: spec };
    if (value == null || !Number.isFinite(Number(value))) continue;
    target[key + suffix] = fact(value, {
      currency: key === "shares" ? "" : currency,
      unit: unitOf(key),
      date,
      sourceId,
      basis: INSTANT.has(key) ? "spot" : "annual",
      start: INSTANT.has(key) ? date : date.slice(0, 4) + "-01-01",
      note,
    });
  }
}
// 权益构成对账：各组成项之和与归母权益相差不超过 0.5% 时，才能证明没有未列示的优先股/永续债
function equityReconciles(total, parts) {
  const sumParts = parts.reduce((a, v) => a + (Number(v) || 0), 0);
  return (
    Number.isFinite(total) &&
    total > 0 &&
    Math.abs(sumParts - total) / total <= 0.005
  );
}
// ---- A 股 ----
const CN_DEBT = [
  ["SHORT_LOAN", "短期借款"],
  ["LONG_LOAN", "长期借款"],
  ["BOND_PAYABLE", "应付债券"],
  ["NONCURRENT_LIAB_1YEAR", "一年内到期的非流动负债"],
  ["LEASE_LIAB", "租赁负债"],
];
export function cnEntries(lrb = {}, zcfzb = {}, xjllb = {}, general = true) {
  const e = {
    revenue: lrb.OPERATE_INCOME,
    costOfRevenue: lrb.OPERATE_COST,
    netIncome: lrb.PARENT_NETPROFIT,
    eps: lrb.DILUTED_EPS,
    ebit: {
      value: lrb.OPERATE_PROFIT,
      note: "营业利润：含投资收益与公允价值变动、已扣财务费用，并非严格EBIT",
    },
    pretaxProfit: lrb.TOTAL_PROFIT,
    incomeTax: lrb.INCOME_TAX,
    interestExpense: lrb.FE_INTEREST_EXPENSE,
    deductedNetIncome: {
      value: lrb.DEDUCT_PARENT_NETPROFIT,
      note: "扣除非经常性损益后的归母净利润",
    },
    researchExpense: lrb.RESEARCH_EXPENSE,
    sellingExpense: lrb.SALE_EXPENSE,
    adminExpense: lrb.MANAGE_EXPENSE,
    equity: zcfzb.TOTAL_PARENT_EQUITY,
    shares: zcfzb.SHARE_CAPITAL,
    minority: zcfzb.MINORITY_EQUITY,
    preferred: zcfzb.PREFERRED_SHARES,
    totalAssets: zcfzb.TOTAL_ASSETS,
    totalLiabilities: zcfzb.TOTAL_LIABILITIES,
    currentAssets: zcfzb.TOTAL_CURRENT_ASSETS,
    currentLiabilities: zcfzb.TOTAL_CURRENT_LIAB,
    inventory: zcfzb.INVENTORY,
    goodwill: zcfzb.GOODWILL,
    contractLiabilities: zcfzb.CONTRACT_LIAB,
    receivables: sum([zcfzb.NOTE_ACCOUNTS_RECE ?? zcfzb.ACCOUNTS_RECE]),
    operatingCashflow: xjllb.NETCASH_OPERATE,
    capex: {
      value: xjllb.CONSTRUCT_LONG_ASSET,
      note: "购建固定资产、无形资产和其他长期资产支付的现金",
    },
    investingCashflow: xjllb.NETCASH_INVEST,
    financingCashflow: xjllb.NETCASH_FINANCE,
    dividendsPaid: {
      value: xjllb.ASSIGN_DIVIDEND_PORFIT,
      note: "分配股利、利润或偿付利息支付的现金，含利息，略高估分红",
    },
    da: {
      value: sum([
        xjllb.FA_IR_DEPR,
        xjllb.IA_AMORTIZE,
        xjllb.LPE_AMORTIZE,
        xjllb.USERIGHT_ASSET_AMORTIZE,
      ]),
      note: "现金流量表补充资料：固定资产折旧+无形资产摊销+长期待摊费用摊销+使用权资产折旧",
    },
  };
  if (general) {
    const hasEquityTool =
      zcfzb.PREFERRED_SHARES != null ||
      zcfzb.OTHER_EQUITY_TOOL != null ||
      zcfzb.PERPETUAL_BOND != null;
    if (
      !hasEquityTool &&
      equityReconciles(zcfzb.TOTAL_PARENT_EQUITY, [
        zcfzb.SHARE_CAPITAL,
        zcfzb.CAPITAL_RESERVE,
        zcfzb.SURPLUS_RESERVE,
        zcfzb.UNASSIGN_RPOFIT,
        zcfzb.GENERAL_RISK_RESERVE,
        zcfzb.SPECIAL_RESERVE,
        zcfzb.OTHER_COMPRE_INCOME,
        -(zcfzb.TREASURY_SHARES || 0),
      ])
    )
      e.preferred = {
        value: 0,
        note: "归母权益构成项之和与归母权益对账一致，无优先股/永续债科目",
      };
    const investments = [
      ["LONG_EQUITY_INVEST", "长期股权投资"],
      ["TRADE_FINASSET_NOTFVTPL", "交易性金融资产"],
      ["OTHER_NONCURRENT_FINASSET", "其他非流动金融资产"],
      ["CREDITOR_INVEST", "债权投资"],
      ["OTHER_CREDITOR_INVEST", "其他债权投资"],
      ["OTHER_EQUITY_INVEST", "其他权益工具投资"],
      ["INVEST_REALESTATE", "投资性房地产"],
    ].filter(([k]) => zcfzb[k] != null);
    if (investments.length)
      e.nonOperating = {
        value: sum(investments.map(([k]) => zcfzb[k])),
        note:
          "按账面价值汇总：" +
          investments.map(([, n]) => n).join("、") +
          "；不含拆出资金/买入返售等金融业务资产，联营公司账面价值可能显著偏离市值",
      };
    e.cash = {
      value: zcfzb.MONETARYFUNDS,
      note: "货币资金（含受限资金）",
    };
    // 接口对为零/未披露的项目不返回字段，无法区分“零”与“缺失”，所以
    // 必须至少出现一项明确的借款类科目才给出债务，否则保持缺失。
    const found = CN_DEBT.filter(([k]) => zcfzb[k] != null);
    if (
      found.some(([k]) =>
        ["SHORT_LOAN", "LONG_LOAN", "BOND_PAYABLE"].includes(k),
      )
    )
      e.debt = {
        value: sum(found.map(([k]) => zcfzb[k])),
        note:
          "含：" + found.map(([, n]) => n).join("、") + "；不含其他金融负债",
      };
  }
  return e;
}
export async function collectChina(security, { asOf, signal }) {
  const code = (security.code.startsWith("6") ? "SH" : "SZ") + security.code;
  const base =
    "https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/";
  const page = await fetch(base + `Index?type=web&code=${code}`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (!page.ok) throw new Error("东方财富公司类型读取失败");
  const html = await page.text();
  const type = html.match(/id=["']hidctype["'][^>]*value=["'](\d+)["']/)?.[1];
  if (!type) throw new Error("公司类型字段缺失");
  const build = (path, params) => {
    const u = new URL(base + path);
    Object.entries({
      ...params,
      companyType: type,
      reportDateType: "1",
      code,
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  };
  const dates = await fetchJson(build("lrbDateAjaxNew", {}), { signal });
  const usable = (dates.data || [])
    .map((d) => d.REPORT_DATE?.slice(0, 10))
    .filter((d) => d && d <= asOf);
  const date = usable[0],
    prior = usable[1];
  if (!date) throw new Error("未取得年报日期");
  const want = [date, prior].filter(Boolean).join(",");
  const results = await Promise.allSettled(
    ["lrb", "zcfzb", "xjllb"].map((p) =>
      fetchJson(build(p + "AjaxNew", { dates: want, reportType: "1" }), {
        signal,
      }),
    ),
  );
  const missing = [];
  const rows = results.map((r, i) => {
    if (r.status === "rejected") {
      missing.push(`报表${i + 1}：${r.reason.message}`);
      return {};
    }
    const list = r.value.data || [];
    const pick = (d) =>
      list.find(
        (x) =>
          x.REPORT_DATE?.slice(0, 10) === d &&
          (!x.NOTICE_DATE || x.NOTICE_DATE.slice(0, 10) <= asOf),
      ) || {};
    return { cur: pick(date), prev: prior ? pick(prior) : {} };
  });
  const orgType = rows[1].cur?.ORG_TYPE || rows[0].cur?.ORG_TYPE || "";
  const general = !orgType || orgType === "通用";
  if (!general)
    missing.push(
      `${orgType}企业报表口径与一般企业不同：未自动采集现金与有息债务，需按行业口径补充`,
    );
  const facts = {};
  const src = { currency: "CNY", sourceId: "eastmoney" };
  addFacts(facts, cnEntries(rows[0].cur, rows[1].cur, rows[2].cur, general), {
    ...src,
    date,
  });
  if (prior) {
    const p = cnEntries(rows[0].prev, rows[1].prev, rows[2].prev, general);
    const keep = Object.fromEntries(
      [
        "revenue",
        "netIncome",
        "eps",
        "ebit",
        "operatingCashflow",
        "equity",
        "totalAssets",
      ]
        .filter((k) => p[k] != null)
        .map((k) => [k, p[k]]),
    );
    addFacts(facts, keep, { ...src, date: prior, suffix: "Prior" });
  }
  return {
    facts,
    ...(general ? {} : { financial: true }),
    sources: [
      {
        id: "eastmoney",
        title: "东方财富年度财务报表",
        url: base + `Index?type=web&code=${code}`,
      },
    ],
    missing,
  };
}
// ---- 港股 ----
const HKF10 = "https://datacenter.eastmoney.com/securities/api/data/v1/get";
function hkStatementUrl(report, code, date) {
  const u = new URL(HKF10);
  Object.entries({
    reportName: report,
    columns: "ALL",
    filter: `(SECUCODE="${code}.HK")(REPORT_DATE='${date}')`,
    pageSize: "200",
    source: "F10",
    client: "PC",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}
const byCode = (rows = []) =>
  new Map(rows.map((r) => [r.STD_ITEM_CODE, Number(r.AMOUNT)]));
const get = (m, c) => (m.has(c) && Number.isFinite(m.get(c)) ? m.get(c) : null);
const HK_DEBT = [
  ["004011010", "短期贷款"],
  ["004020001", "长期贷款"],
  ["004011002", "应付票据(流动)"],
  ["004020018", "应付票据(非流动)"],
  ["004011006", "融资租赁负债(流动)"],
  ["004020005", "融资租赁负债(非流动)"],
];
export function hkEntries(
  bal = new Map(),
  inc = new Map(),
  cf = new Map(),
  main = {},
) {
  const e = {
    revenue: main.OPERATE_INCOME ?? get(inc, "004001999"),
    grossProfit: get(inc, "004007999"),
    netIncome: main.HOLDER_PROFIT ?? get(inc, "004025002"),
    eps: main.DILUTED_EPS,
    shares: main.ISSUED_COMMON_SHARES,
    ebit: {
      value: main.OPERATE_PROFIT ?? get(inc, "004010999"),
      note: "经营溢利，未含应占联营公司溢利与利息收入，并非严格EBIT",
    },
    pretaxProfit: get(inc, "004011999"),
    incomeTax: get(inc, "004012001"),
    interestExpense: get(inc, "004011201"),
    sellingExpense: get(inc, "004010003"),
    adminExpense: get(inc, "004010004"),
    operatingCashflow: main.NETCASH_OPERATE ?? get(cf, "003999"),
    investingCashflow: get(cf, "005999"),
    financingCashflow: get(cf, "007999"),
    dividendsPaid: { value: get(cf, "007004"), note: "融资活动已付股息" },
    buybacks: { value: get(cf, "007008"), note: "回购股份支付的现金" },
    da: { value: get(cf, "001009"), note: "现金流量表：折旧及摊销" },
    equity: main.TOTAL_PARENT_EQUITY ?? get(bal, "004030999"),
    minority: get(bal, "004027999"),
    totalAssets: main.TOTAL_ASSETS ?? get(bal, "004009999"),
    totalLiabilities: main.TOTAL_LIABILITIES ?? get(bal, "004025999"),
    currentAssets: get(bal, "004002999"),
    currentLiabilities: get(bal, "004011999"),
    inventory: get(bal, "004002001"),
    receivables: get(bal, "004002003"),
    cash: {
      value: get(bal, "004002010"),
      note: "现金及等价物（不含短期存款与受限制存款）",
    },
    shortTermDeposits: {
      value: get(bal, "004002011"),
      note: "短期存款，可视为类现金资产",
    },
  };
  const ppe = get(cf, "005005"),
    intangibles = get(cf, "005007");
  if (ppe != null)
    e.capex = {
      value: ppe + (intangibles ?? 0),
      note:
        intangibles != null
          ? "购建固定资产+购建无形资产及其他资产"
          : "仅购建固定资产，未含无形资产",
    };
  // 权益构成对账：证明无未列示的优先股
  if (
    bal.size &&
    equityReconciles(get(bal, "004030999"), [
      get(bal, "004030001"),
      get(bal, "004030003"),
      get(bal, "004030004"),
      get(bal, "004030009"),
      get(bal, "004030012"),
    ])
  )
    e.preferred = {
      value: 0,
      note: "股东权益构成项之和与股东权益对账一致，无优先股科目",
    };
  // 非经营资产：标准化资产负债表逐项列示，未出现的科目即为零
  if (bal.size) {
    const inv = [
      ["004001013", "联营公司权益"],
      ["004001016", "合营公司权益"],
      ["004001022", "指定以公允价值记账之金融资产"],
      ["004001031", "其他金融资产(非流动)"],
      ["004002013", "指定以公允价值记账之金融资产(流动)"],
      ["004002022", "其他金融资产(流动)"],
      ["004001030", "中长期存款"],
      ["004002011", "短期存款"],
      ["004001003", "投资物业"],
    ].filter(([c]) => get(bal, c) != null);
    e.nonOperating = {
      value: sum(inv.map(([c]) => get(bal, c))) ?? 0,
      note: inv.length
        ? "按账面价值汇总：" +
          inv.map(([, n]) => n).join("、") +
          "；联营公司权益账面价值可能显著偏离市值，金融资产未做估值调整"
        : "资产负债表无联营/金融资产/存款类科目",
    };
  }
  const found = HK_DEBT.filter(([c]) => get(bal, c) != null);
  if (
    found.some(([c]) =>
      ["004011010", "004020001", "004011002", "004020018"].includes(c),
    )
  )
    e.debt = {
      value: sum(found.map(([c]) => get(bal, c))),
      note: "含：" + found.map(([, n]) => n).join("、") + "；不含其他金融负债",
    };
  return e;
}
export async function collectHongKong(security, { asOf, signal }) {
  const url = eastmoneyUrl(
    "RPT_HKF10_FN_MAININDICATOR",
    security.code,
    '(DATE_TYPE_CODE="001")',
  );
  const [data, currencies] = await Promise.all([
    fetchJson(url, { signal }),
    fetchJson(
      eastmoneyUrl("RPT_CUSTOM_HKSK_APPFN_CASHFLOW_SUMMARY", security.code),
      { signal },
    ),
  ]);
  const rows = (data.result?.data || []).filter(
    (r) => r.REPORT_DATE.slice(0, 10) <= asOf,
  );
  const row = rows[0];
  if (!row) throw new Error("未取得港股年度指标");
  const date = row.REPORT_DATE.slice(0, 10),
    prior = rows[1]?.REPORT_DATE?.slice(0, 10);
  const report = currencies.result?.data?.[0]?.REPORT_LIST?.find(
    (r) => r.REPORT_DATE.slice(0, 10) === date,
  );
  const currency =
    { 人民币: "CNY", 港元: "HKD", 港币: "HKD", 美元: "USD", 欧元: "EUR" }[
      report?.CURRENCY
    ] || report?.CURRENCY;
  if (!/^[A-Z]{3}$/.test(currency || ""))
    throw new Error("无法核实港股财报币种");
  const missing = [];
  const load = async (d) => {
    const reports = [
      "RPT_HKF10_FN_BALANCE_PC",
      "RPT_HKF10_FN_INCOME_PC",
      "RPT_HKF10_FN_CASHFLOW_PC",
    ];
    const res = await Promise.allSettled(
      reports.map((r) =>
        fetchJson(hkStatementUrl(r, security.code, d), { signal }),
      ),
    );
    return res.map((r, i) => {
      if (r.status === "rejected") {
        missing.push(
          `${d} ${["资产负债表", "利润表", "现金流量表"][i]}：${r.reason.message}`,
        );
        return new Map();
      }
      return byCode(r.value.result?.data);
    });
  };
  const [cur, prev] = await Promise.all([
    load(date),
    prior ? load(prior) : null,
  ]);
  const orgType = row.ORG_TYPE || "";
  if (orgType && orgType !== "一般企业")
    missing.push(
      `${orgType}报表条目与一般企业不同，资产负债表与现金流明细可能不全，需按行业口径核对`,
    );
  const facts = {};
  const src = { currency, sourceId: "eastmoney" };
  addFacts(facts, hkEntries(cur[0], cur[1], cur[2], row), { ...src, date });
  if (prev) {
    const p = hkEntries(prev[0], prev[1], prev[2], rows[1]);
    const keep = Object.fromEntries(
      [
        "revenue",
        "netIncome",
        "eps",
        "ebit",
        "operatingCashflow",
        "equity",
        "totalAssets",
      ]
        .filter((k) => p[k] != null)
        .map((k) => [k, p[k]]),
    );
    addFacts(facts, keep, { ...src, date: prior, suffix: "Prior" });
  }
  // 数据源直接披露的指标，保留为参照（口径以数据源为准）
  const reported = {
    reportedRoe: row.ROE_YEARLY != null ? row.ROE_YEARLY / 100 : null,
    reportedRoic: row.ROIC_YEARLY != null ? row.ROIC_YEARLY / 100 : null,
  };
  for (const [key, value] of Object.entries(reported))
    if (Number.isFinite(value))
      facts[key] = fact(value, {
        currency: "",
        unit: "ratio",
        date,
        sourceId: "eastmoney",
        start: date.slice(0, 4) + "-01-01",
        note: "数据源披露的年度指标，计算口径以数据源为准",
      });
  if (row.DPS_HKD != null)
    facts.dps = fact(row.DPS_HKD, {
      currency: "HKD",
      unit: "currency/share",
      date,
      sourceId: "eastmoney",
      start: date.slice(0, 4) + "-01-01",
      note: "每股股息（港元）",
    });
  return {
    facts,
    ...(orgType && orgType !== "一般企业" ? { financial: true } : {}),
    sources: [
      {
        id: "eastmoney",
        title: "东方财富港股财务指标与三张报表（币种由报表摘要核实）",
        url,
      },
    ],
    missing,
  };
}
