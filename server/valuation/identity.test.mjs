import test from "node:test";
import assert from "node:assert/strict";
import { searchCompanies, validateSecurity } from "./data/identity.mjs";
test("resolves known names and retains Hong Kong leading zeros", async () => {
  assert.equal(
    (await searchCompanies("腾讯", { remote: false }))[0].code,
    "00700",
  );
  assert.equal(
    (await searchCompanies("600519", { remote: false }))[0].name,
    "贵州茅台",
  );
  assert.equal(
    (await searchCompanies("Apple", { remote: false }))[0].code,
    "AAPL",
  );
  assert.deepEqual(await searchCompanies("ZZZZNO", { remote: false }), []);
});
test("rejects mismatched codes and preserves multiple listings", async () => {
  assert.throws(() => validateSecurity({ market: "cn", code: "AAPL" }));
  assert.equal(
    (await searchCompanies("招商银行", { remote: false })).length,
    2,
  );
});
