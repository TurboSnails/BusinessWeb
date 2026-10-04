import { assumptionsSchema } from "./schema.mjs";
function check(value, schema, path = "root") {
  if (schema.anyOf) {
    if (
      !schema.anyOf.some((s) => {
        try {
          check(value, s, path);
          return true;
        } catch {
          return false;
        }
      })
    )
      throw new Error(path + ": 结构无效");
    return;
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type],
    type =
      value === null
        ? "null"
        : Array.isArray(value)
          ? "array"
          : typeof value === "number" && Number.isInteger(value)
            ? "integer"
            : typeof value;
  if (
    !types.includes(type) &&
    !(type === "integer" && types.includes("number"))
  )
    throw new Error(path + ": 结构类型无效");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error(path + ": 非有限数值");
  if (
    (schema.enum && !schema.enum.includes(value)) ||
    (schema.const !== undefined && value !== schema.const)
  )
    throw new Error(path + ": 值无效");
  if (type === "object") {
    for (const key of schema.required || [])
      if (!(key in value)) throw new Error(path + "." + key + ": 结构字段缺失");
    for (const key of Object.keys(value))
      if (schema.properties[key])
        check(value[key], schema.properties[key], path + "." + key);
      else if (schema.additionalProperties === false)
        throw new Error(path + ": 未知字段");
  }
  if (type === "array") {
    if (
      (schema.minItems && value.length < schema.minItems) ||
      (schema.maxItems && value.length > schema.maxItems)
    )
      throw new Error(path + ": 数组长度无效");
    value.forEach((v, i) => check(v, schema.items, path + "." + i));
  }
}
export function validateAssumptions(value, snapshot) {
  if (
    value?.security?.code !== snapshot.security.code ||
    value?.security?.market !== snapshot.security.market ||
    value?.security?.quoteCurrency !== snapshot.security.quoteCurrency
  )
    throw new Error("估值证券或币种不匹配");
  check(value, assumptionsSchema);
  if (value.valuationDate !== snapshot.asOf) throw new Error("估值日期不匹配");
  const ids = new Set(snapshot.sources.map((s) => s.id)),
    years = [];
  for (const s of Object.values(value.scenarios)) {
    years.push(s.year);
    if (
      s.year < Number(snapshot.asOf.slice(0, 4)) ||
      s.year > Number(snapshot.asOf.slice(0, 4)) + 15
    )
      throw new Error("预测年份无效");
    if (s.sourceIds.some((id) => !ids.has(id)))
      throw new Error("假设引用未知来源");
    for (const d of [s.dcf, s.multistage])
      if (d) {
        if (d.projections === null) delete d.projections;
        if (d.kind === "fcff") {
          // Historical bridge amounts are facts, never model assumptions.
          for (const key of [
            "cash",
            "debt",
            "preferred",
            "minority",
            "nonOperating",
          ]) {
            const fact = snapshot.facts?.[key];
            const fx =
              fact?.currency &&
              fact.currency !== snapshot.security.quoteCurrency
                ? snapshot.facts?.["fx_" + fact.currency]?.value
                : 1;
            d[key] =
              fact?.status === "available" &&
              Number.isFinite(fact.value) &&
              Number.isFinite(fx)
                ? fact.value * fx
                : null;
          }
        }
      }
  }
  if (new Set(years).size !== 1) throw new Error("三情景预测年份必须一致");
  for (const item of value.analysis)
    if (item.sourceIds.some((id) => !ids.has(id)))
      throw new Error("分析引用未知来源");
  return value;
}
