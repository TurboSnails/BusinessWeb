import { fetchJson } from "./network.mjs";
import { annualFact } from "./normalize.mjs";
const known = {
  AAPL: "320193",
  MSFT: "789019",
  TSLA: "1318605",
  NVDA: "1045810",
  KO: "21344",
  JPM: "19617",
  AMZN: "1018724",
  META: "1326801",
  GOOGL: "1652044",
};
export async function collectSec(security, { asOf, signal }) {
  const headers = {
    "User-Agent":
      process.env.SEC_USER_AGENT ||
      "BusinessWeb personal research contact hassan (local use)",
  };
  let cik = known[security.code];
  if (!cik) {
    const tickers = await fetchJson(
      "https://www.sec.gov/files/company_tickers.json",
      { signal, headers },
    );
    cik = Object.values(tickers).find(
      (t) => t.ticker === security.code,
    )?.cik_str;
  }
  if (!cik)
    throw new Error("未找到SEC发行人CIK；ADR/非美注册公司需补充发行人财报");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`,
    raw = await fetchJson(url, { signal, headers }),
    gaap = raw.facts?.["us-gaap"] || {};
  const mappings = {
    revenue: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
    ],
    grossProfit: ["GrossProfit"],
    costOfRevenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold"],
    netIncome: ["NetIncomeLoss"],
    eps: ["EarningsPerShareDiluted"],
    shares: ["CommonStockSharesOutstanding"],
    equity: ["StockholdersEquity"],
    cash: ["CashAndCashEquivalentsAtCarryingValue"],
    operatingCashflow: ["NetCashProvidedByUsedInOperatingActivities"],
    investingCashflow: ["NetCashProvidedByUsedInInvestingActivities"],
    financingCashflow: ["NetCashProvidedByUsedInFinancingActivities"],
    capex: ["PaymentsToAcquirePropertyPlantAndEquipment"],
    ebit: ["OperatingIncomeLoss"],
    pretaxProfit: [
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    ],
    incomeTax: ["IncomeTaxExpenseBenefit"],
    interestExpense: ["InterestExpense", "InterestExpenseNonoperating"],
    da: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization"],
    dividendsPaid: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
    buybacks: ["PaymentsForRepurchaseOfCommonStock"],
    totalAssets: ["Assets"],
    totalLiabilities: ["Liabilities"],
    currentAssets: ["AssetsCurrent"],
    currentLiabilities: ["LiabilitiesCurrent"],
    inventory: ["InventoryNet"],
    receivables: ["AccountsReceivableNetCurrent"],
    goodwill: ["Goodwill"],
    minority: ["MinorityInterest"],
    preferred: ["PreferredStockValue"],
  };
  const INSTANT = [
    "shares",
    "equity",
    "cash",
    "minority",
    "preferred",
    "totalAssets",
    "totalLiabilities",
    "currentAssets",
    "currentLiabilities",
    "inventory",
    "receivables",
    "goodwill",
  ];
  const facts = {};
  const pick = (tags, instant, offset) => {
    for (const tag of tags) {
      const item = annualFact(gaap[tag], asOf, { instant, offset });
      if (item) return item;
    }
    return null;
  };
  for (const [key, tags] of Object.entries(mappings)) {
    const instant = INSTANT.includes(key);
    const item = pick(tags, instant, 0);
    if (item) facts[key] = item;
  }
  // 上一财年（用于增速与平均权益）；必须与当期财年相邻，否则不采用
  for (const key of [
    "revenue",
    "netIncome",
    "eps",
    "ebit",
    "operatingCashflow",
    "equity",
    "totalAssets",
  ]) {
    const prev = pick(mappings[key], INSTANT.includes(key), 1);
    const cur = facts[key];
    if (
      prev &&
      cur &&
      (Date.parse(cur.periodEnd) - Date.parse(prev.periodEnd)) / 86400000 >=
        350 &&
      (Date.parse(cur.periodEnd) - Date.parse(prev.periodEnd)) / 86400000 <= 380
    )
      facts[key + "Prior"] = prev;
  }
  if (facts.capex)
    facts.capex.note = "购建物业、厂房及设备支付的现金，未含无形资产投入";
  // XBRL 标签由公司自选，无法验证债务组件是否齐全；组成项单独列出，
  // 不合成“总有息债务”，避免漏项后高估股权价值。
  const components = {
    debtLongTermNoncurrent: ["LongTermDebtNoncurrent", "长期债务(非流动)"],
    debtLongTermCurrent: ["LongTermDebtCurrent", "一年内到期的长期债务"],
    commercialPaper: ["CommercialPaper", "商业票据"],
    shortTermBorrowings: ["ShortTermBorrowings", "短期借款"],
  };
  let anyDebt = false;
  for (const [key, [tag, name]] of Object.entries(components)) {
    const item = annualFact(gaap[tag], asOf, { instant: true });
    if (item) {
      facts[key] = { ...item, note: name + "（债务组成项之一，未汇总）" };
      anyDebt = true;
    }
  }
  const debtMissing = anyDebt
    ? ["debt：SEC债务组件尚未完整核对，需补充含短期借款的总有息债务"]
    : [];
  return {
    facts,
    sources: [{ id: "sec", title: `SEC ${raw.entityName} companyfacts`, url }],
    missing: debtMissing,
  };
}
