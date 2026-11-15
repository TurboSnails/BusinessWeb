#!/usr/bin/env bash
# 生产周报预览（dryRun：不发信、不写去重表）。在自己的终端运行：bash scripts/weekly-dryrun.sh
# 提示输入 CRON_SECRET（不回显）；结果保存到 /tmp/weekly-dryrun.json 并打印 HTTP 状态码。
set -euo pipefail
URL="https://business-web-black.vercel.app/api/market-data/candidate-alerts-digest?weekly=1&dryRun=1"
read -r -s -p "CRON_SECRET: " S; echo
code=$(curl -s -o /tmp/weekly-dryrun.json -w '%{http_code}' -H "Authorization: Bearer $S" "$URL")
unset S
echo "HTTP $code，结果已存到 /tmp/weekly-dryrun.json"
