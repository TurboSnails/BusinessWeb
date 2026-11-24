#!/usr/bin/env python3
"""从 FactSet Earnings Insight 公开周报存档抽取标普 500 前瞻 12 个月市盈率（每月取最后一期）。

输出 data-raw/market-radar/factset-forward-pe.json，每行附原文 PDF 链接；随后运行
node scripts/backfill-us-history.mjs 把它接到 us-market-data.json 的 spxFactSetFpe 前面。

一次性工具，需要 pypdf（建议在临时虚拟环境里安装：python3 -m venv .venv && .venv/bin/pip install pypdf）。
FactSet 的 CDN 会对密集请求返回 429：每月先用互联网档案馆的索引挑出当月最后一期，先试官网一次，
限流或缺档时改读档案馆保存的同一 PDF；单线程、每次间隔 3 秒。已抓到的月份不重抓。
"""
import datetime as dt
import io
import json
import logging
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import pypdf

logging.disable(logging.WARNING)
BASE = 'https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, 'data-raw', 'market-radar', 'factset-forward-pe.json')
FIRST = (2016, 12)  # 2014–2016 年逐月探测过，官网和档案馆只留存 2016 年 12 月这一期
# FactSet 多年来换过几个托管路径，档案馆按原路径保存。
ARCHIVED_PREFIXES = [
    'advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_',
    'www.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_',
    'www.factset.com/hubfs/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_',
    'insight.factset.com/hubfs/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_',
]


def get(url, retry_429=False):
    while True:
        time.sleep(3)
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 429 and retry_429:
                time.sleep(90)
                continue
            return None
        except OSError:
            return None


def archive_index():
    """档案馆里每份周报的 {发布日: (快照时间, 原始链接)}，同一天保留最新快照。"""
    index = {}
    for prefix in ARCHIVED_PREFIXES:
        query = urllib.parse.urlencode({'url': prefix + '*', 'output': 'json', 'fl': 'timestamp,original',
                                        'filter': 'statuscode:200', 'collapse': 'urlkey'})
        body = get('https://web.archive.org/cdx/search/cdx?' + query, retry_429=True)
        for timestamp, original in (json.loads(body)[1:] if body else []):
            match = re.search(r'_(\d{2})(\d{2})(\d{2})\.pdf', original)
            if match:
                day = dt.date(2000 + int(match.group(3)), int(match.group(1)), int(match.group(2)))
                index[day] = max(index.get(day, (timestamp, original)), (timestamp, original))
    return index


def parse(day, data, archived=None):
    text = re.sub(r'\s+', ' ', ' '.join((page.extract_text() or '') for page in pypdf.PdfReader(io.BytesIO(data)).pages))
    pe = re.search(r'forward 12-month P/E ratio (?:for the S&P 500 )?is (\d{1,2}\.\d)', text)
    price = re.search(r'closing price of (\d{1,2},?\d{3}\.\d{2})', text)
    return {
        'date': day.isoformat(),
        'pe': float(pe.group(1)) if pe else None,
        'price': float(price.group(1).replace(',', '')) if price else None,
        'url': BASE + day.strftime('%m%d%y') + '.pdf',
        **({'archived': archived} if archived else {}),
    }


def candidates(year, month):
    """月内最后两周的周五和周四（周五休市时 FactSet 提前到周四发布）。"""
    last = dt.date(year + (month == 12), month % 12 + 1, 1) - dt.timedelta(days=1)
    friday = last - dt.timedelta(days=(last.weekday() - 4) % 7)
    days = []
    for week in (friday, friday - dt.timedelta(days=7)):
        days += [week, week - dt.timedelta(days=1)]
    return [day for day in days if day.month == month]


def main(until):
    rows = {row['date'][:7]: row for row in json.load(open(OUTPUT))} if os.path.exists(OUTPUT) else {}
    archived = archive_index()
    year, month = FIRST
    while (year, month) <= until:
        key = f'{year}-{month:02d}'
        if not rows.get(key, {}).get('pe'):
            listed = sorted((day for day in archived if (day.year, day.month) == (year, month)), reverse=True)
            for day in listed + [day for day in candidates(year, month) if day not in archived]:
                data = get(BASE + day.strftime('%m%d%y') + '.pdf')
                copy = None
                if not data and day in archived:
                    timestamp, original = archived[day]
                    copy = f'https://web.archive.org/web/{timestamp}id_/{original}'
                    data = get(copy, retry_429=True)
                if data:
                    row = parse(day, data, copy)
                    if row['pe']:
                        rows[key] = row
                        break
            print(key, rows.get(key, {}).get('pe'), flush=True)
            save(rows)
        year, month = (year + (month == 12), month % 12 + 1)
    save(rows)


def save(rows):
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w') as handle:
        json.dump([rows[key] for key in sorted(rows)], handle, indent=1)
        handle.write('\n')


if __name__ == '__main__':
    end = sys.argv[1] if len(sys.argv) > 1 else (dt.date.today().replace(day=1) - dt.timedelta(days=1)).strftime('%Y-%m')
    main(tuple(int(part) for part in end.split('-')))
