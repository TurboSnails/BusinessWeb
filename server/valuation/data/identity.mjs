import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const seeds = [
  ["cn", "600519", "贵州茅台"],
  ["hk", "00700", "腾讯 Tencent"],
  ["us", "AAPL", "Apple 苹果"],
  ["cn", "600036", "招商银行"],
  ["hk", "03968", "招商银行"],
  ["us", "MSFT", "Microsoft 微软"],
  ["us", "TSLA", "Tesla 特斯拉"],
];
export function validateSecurity(input) {
  const market = input?.market,
    code = String(input?.code || "").toUpperCase();
  if (
    !["cn", "hk", "us"].includes(market) ||
    !(
      market === "cn"
        ? /^\d{6}$/
        : market === "hk"
          ? /^\d{5}$/
          : /^[A-Z][A-Z0-9.-]{0,14}$/
    ).test(code)
  )
    throw new Error("证券市场或代码无效");
  return {
    market,
    code,
    name: String(input.name || code).slice(0, 120),
    quoteCurrency: market === "cn" ? "CNY" : market === "hk" ? "HKD" : "USD",
    exchange:
      market === "cn"
        ? code.startsWith("6")
          ? "SSE"
          : "SZSE"
        : market === "hk"
          ? "HKEX"
          : "US",
    ...(input.issuerId ? { issuerId: String(input.issuerId) } : {}),
  };
}
let catalog;
async function localCatalog() {
  if (catalog) return catalog;
  const items = seeds.map(([market, code, name]) =>
    validateSecurity({ market, code, name }),
  );
  const source = await readFile(
    fileURLToPath(new URL("../../../src/data/companies.ts", import.meta.url)),
    "utf8",
  );
  for (const line of source.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length < 4) continue;
    const code = parts[0];
    try {
      if (/^\d{6}$/.test(code))
        items.push(validateSecurity({ market: "cn", code, name: parts[1] }));
      else if (/^[A-Z][A-Z.-]{0,10}$/.test(code))
        items.push(validateSecurity({ market: "us", code, name: parts[1] }));
    } catch {}
  }
  const hk = await readFile(
    fileURLToPath(new URL("../../../src/data/hsi.ts", import.meta.url)),
    "utf8",
  );
  for (const m of hk.matchAll(/ticker: 'HKEX:(\d+)', name: '([^']+)'/g))
    items.push(
      validateSecurity({
        market: "hk",
        code: m[1].padStart(5, "0"),
        name: m[2],
      }),
    );
  const unique = new Map();
  for (const item of items) {
    const key = `${item.market}:${item.code}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  catalog = [...unique.values()];
  return catalog;
}
export async function searchCompanies(query, { remote = true, signal } = {}) {
  const q = String(query || "").trim();
  if (q.length < 1 || q.length > 100) return [];
  const items = (await localCatalog())
    .filter(
      (i) =>
        i.code.toLowerCase() === q.toLowerCase() ||
        i.name.toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 30);
  if (items.length || !remote) return items;
  try {
    const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    url.searchParams.set("q", q);
    url.searchParams.set("quotesCount", "15");
    const res = await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.quotes || [])
      .filter((i) => i.quoteType === "EQUITY")
      .flatMap((i) => {
        try {
          const symbol = i.symbol;
          const market = symbol.endsWith(".HK")
            ? "hk"
            : /\.(SS|SZ)$/.test(symbol)
              ? "cn"
              : "us";
          return [
            validateSecurity({
              market,
              code:
                market === "hk"
                  ? symbol.split(".")[0].padStart(5, "0")
                  : market === "cn"
                    ? symbol.split(".")[0]
                    : symbol,
              name: i.longname || i.shortname,
            }),
          ];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
