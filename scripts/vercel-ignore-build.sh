#!/bin/bash
# Vercel「Ignored Build Step」：退出码 0 = 跳过本次构建，1 = 照常构建。
# 目的：数据工作流一天提交几十次，每次都触发 Vercel 生产构建会用完每日部署额度（2026-11-25 发生过）。
# 规则：自上次成功部署以来只改了 public/data/ 或 data-raw/，且距上次部署的提交不到 60 分钟 → 跳过；
#       其余情况（改了代码、配置、文档，或距上次部署 ≥ 60 分钟，或任何判断失败）→ 构建。
# 所以 Vercel 上的数据最多比最新提交晚约一个提交间隔；代码改动从不跳过。
set -u
WINDOW_SECONDS="${VERCEL_SKIP_WINDOW_SECONDS:-3600}"
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
cur="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [ -z "$prev" ]; then echo "没有上次部署的提交，构建"; exit 1; fi
if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=100 origin "$prev" 2>/dev/null || { echo "取不到上次部署的提交，构建"; exit 1; }
fi
changed="$(git diff --name-only "$prev" "$cur" 2>/dev/null)" || { echo "比较失败，构建"; exit 1; }
if [ -z "$changed" ]; then echo "没有文件变化，构建"; exit 1; fi
non_data="$(printf '%s\n' "$changed" | grep -vE '^(public/data/|data-raw/)' | grep -v '^$' || true)"
if [ -n "$non_data" ]; then echo "有非数据文件变化，构建"; exit 1; fi
now="$(git show -s --format=%ct "$cur" 2>/dev/null)" || exit 1
then_="$(git show -s --format=%ct "$prev" 2>/dev/null)" || exit 1
if [ $((now - then_)) -ge "$WINDOW_SECONDS" ]; then echo "只改数据，但距上次部署已满 $((WINDOW_SECONDS / 60)) 分钟，构建"; exit 1; fi
echo "只改数据，且距上次部署不到 $((WINDOW_SECONDS / 60)) 分钟，跳过本次构建"
exit 0
