import { fetchJson, eastmoneyUrl } from "./network.mjs";
import { fact } from "./normalize.mjs";
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
  const date = dates.data
    ?.find((d) => String(d.REPORT_DATE).slice(0, 10) <= asOf)
    ?.REPORT_DATE?.slice(0, 10);
  if (!date) throw new Error("未取得年报日期");
  const results = await Promise.allSettled(
    ["lrb", "zcfzb", "xjllb"].map((p) =>
      fetchJson(build(p + "AjaxNew", { dates: date, reportType: "1" }), {
        signal,
      }),
    ),
  );
  const facts = {},
    missing = [];
  const mapping = [
    {
      revenue: "OPERATE_INCOME",
      netIncome: "PARENT_NETPROFIT",
      eps: "DILUTED_EPS",
      ebit: "OPERATE_PROFIT",
    },
    {
      equity: "TOTAL_PARENT_EQUITY",
      shares: "SHARE_CAPITAL",
      cash: "MONETARYFUNDS",
      minority: "MINORITY_EQUITY",
      preferred: "PREFERRED_SHARES",
    },
    { operatingCashflow: "NETCASH_OPERATE", capex: "CONSTRUCT_LONG_ASSET" },
  ];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      missing.push(`报表${i + 1}：${result.reason.message}`);
      return;
    }
    const row = result.value.data?.[0];
    if (!row || (row.NOTICE_DATE && row.NOTICE_DATE.slice(0, 10) > asOf))
      return;
    for (const [key, field] of Object.entries(mapping[i]))
      if (row[field] != null)
        facts[key] = fact(row[field], {
          currency: "CNY",
          unit:
            key === "shares"
              ? "shares"
              : key === "eps"
                ? "currency/share"
                : "currency",
          date,
          sourceId: "eastmoney",
          start: date.slice(0, 4) + "-01-01",
        });
  });
  return {
    facts,
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
  const row = data.result?.data?.find(
    (r) => r.REPORT_DATE.slice(0, 10) <= asOf,
  );
  if (!row) throw new Error("未取得港股年度指标");
  const date = row.REPORT_DATE.slice(0, 10),
    report = currencies.result?.data?.[0]?.REPORT_LIST?.find(
      (r) => r.REPORT_DATE.slice(0, 10) === date,
    );
  const currency =
    { 人民币: "CNY", 港元: "HKD", 港币: "HKD", 美元: "USD", 欧元: "EUR" }[
      report?.CURRENCY
    ] || report?.CURRENCY;
  if (!/^[A-Z]{3}$/.test(currency || ""))
    throw new Error("无法核实港股财报币种");
  const facts = {};
  for (const [key, field] of Object.entries({
    revenue: "OPERATE_INCOME",
    netIncome: "HOLDER_PROFIT",
    eps: "DILUTED_EPS",
    shares: "ISSUED_COMMON_SHARES",
    ebit: "OPERATE_PROFIT",
    operatingCashflow: "NETCASH_OPERATE",
    equity: "HOLDER_EQUITY",
  }))
    if (row[field] != null)
      facts[key] = fact(row[field], {
        currency: key === "shares" ? "" : currency,
        unit:
          key === "shares"
            ? "shares"
            : key === "eps"
              ? "currency/share"
              : "currency",
        date,
        sourceId: "eastmoney",
        start: date.slice(0, 4) + "-01-01",
      });
  return {
    facts,
    sources: [
      {
        id: "eastmoney",
        title: "东方财富港股年度财务指标（币种由报表摘要核实）",
        url,
      },
    ],
    missing: [],
  };
}
