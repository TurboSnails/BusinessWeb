import type {
  DcfRecord,
  DcfSheetInput,
  DcfSheetResult,
  DcfStatus,
  Market,
  MultipleBand,
  WaccResult,
} from "./types.ts";

const KEY = "businessweb.dcf.v1";
const MAX_RECORDS = 20;

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
const nullable = (n: unknown) => n === null || finite(n);
const isStatus = (v: unknown): v is DcfStatus =>
  ["calculated", "notApplicable", "missingData", "invalidInput"].includes(
    v as string,
  );
type Rec = Record<string, unknown>;
/** 与 list.includes(x) 相同，只是接受 unknown */
const oneOf = (list: readonly string[], x: unknown) => list.includes(x as string);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * 公司唯一键：市场 + 代码 + 名称。
 * 代码和名称都没填时落到「未命名」，避免多条空记录互相覆盖。
 */
export function makeDcfKey(
  input: Pick<DcfSheetInput, "market" | "code" | "company">,
): string {
  const code = normalizeCode(input.code ?? "");
  const name = normalizeName(input.company ?? "");
  if (!code && !name) return "未命名";
  return ["dcf", input.market ?? "other", code, name].join("|");
}

function validInput(value: unknown): boolean {
  const v = value as Rec;
  return (
    !!v &&
    typeof v.company === "string" &&
    typeof v.code === "string" &&
    oneOf(["cn", "hk", "us", "other"], v.market) &&
    oneOf(["CNY", "HKD", "USD"], v.currency) &&
    oneOf(["yuan", "wan", "yi"], v.moneyUnit) &&
    oneOf(["share", "wan", "yi"], v.shareUnit) &&
    Number.isFinite(v.baseYear) &&
    [
      "baseFcf",
      "growth",
      "perpetualGrowth",
      "discountRate",
      "cash",
      "debt",
      "shares",
      "currentPrice",
      "ebitda",
      "marketCap",
      "beta",
      "interestExpense",
      "pretaxIncome",
      "taxPaid",
      "riskFreeRate",
      "marketReturn",
    ].every((k) => nullable(v[k])) &&
    ["fadeYears", "minority"].every((k) => v[k] === undefined || nullable(v[k]))
  );
}
function validResult(value: unknown): boolean {
  const v = value as Rec;
  return (
    !!v &&
    isStatus(v.status) &&
    nullable(v.price) &&
    typeof v.reason === "string" &&
    Array.isArray(v.cashflows) &&
    v.cashflows.every(finite) &&
    nullable(v.mos) &&
    (v.verdict === null || v.verdict === "BUY" || v.verdict === "SELL") &&
    strings(v.warnings) &&
    ["enterpriseValue", "terminalValue", "terminalShare", "equityValue"].every(
      (k) => v[k] === undefined || finite(v[k]),
    )
  );
}
function validWacc(value: unknown): boolean {
  const v = value as Rec;
  return (
    !!v &&
    isStatus(v.status) &&
    nullable(v.wacc) &&
    typeof v.reason === "string" &&
    strings(v.notes) &&
    [
      "debtWeight",
      "equityWeight",
      "costOfDebt",
      "costOfEquity",
      "taxRate",
    ].every((k) => nullable(v[k]))
  );
}
const validBands = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.every(
    (item: unknown) => {
      const b = item as Rec;
      return !!b && typeof b.label === "string" && finite(b.multiple) &&
        nullable(b.price) && isStatus(b.status) && typeof b.reason === "string";
    },
  );

export function isDcfRecord(value: unknown): value is DcfRecord {
  try {
    const v = value as DcfRecord;
    return (
      !!v &&
      v.schemaVersion === 1 &&
      typeof v.key === "string" &&
      typeof v.company === "string" &&
      typeof v.code === "string" &&
      typeof v.market === "string" &&
      typeof v.savedAt === "string" &&
      Number.isFinite(Date.parse(v.savedAt)) &&
      validInput(v.input) &&
      validResult(v.result) &&
      validWacc(v.wacc) &&
      validBands(v.multiples)
    );
  } catch {
    return false;
  }
}

export function loadDcfRecords(): DcfRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value.filter(isDcfRecord) : [];
  } catch {
    return [];
  }
}

function persist(records: DcfRecord[]): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "分析未保存：浏览器存储不可用或已满，可先截图记录当前结果",
    };
  }
}

/**
 * 保存一次分析。同一家公司（市场+代码+名称）只保留最新一条并置顶，
 * 再次分析即覆盖上一次的记录。
 */
export function saveDcfRecord(
  record: DcfRecord,
): { ok: boolean; error?: string } {
  if (!isDcfRecord(record))
    return { ok: false, error: "分析未保存：记录结构无效" };
  const next = [
    record,
    ...loadDcfRecords().filter((r) => r.key !== record.key),
  ].slice(0, MAX_RECORDS);
  return persist(next);
}

export function deleteDcfRecord(key: string): { ok: boolean; error?: string } {
  return persist(loadDcfRecords().filter((r) => r.key !== key));
}

export function findDcfRecord(key: string): DcfRecord | null {
  return loadDcfRecords().find((r) => r.key === key) ?? null;
}

export interface DcfDraft {
  input: DcfSheetInput;
  result: DcfSheetResult;
  wacc: WaccResult;
  multiples: MultipleBand[];
}

export function makeDcfRecord(
  input: DcfSheetInput,
  draft: Omit<DcfDraft, "input">,
  savedAt = new Date().toISOString(),
): DcfRecord {
  return {
    schemaVersion: 1,
    key: makeDcfKey(input),
    company: input.company.trim() || input.code.trim() || "未命名",
    code: input.code.trim(),
    market: input.market as Market,
    savedAt,
    input,
    result: draft.result,
    wacc: draft.wacc,
    multiples: draft.multiples,
    debtBasis: "interestBearing",
  };
}
