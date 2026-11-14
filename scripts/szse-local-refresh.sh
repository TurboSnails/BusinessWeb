#!/bin/bash
# 深交所数据本机定时刷新（macOS launchd 调用；安装/卸载见 docs/data-maintenance.md「深交所数据本机刷新」）。
# 在独立的仓库副本里运行（默认 ~/.businessweb-szse/repo），不碰日常开发目录；
# 每次先对齐 origin/main，只提交牛熊周期的两个数据文件，推送失败时 rebase 重试。
set -euo pipefail
REPO="${SZSE_REPO:-$HOME/.businessweb-szse/repo}"
NODE="${SZSE_NODE:-$(command -v node)}"
export PATH="$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

echo "== $(date '+%F %T %Z') 开始"
# 周末不跑（launchd 补跑可能在周末触发）；北京时间判断
DOW=$(TZ=Asia/Shanghai date +%u)
if [ "$DOW" -gt 5 ] && [ -z "${SZSE_FORCE:-}" ]; then echo "北京时间周末，跳过"; exit 0; fi

if [ ! -d "$REPO/.git" ]; then
  mkdir -p "$(dirname "$REPO")"
  git clone --depth 50 git@github.com:TurboSnails/BusinessWeb.git "$REPO"
fi
cd "$REPO"
git fetch -q origin main
git checkout -q -B main origin/main

"$NODE" scripts/market-cycle-local-szse.mjs

git add public/data/market-cycle-auto.json public/data/market-cycle-report.json
if git diff --cached --quiet; then echo "无新数据，不提交"; exit 0; fi
git -c user.name='szse-local-bot' -c user.email='szse-local-bot@users.noreply.github.com' \
  commit -q -m "data(cycle): 深交所成交额与融资占比本机刷新 $(TZ=Asia/Shanghai date +%F)"
for attempt in 1 2 3; do
  if git push -q origin main; then echo "已推送"; exit 0; fi
  git fetch -q origin main
  git rebase -q -X theirs origin/main
done
echo "推送失败" >&2
exit 1
