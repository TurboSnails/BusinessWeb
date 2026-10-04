import test from "node:test";
import assert from "node:assert/strict";
import { addDerived } from "./data/derive.mjs";
import { fact } from "./data/normalize.mjs";
import { cnEntries, hkEntries } from "./data/eastmoney.mjs";
const f = (value, currency = "CNY") =>
  fact(value, { currency, date: "2025-12-31", sourceId: "x" });
const snap = (facts, extra = {}) => ({
  security: { market: "hk", code: "00700", quoteCurrency: "HKD" },
  asOf: "2026-10-04",
  facts,
  sources: [{ id: "x", title: "x", url: "u" }],
  missing: [],
  ...extra,
});
test("derives growth, margins and FCF from collected facts only", () => {
  const s = addDerived(
    snap({
      revenue: f(200),
      revenuePrior: f(100),
      netIncome: f(40),
      operatingCashflow: f(60),
      capex: f(20),
    }),
  );
  assert.equal(s.facts.revenueGrowth.value, 1);
  assert.equal(s.facts.netMargin.value, 0.2);
  assert.equal(s.facts.fcf.value, 40);
  assert.equal(s.facts.cashConversion.value, 1.5);
  assert.equal(s.facts.grossMargin, undefined);
  assert.ok(s.sources.some((x) => x.id === "derived"));
});
test("does not derive growth from a non-positive prior period", () => {
  const s = addDerived(
    snap({ netIncome: f(10), netIncomePrior: f(-5), revenue: f(1) }),
  );
  assert.equal(s.facts.netIncomeGrowth, undefined);
});
test("converts report currency to quote currency for multiples", () => {
  const s = addDerived(
    snap({
      price: fact(300, {
        currency: "HKD",
        date: "2026-10-02",
        sourceId: "x",
        basis: "spot",
      }),
      eps: f(20),
      fx_CNY: fact(1.5, {
        currency: "",
        unit: "ratio",
        date: "2026-10-02",
        sourceId: "x",
        basis: "spot",
      }),
    }),
  );
  assert.equal(s.facts.peTrailing.value, 10);
});
test("skips cash-flow based ratios for financial institutions", () => {
  const s = addDerived(
    snap(
      {
        netIncome: f(10),
        operatingCashflow: f(30),
        capex: f(1),
        revenue: f(50),
      },
      { financial: true },
    ),
  );
  assert.equal(s.facts.cashConversion, undefined);
  assert.equal(s.facts.fcf, undefined);
  assert.ok(s.facts.netMargin);
});
test("A-share debt requires an explicit borrowing line, never zero by omission", () => {
  const onlyLease = cnEntries(
    {},
    { LEASE_LIAB: 5, MONETARYFUNDS: 9 },
    {},
    true,
  );
  assert.equal(onlyLease.debt, undefined);
  assert.equal(onlyLease.cash.value, 9);
  const withLoan = cnEntries({}, { SHORT_LOAN: 10, LEASE_LIAB: 5 }, {}, true);
  assert.equal(withLoan.debt.value, 15);
  assert.match(withLoan.debt.note, /短期借款.*租赁负债/);
  assert.equal(cnEntries({}, { SHORT_LOAN: 10 }, {}, false).debt, undefined);
});
test("HK entries use standardized statement lines and report capex scope", () => {
  const bal = new Map([
    ["004011010", 10],
    ["004020001", 20],
    ["004002010", 7],
  ]);
  const cf = new Map([["005005", 8]]);
  const e = hkEntries(bal, new Map(), cf, {});
  assert.equal(e.debt.value, 30);
  assert.equal(e.cash.value, 7);
  assert.match(e.capex.note, /仅购建固定资产/);
  const none = hkEntries(new Map([["004002010", 1]]), new Map(), new Map(), {});
  assert.equal(none.debt, undefined);
});
test("preferred is zero only when equity components reconcile", () => {
  const ok = cnEntries(
    {},
    {
      TOTAL_PARENT_EQUITY: 100,
      SHARE_CAPITAL: 10,
      CAPITAL_RESERVE: 20,
      SURPLUS_RESERVE: 20,
      UNASSIGN_RPOFIT: 50,
    },
    {},
    true,
  );
  assert.equal(ok.preferred.value, 0);
  const gap = cnEntries(
    {},
    { TOTAL_PARENT_EQUITY: 100, SHARE_CAPITAL: 10, UNASSIGN_RPOFIT: 50 },
    {},
    true,
  );
  assert.equal(gap.preferred, undefined);
  const tool = cnEntries(
    {},
    { TOTAL_PARENT_EQUITY: 100, SHARE_CAPITAL: 100, OTHER_EQUITY_TOOL: 5 },
    {},
    true,
  );
  assert.equal(tool.preferred, undefined);
});
test("HK non-operating assets and preferred come from standardized lines", () => {
  const bal = new Map([
    ["004001013", 30],
    ["004002011", 20],
    ["004030001", 1],
    ["004030004", 98],
    ["004030999", 99],
  ]);
  const e = hkEntries(bal, new Map(), new Map(), {});
  assert.equal(e.nonOperating.value, 50);
  assert.equal(e.preferred.value, 0);
  assert.equal(
    hkEntries(new Map(), new Map(), new Map(), {}).nonOperating,
    undefined,
  );
});
