#!/usr/bin/env python3
"""把 AAII 官方免费提供的情绪调查全历史（sentiment.xls，1987 年 7 月起）整理成站内口径。

输出 data-raw/market-radar/aaii-sentiment.json：[调查截止日（周三）, 看多 %, 看空 %]，保留一位小数，
与 us-market-data.json 的 retailBull / retailBear 一致；随后运行 node scripts/backfill-us-history.mjs 接到序列前面。
AAII 表里的日期是发布日（近年为周四，早年为周五），这里换成发布日之前最近的周三。

一次性工具，需要 xlrd（python3 -m venv .venv && .venv/bin/pip install xlrd）。
"""
import datetime as dt
import json
import os
import urllib.request

import xlrd

SOURCE = 'https://www.aaii.com/files/surveys/sentiment.xls'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, 'data-raw', 'market-radar', 'aaii-sentiment.json')
HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36'}


def survey_week(reported):
    return reported - dt.timedelta(days=(reported.weekday() - 2) % 7 or 7)


def main():
    with urllib.request.urlopen(urllib.request.Request(SOURCE, headers=HEADERS), timeout=60) as response:
        book = xlrd.open_workbook(file_contents=response.read())
    sheet = book.sheet_by_name('SENTIMENT')
    weeks = {}
    for index in range(sheet.nrows):
        date, bull, _, bear = sheet.row_values(index)[:4]
        if all(isinstance(value, float) for value in (date, bull, bear)) and date > 30000:
            reported = xlrd.xldate_as_datetime(date, book.datemode).date()
            # 早年发布日不规则，偶有两期落在同一周，保留后一期
            weeks[survey_week(reported).isoformat()] = [round(bull * 100, 1), round(bear * 100, 1)]
    rows = [[week, *values] for week, values in sorted(weeks.items())]
    if len(rows) < 2000:
        raise SystemExit('AAII 情绪表行数异常')
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w') as handle:
        json.dump(rows, handle)
        handle.write('\n')
    print(len(rows), rows[0], rows[-1])


if __name__ == '__main__':
    main()
