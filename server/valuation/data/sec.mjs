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
    netIncome: ["NetIncomeLoss"],
    eps: ["EarningsPerShareDiluted"],
    shares: ["CommonStockSharesOutstanding"],
    equity: ["StockholdersEquity"],
    cash: ["CashAndCashEquivalentsAtCarryingValue"],
    operatingCashflow: ["NetCashProvidedByUsedInOperatingActivities"],
    capex: ["PaymentsToAcquirePropertyPlantAndEquipment"],
    ebit: ["OperatingIncomeLoss"],
    da: ["DepreciationDepletionAndAmortization"],
    debt: ["LongTermDebtCurrent", "LongTermDebtNoncurrent"],
    minority: ["MinorityInterest"],
    preferred: ["PreferredStockValue"],
  };
  const facts = {};
  for (const [key, tags] of Object.entries(mappings)) {
    if (key === "debt") continue;
    for (const tag of tags) {
      const item = annualFact(gaap[tag], asOf, {
        instant: ["shares", "equity", "cash", "minority", "preferred"].includes(
          key,
        ),
      });
      if (item) {
        facts[key] = item;
        break;
      }
    }
  }
  const dc = annualFact(gaap.LongTermDebtCurrent, asOf, { instant: true }),
    dn = annualFact(gaap.LongTermDebtNoncurrent, asOf, { instant: true });
  if (dc && dn && dc.periodEnd === dn.periodEnd)
    facts.debt = { ...dn, value: dc.value + dn.value };
  return {
    facts,
    sources: [{ id: "sec", title: `SEC ${raw.entityName} companyfacts`, url }],
    missing: [],
  };
}
