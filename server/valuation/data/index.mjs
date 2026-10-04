import { validateSecurity } from "./identity.mjs";
import { collectSec } from "./sec.mjs";
import { collectChina, collectHongKong } from "./eastmoney.mjs";
import { fetchJson } from "./network.mjs";
import { fact } from "./normalize.mjs";
export async function collectSnapshot(
  input,
  { asOf = new Date().toISOString().slice(0, 10), signal } = {},
) {
  const security = validateSecurity(input),
    snapshot = {
      schemaVersion: 1,
      security,
      asOf,
      facts: {},
      sources: [],
      peers: [],
      missing: [],
    };
  const symbol =
    security.market === "cn"
      ? (security.code.startsWith("6") ? "sh" : "sz") + security.code
      : security.market === "hk"
        ? "hk" + security.code
        : "us" + security.code;
  const results = await Promise.allSettled([
    (security.market === "us"
      ? collectSec
      : security.market === "hk"
        ? collectHongKong
        : collectChina)(security, { asOf, signal }),
    fetch("https://qt.gtimg.cn/q=" + symbol, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    }).then(async (r) => {
      if (!r.ok) throw new Error("行情获取失败");
      const text = new TextDecoder("gbk").decode(await r.arrayBuffer()),
        values = text.match(/="([^"\n]+)"/)?.[1].split("~");
      if (
        !values ||
        !Number.isFinite(Number(values[3])) ||
        Number(values[3]) <= 0
      )
        throw new Error("行情无有效报价");
      return { values, url: "https://qt.gtimg.cn/q=" + symbol };
    }),
  ]);
  if (results[0].status === "fulfilled") {
    Object.assign(snapshot, results[0].value);
  } else snapshot.missing.push("财报：" + results[0].reason.message);
  if (results[1].status === "fulfilled") {
    const { values, url } = results[1].value;
    const raw = values[30] || asOf;
    const date =
      raw.replace(/\//g, "-").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ||
      /^(\d{4})(\d{2})(\d{2})/.exec(raw)?.slice(1).join("-") ||
      asOf;
    snapshot.sources.push({ id: "quote", title: "腾讯行情", url });
    snapshot.facts.price = fact(values[3], {
      currency: security.quoteCurrency,
      unit: "currency/share",
      date,
      sourceId: "quote",
      basis: "spot",
    });
  } else snapshot.missing.push("行情：" + results[1].reason.message);
  const currencies = [
    ...new Set(
      Object.values(snapshot.facts)
        .map((f) => f.currency)
        .filter((c) => c && c !== security.quoteCurrency),
    ),
  ];
  for (const currency of currencies)
    try {
      const url = `https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=${security.quoteCurrency}`,
        fx = await fetchJson(url, { signal });
      if (!Number.isFinite(fx.rates?.[security.quoteCurrency]))
        throw new Error("汇率缺失");
      snapshot.sources.push({
        id: "fx-" + currency,
        title: `${currency}/${security.quoteCurrency} 汇率 ${fx.date}`,
        url,
      });
      snapshot.facts["fx_" + currency] = fact(
        fx.rates[security.quoteCurrency],
        {
          currency: "",
          unit: "ratio",
          date: fx.date,
          sourceId: "fx-" + currency,
          basis: "spot",
        },
      );
    } catch {
      snapshot.missing.push(
        `${currency}/${security.quoteCurrency}汇率缺失，不可跨币种计算`,
      );
    }
  for (const key of [
    "price",
    "revenue",
    "netIncome",
    "eps",
    "equity",
    "shares",
    "cash",
    "debt",
    "operatingCashflow",
    "capex",
  ])
    if (snapshot.facts[key]?.value == null) snapshot.missing.push(key);
  snapshot.missing.push("未采集同业财报；无行业中位数");
  return snapshot;
}
