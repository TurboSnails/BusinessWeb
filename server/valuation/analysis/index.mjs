import { runAnalysis } from "../cli/index.mjs";
import { assumptionsSchema } from "./schema.mjs";
import { validateAssumptions } from "./validate.mjs";
export async function analyzeSnapshot(
  snapshot,
  { backend, modelId, signal, onEvent },
) {
  const instruction = `你是公司估值研究助手。仅使用输入财务事实；未来预测是明确假设，不能补造缺失历史事实。同业缺失不提供行业中位数。禁止用现价除以预测财务指标倒推目标乘数再当作公允估值；没有可核实的同业乘数时，目标乘数只能作为明确标注的研究假设，解释选择依据并给出不同情景，无法建立依据则设null。目标倍数属于研究参数，不是历史事实；即使没有同业中位数，仍可基于盈利稳定性、增长假设和要求回报率设置明确标注的示例倍数区间，不能因缺少同业数据就自动判定所有乘数法不适用。示例倍数必须说明推理和局限，不称作市场共识。分析盈利增长、现金流质量、ROE/ROIC、负债、周期、护城河、资本开支、稀释及证伪条件。输出中文。所有情景为同一未来年度，所有预测金额和每股值换算为证券报价币种，使用快照fx字段并在rationale说明。百分比用小数，PEG用增长率百分数计算。只输出满足schema的JSON，不给最终目标价。来源ID只能引用sources。缺少关键事实时方法不可用、指标为null；不能借假设填补未知现金、债务或股权价值桥接，确知为零才用0。DCF用FCFF/WACC或FCFE/股权成本，FCFF不要拿CFO-capex替代。多阶段DCF提供5–15年projections逐年收入、EBIT利润率、税率、折旧、capex、营运资本增加，以及融资与稀释说明；亏损年不自动抵税。FCFF普通股股权桥接需现金、债务、优先股、少数权益、非经营资产。金融公司不强制采用企业DCF。\n财务快照：${JSON.stringify(snapshot)}\nJSON schema：${JSON.stringify(assumptionsSchema)}`;
  let prompt = instruction;
  for (let attempt = 0; attempt < 2; attempt++) {
    const execution = await runAnalysis({
      backend,
      modelId,
      prompt,
      schema: assumptionsSchema,
      signal,
      onEvent,
    });
    try {
      let text = execution.output.trim();
      if (text.startsWith("```"))
        text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      return {
        assumptions: validateAssumptions(JSON.parse(text), snapshot),
        execution,
      };
    } catch (error) {
      if (attempt === 1) throw new Error("模型结构校验失败：" + error.message);
      prompt =
        instruction +
        "\n上次结构错误：" +
        error.message +
        "。修复格式并返回完整JSON。";
      onEvent?.({ type: "activity", message: "正在修复模型输出格式" });
    }
  }
}
