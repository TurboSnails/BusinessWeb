import type { MultipleInput, MethodResult } from "../types.ts";
export function calculatePeg(pe: number, growth: number): number | null {
  return Number.isFinite(pe) && pe > 0 && Number.isFinite(growth) && growth > 0
    ? pe / (growth * 100)
    : null;
}
export function calculateMultiple(input: MultipleInput): MethodResult {
  const fail = (
    status: MethodResult["status"],
    reason: string,
  ): MethodResult => ({ status, price: null, reason });
  if (input.metric == null || input.multiple == null)
    return fail("missingData", "缺少财务指标或目标倍数");
  if (
    !Number.isFinite(input.metric) ||
    !Number.isFinite(input.multiple) ||
    input.multiple <= 0
  )
    return fail("invalidInput", "指标必须有限，目标倍数必须大于零");
  if (input.metric <= 0)
    return fail("notApplicable", "财务分母非正，此方法不适用");
  let price = input.metric * input.multiple;
  if (input.method === "peg") {
    if (input.growth == null) return fail("missingData", "缺少盈利增长率");
    if (!Number.isFinite(input.growth))
      return fail("invalidInput", "增长率必须有限");
    if (input.growth <= 0) return fail("notApplicable", "非正增长不适用PEG");
    price *= input.growth * 100;
  }
  if (input.method === "ps") {
    if (input.shares == null) return fail("missingData", "缺少预测股本");
    if (!Number.isFinite(input.shares) || input.shares <= 0)
      return fail("invalidInput", "股本必须大于零");
    price /= input.shares;
  }
  if (!Number.isFinite(price)) return fail("invalidInput", "计算溢出");
  const years = input.years ?? 0,
    rate = input.requiredReturn;
  if (
    !Number.isFinite(years) ||
    years < 0 ||
    (rate !== undefined && (!Number.isFinite(rate) || rate <= -1))
  )
    return fail("invalidInput", "折现期限或要求回报率无效");
  return {
    status: "calculated",
    price,
    presentPrice: rate === undefined ? null : price / (1 + rate) ** years,
    reason: years > 0 ? `${years}年后预测价格` : "估值基准日价格",
  };
}
