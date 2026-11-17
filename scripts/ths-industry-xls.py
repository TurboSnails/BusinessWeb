#!/usr/bin/env python3
"""读取官方旧版二进制 .xls（stdin 字节），输出 {"head": [...], "rows": [[...], ...]} JSON，单元格一律转成去空白的字符串。

供 scripts/ths-industry.mjs 解析中证指数收盘权重文件、国证指数样本文件。依赖 xlrd==2.0.2（scripts/requirements-market-cycle.txt）。
"""
import json
import sys

import xlrd


def cell(v):
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def main():
    book = xlrd.open_workbook(file_contents=sys.stdin.buffer.read())
    sheet = book.sheet_by_index(0)
    head = [cell(c).replace(' ', '') for c in sheet.row_values(0)]
    rows = [[cell(c) for c in sheet.row_values(r)] for r in range(1, sheet.nrows)]
    json.dump({'head': head, 'rows': rows}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
