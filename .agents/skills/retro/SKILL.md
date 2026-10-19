---
name: retro
description: "对一次 coding session 做复盘，提出改进 coding agent 环境（导航、自动检查、编码规范、steering 文件、工具开销、信息获取）的建议。"
disable-model-invocation: true
---

用户要求做一次 **retrospective**。你的任务是提出对 coding agent **environment** 的改进，让以后的运行更好。

## Steps

1. 获取写作风格指南：有 `writing-for-agents` skill 就用它，否则用 `/writing-great-skills`。

2. 阅读用户指定 session 的一手资料。这可能需要在本机搜索 session logs。用户没指定就默认当前 session。

3. 在以下类别中寻找改进候选：

- **Navigation**：agent 找到正确文件有多容易？文件之间有隐藏依赖吗？加一个 **navigation pointer** 会更容易吗？_适用于_ session 花了很长时间才找到某条信息。
- **Automated checks**：有没有自动检查能抓住 agent 犯的错？lint、类型、测试、filesystem linter？先读 repo 自己的检查命令（`package.json` / 构建工具的 `lint`/`check` scripts、CI workflow），这样“已存在但没接上或静默失效的检查”才是发现，而不是重新造轮子。一个没有 **guardrail**（没有 pre-commit hook、也没有跑 lint/typecheck/test 的 CI job）的 repo 本身就是一条发现：没 lint 的 repo 是持续错失的机会，不是中性默认。_适用于_ agent 犯了自动检查本可抓住的错，或 repo 完全没有 guardrail。
- **Coding standards**：是否该给 **reviewer agent** 一条新规则来执行？是否该删除或澄清某条现有规则？先给违规分类：**mechanical** 违规（固定语法模式、禁用 API、import 形状、文件位置规则）一律做成确定性检查：repo 自己 linter 的自定义规则、新 pre-commit hook 或新 CI job，按 repo 语言和现有 guardrail 选最便宜的。默认做检查，而不是写规则。`CODING_STANDARDS.md` 只留给真正的 **judgement calls**（跨文件一致性、“符合周围风格”、任何 guardrail 都替代不了的东西）。_适用于_ reviewer agent 没抓住某个错误。
- **Global AGENTS.md**：有没有 steering 指令应该移到 coding standards（或自动检查）里？_适用于_ AGENTS.md / CLAUDE.md 特别大，无论在 repo 还是用户全局范围。
- **Tool economy**：agent 是否做了可精简的昂贵 tool calls？有没有特别耗 token 的自定义工具（CLI、MCP）？_适用于_ agent 做了昂贵的 tool call。
- **No-ops**：找出 steering 文件里不改变 agent 行为的指令。_适用于_ steering 文件庞大难管。
- **Information access**：寻找增加 agent 信息获取的机会，例如 tee dev server logs、第三方服务只读访问。_适用于_ 某条关键信息 agent 拿不到。

4. 按严重程度排序，把候选项展示给用户。

## Reference

### Implementation vs Review

所有工作都经过两个阶段：implementation 和 review。Implementation agent 的 **context pressure** 最大：要负责探索、写代码、调试失败。

Review agent 的 context pressure 最小：它拿到的是 diff，不需要探索，通常也不需要写代码或调试。

因此应由 review agent 负责执行 coding standards，而不是 implementation agent。

### Files

你可以使用 repo 中的这些文件：

- `CLAUDE.md`/`AGENTS.md`：会被推入在此 repo 工作的每个 agent 的 context window。应极其节制地使用，通常只放指向其他文件的 **navigation pointers**。
- `CODING_STANDARDS.md`：在 review 时读取，而不是 implementation 时。超过 1,000 行时，加 **navigation pointers** 指向 docs 目录。
- Docs：作为参考文件，由其他文件指向。写新文档前先找已有文档。
- Skills：用 skills 承载文档（因为其 description 会进入 agent context window），或作为用户调用的命令。遵循写作风格指南的建议。
