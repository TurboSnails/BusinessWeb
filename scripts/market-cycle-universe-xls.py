#!/usr/bin/env python3
"""Read an official CSI constituent .xls (bytes on stdin); print {"date","indexCode","rows":[{"code","name"}]} as JSON.

Needs xlrd==2.0.2 (scripts/requirements-market-cycle.txt); the old binary format is not readable with the standard library.
"""
import json
import sys

import xlrd


def main():
    book = xlrd.open_workbook(file_contents=sys.stdin.buffer.read())
    sheet = book.sheet_by_index(0)
    head = [str(c).replace(' ', '') for c in sheet.row_values(0)]

    def col(*names):
        for i, h in enumerate(head):
            if any(n in h for n in names):
                return i
        raise ValueError('missing column ' + names[0])

    date_i, idx_i, code_i, name_i = col('日期'), col('指数代码'), col('成份券代码'), col('成份券名称')
    rows, dates, indexes = [], set(), set()
    for r in range(1, sheet.nrows):
        v = sheet.row_values(r)
        code = str(v[code_i]).strip()
        if not code:
            continue
        dates.add(str(v[date_i]).strip())
        indexes.add(str(v[idx_i]).strip())
        rows.append({'code': code, 'name': str(v[name_i]).strip()})
    if len(dates) != 1 or len(indexes) != 1:
        raise ValueError('mixed dates or indexes in file')
    d = dates.pop()
    json.dump({'date': f'{d[:4]}-{d[4:6]}-{d[6:8]}', 'indexCode': indexes.pop(), 'rows': rows}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
