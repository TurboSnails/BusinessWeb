# sync-skills

把一个目录里的 Skills 同步到全局中心库（默认 `~/.agents/skills`），再用相对软链接分发给各个 agent，避免每个项目、每个 agent 各复制一份。

这是一个命令行工具，不是 Skill：目录里没有 `SKILL.md`，agent 不会加载它，也不会被它自己同步。无 npm 依赖，需要 Node 18+。

## 用法

```bash
# 预览，不写入任何东西
node .agents/skills/sync-skills/scripts/sync-skills.mjs

# 确认无误后执行
node .agents/skills/sync-skills/scripts/sync-skills.mjs --apply
```

| 选项 | 作用 |
|---|---|
| `--from DIR` | 源目录，默认是本工具所在的 skills 目录 |
| `--hub DIR` | 全局中心库，默认 `~/.agents/skills` |
| `--only a,b` / `--exclude a,b` | 只同步或跳过指定 Skill |
| `--agents D1,D2` | 分发目标目录；不写则自动识别已存在的 agent 目录 |
| `--no-link` | 只同步到中心库，不分发 |
| `--force` | 目标已存在且不是指向中心库的内容时，备份后替换 |
| `--apply` | 真正执行；不加只预览 |

## 它做什么

1. **同步到中心库**：源目录里每个带 `SKILL.md` 的子目录，在中心库不存在则复制，内容不同则更新。更新前旧版整体备份到 `<中心库上级>/skill-backups/<时间>/`。中心库里只存在、源目录没有的 Skill 不动。
2. **分发**：对每个 agent 目录建立指向中心库的相对软链接。已经正确的跳过；目标已存在但不是指向中心库的链接或目录，视为冲突，只报告不改动，加 `--force` 才会备份后替换。
3. **默认识别的 agent 目录**：`~/.claude`、`~/.codex`、`~/.cursor`、`~/.kimi`、`~/.config/opencode`、`~/.opencode`、`~/.gemini/antigravity`、`~/.gemini`、`~/.codebuddy` 下的 `skills/`。目录不存在就跳过，指向同一位置的目录只处理一次。

## 注意

- 内容按镜像更新：中心库副本里多出的、源目录没有的文件（例如只在全局放的 `PACKAGE_README.md`）会随更新被替换，旧版在备份里。
- 默认源目录是整个项目的 `.agents/skills/`，包含只属于本项目的 Skill。只想同步通用的，用 `--only` 或 `--exclude` 指定。
- 各 agent 需要开新会话才会识别新增的 Skill。

## 测试

```bash
node --test .agents/skills/sync-skills/scripts/sync-skills.test.mjs
```
