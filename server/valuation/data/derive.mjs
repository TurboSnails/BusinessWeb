import { fact } from "./normalize.mjs";
const num = (snapshot, key) => {
  const f = snapshot.facts[key];
  return f?.status === "available" && Number.isFinite(f.value) ? f.value : null;
};
const div = (a, b) =>
  Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null;
// 派生指标一律由已采集事实按公式在本地计算，避免让模型心算；任一输入缺失则不产出。
export function addDerived(snapshot) {
  const n = (k) => num(snapshot, k);
  const ccy = (k) => snapshot.facts[k]?.currency || "";
  const fxTo = (from) =>
    !from || from === snapshot.security.quoteCurrency
      ? 1
      : (n("fx_" + from) ?? null);
  const ends = Object.values(snapshot.facts)
    .filter((f) => f.basis === "annual" && f.periodEnd)
    .map((f) => f.periodEnd)
    .sort();
  const date = ends.at(-1) || snapshot.asOf;
  const out = {};
  const put = (key, value, opts) => {
    if (Number.isFinite(value))
      out[key] = fact(value, {
        date,
        sourceId: "derived",
        ...opts,
      });
  };
  const ratio = (key, value, note) =>
    put(key, value, { currency: "", unit: "ratio", note });
  const amount = (key, value, currency, note) =>
    put(key, value, { currency, unit: "currency", note });
  const gross =
    n("grossProfit") ??
    (n("revenue") != null && n("costOfRevenue") != null
      ? n("revenue") - n("costOfRevenue")
      : null);
  ratio("grossMargin", div(gross, n("revenue")), "毛利/营业收入");
  ratio("operatingMargin", div(n("ebit"), n("revenue")), "经营利润/营业收入");
  ratio("netMargin", div(n("netIncome"), n("revenue")), "归母净利润/营业收入");
  for (const [key, base] of [
    ["revenueGrowth", "revenue"],
    ["netIncomeGrowth", "netIncome"],
    ["epsGrowth", "eps"],
    ["ebitGrowth", "ebit"],
    ["operatingCashflowGrowth", "operatingCashflow"],
  ]) {
    const prev = n(base + "Prior");
    ratio(
      key,
      prev > 0 && n(base) != null ? n(base) / prev - 1 : null,
      "较上一财年；上期为非正数时不计算",
    );
  }
  const cur = ccy("revenue") || ccy("netIncome");
  const fcf =
    !snapshot.financial && n("operatingCashflow") != null && n("capex") != null
      ? n("operatingCashflow") - n("capex")
      : null;
  amount(
    "fcf",
    fcf,
    ccy("operatingCashflow") || cur,
    "经营现金流-资本开支（购建长期资产）",
  );
  ratio("fcfMargin", div(fcf, n("revenue")), "自由现金流/营业收入");
  ratio(
    "cashConversion",
    !snapshot.financial && n("netIncome") > 0
      ? div(n("operatingCashflow"), n("netIncome"))
      : null,
    "经营现金流/归母净利润",
  );
  ratio(
    "fcfConversion",
    n("netIncome") > 0 ? div(fcf, n("netIncome")) : null,
    "自由现金流/归母净利润",
  );
  ratio(
    "debtToAsset",
    div(n("totalLiabilities"), n("totalAssets")),
    "总负债/总资产",
  );
  ratio(
    "effectiveTaxRate",
    n("pretaxProfit") > 0 ? div(n("incomeTax"), n("pretaxProfit")) : null,
    "所得税/税前利润",
  );
  ratio(
    "interestCoverage",
    n("interestExpense") > 0 ? div(n("ebit"), n("interestExpense")) : null,
    "经营利润/利息支出",
  );
  ratio(
    "roeEndEquity",
    div(n("netIncome"), n("equity")),
    "归母净利润/期末归母权益",
  );
  const avgEquity =
    n("equity") != null && n("equityPrior") != null
      ? (n("equity") + n("equityPrior")) / 2
      : null;
  ratio(
    "roeAverage",
    div(n("netIncome"), avgEquity),
    "归母净利润/期初期末平均归母权益",
  );
  ratio(
    "payoutRatio",
    n("netIncome") > 0 ? div(n("dividendsPaid"), n("netIncome")) : null,
    "现金分红/归母净利润（分红口径见 dividendsPaid 备注）",
  );
  if (n("debt") != null && n("cash") != null)
    amount(
      "netDebt",
      n("debt") - n("cash"),
      ccy("debt"),
      "有息债务-现金及等价物；未扣除短期存款等其他类现金资产，可能高估净债务",
    );
  // 估值倍数：现价（报价币种）与报表币种经汇率换算后再比较
  const price = n("price");
  const fx = fxTo(ccy("eps") || cur);
  if (price > 0 && fx) {
    ratio(
      "peTrailing",
      n("eps") > 0 ? price / (n("eps") * fx) : null,
      "现价/最近财年摊薄EPS（GAAP/报表口径，非TTM）",
    );
    const shares = n("shares");
    ratio(
      "pbTrailing",
      n("equity") > 0 && shares > 0
        ? (price * shares) / (n("equity") * fx)
        : null,
      "总市值/期末归母权益；股本取最近财年末，未反映其后回购或增发",
    );
    ratio(
      "psTrailing",
      n("revenue") > 0 && shares > 0
        ? (price * shares) / (n("revenue") * fx)
        : null,
      "总市值/营业收入；股本取最近财年末",
    );
    ratio(
      "fcfYield",
      fcf != null && shares > 0 ? (fcf * fx) / (price * shares) : null,
      "自由现金流/总市值；股本取最近财年末",
    );
    for (const k of ["peTrailing", "pbTrailing", "psTrailing", "fcfYield"])
      if (out[k]) out[k].basis = "spot";
  }
  if (!Object.keys(out).length) return snapshot;
  Object.assign(snapshot.facts, out);
  snapshot.sources.push({
    id: "derived",
    title: "由已采集事实在本地按公式计算的派生指标（口径见各指标备注）",
    url: "",
  });
  return snapshot;
}
