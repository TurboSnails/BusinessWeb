// 宏观温度「AI 解读」：把规则算好的读数交给本地 CLI，只做解释，不改变阶段判断。
import { runAnalysis } from "../cli/index.mjs";

const text = (max) => ({ type: "string", minLength: 1, maxLength: max });

export const interpretationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "changes", "analogs", "watch", "caveats"],
  properties: {
    summary: text(400),
    changes: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["indicator", "direction", "evidence"],
        properties: {
          indicator: text(60),
          direction: { type: "string", enum: ["变好", "变坏", "持平"] },
          evidence: text(240),
        },
      },
    },
    analogs: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["period", "similar", "different"],
        properties: { period: text(40), similar: text(200), different: text(200) },
      },
    },
    watch: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "trigger"],
        properties: { item: text(60), trigger: text(160) },
      },
    },
    caveats: text(300),
  },
};

/** 只检查结构；数字是否引用正确由人对照读数判断 */
export function validateInterpretation(value) {
  const fail = (m) => {
    throw new Error(m);
  };
  if (!value || typeof value !== "object") fail("不是对象");
  if (typeof value.summary !== "string" || !value.summary.trim()) fail("缺少 summary");
  for (const key of ["changes", "analogs", "watch"])
    if (!Array.isArray(value[key])) fail(`${key} 不是数组`);
  if (!value.changes.length) fail("changes 为空");
  if (!value.watch.length) fail("watch 为空");
  for (const c of value.changes)
    if (!["变好", "变坏", "持平"].includes(c?.direction)) fail("direction 无效");
  return {
    summary: value.summary.trim(),
    changes: value.changes.slice(0, 6),
    analogs: value.analogs.slice(0, 3),
    watch: value.watch.slice(0, 5),
    caveats: String(value.caveats || "").trim(),
  };
}

export function buildPrompt(digest) {
  return `你是一名资产配置研究员，读者是不盯盘、不预测、按规则做配置的普通投资者。输出中文。

下面是宏观温度页面已经用固定规则算好的结果（阶段、每项指标的读数、阈值、红黄绿状态、近一年走势）。你的任务只是解释，不是重新判断：
1. 阶段与红黄绿状态以输入为准，不得改写，也不要说“我认为应进入某阶段”。
2. summary：用三四句话说清现在的宏观状态，点出导致当前阶段的那几项信号，必须引用具体数字和日期。
3. changes：挑出近一年变化最值得注意的指标（最多 6 项），说明方向和证据（起点、终点、时间）。只引用输入里的数字，不补造。
4. analogs：最多 3 个历史时期作对照，说明相似点与关键不同点；没有把握就少写或不写，不要硬凑。
5. watch：下个月最该盯的 1–5 项，每项写明“到什么读数会改变判断”（对照输入里的阈值）。
6. caveats：说明这份解读的局限（数据滞后、单项噪音、样本少等）。
纪律：不预测指数点位或涨跌，不给买卖、加减仓或择时建议，不用“必然”“一定”等确定性措辞；数据缺失就说缺失。

输入（JSON）：${JSON.stringify(digest)}
只输出满足下列 JSON schema 的 JSON：${JSON.stringify(interpretationSchema)}`;
}

export async function interpretMacro(input, { signal, emit }) {
  emit("analyzing", { message: "本地模型正在解读宏观读数" });
  const instruction = buildPrompt(input.digest);
  let prompt = instruction;
  for (let attempt = 0; attempt < 3; attempt++) {
    const execution = await runAnalysis({
      backend: input.backend,
      modelId: input.modelId,
      prompt,
      schema: interpretationSchema,
      signal,
      onEvent: (e) => emit("activity", e),
    });
    try {
      let out = execution.output.trim();
      if (out.startsWith("```")) out = out.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      emit("calculating", { message: "正在校验解读格式" });
      return {
        interpretation: validateInterpretation(JSON.parse(out)),
        asOf: input.digest?.asOf ?? null,
        stage: input.digest?.stage?.name ?? null,
        execution: {
          backend: input.backend,
          requestedModelId: execution.requestedModelId,
          resolvedModelId: execution.resolvedModelId,
          cliVersion: execution.cliVersion,
        },
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      if (attempt === 2) throw new Error("模型输出格式校验失败：" + error.message);
      prompt = instruction + "\n上次格式错误：" + error.message + "。修复后返回完整 JSON。";
      emit("activity", { type: "activity", message: "正在修复模型输出格式" });
    }
  }
}
