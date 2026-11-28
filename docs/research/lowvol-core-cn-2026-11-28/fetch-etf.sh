#!/bin/zsh
# ETF 基本资料（curl 版；node fetch 连不上该主机）。原始响应先存临时目录，只把非绩效字段写进 OUT/etf-meta.json。
OUT=$1; shift
TMP=$(mktemp -d)
for c in "$@"; do
  curl -s -m 25 --retry 3 -A "Mozilla/5.0" "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation?FCODE=$c&deviceid=Wap&plat=Wap&product=EFund&version=6.5.5" -o $TMP/$c.info.json; sleep 2
  curl -s -m 25 --retry 3 -A "Mozilla/5.0" "https://fundf10.eastmoney.com/jjfl_$c.html" -o $TMP/$c.fee.html; sleep 2
done
python3 -I "$(dirname $0)/parse-etf.py" $TMP "$OUT/etf-meta.json" "$@"
