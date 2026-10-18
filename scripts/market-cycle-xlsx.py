#!/usr/bin/env python3
"""Read an .xlsx (bytes on stdin) with the standard library only; print the first sheet's non-empty cells as JSON.

Usage: python3 -I scripts/market-cycle-xlsx.py < file.xlsx
Output: {"sheet": "xl/worksheets/sheet1.xml", "cells": [{"r": 4, "c": "A", "v": 45961.0}, ...]}
Numbers come back as floats, text as strings; no date/format interpretation (the caller decides).
"""
import io
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'p': 'http://schemas.openxmlformats.org/package/2006/relationships'}
MAX_XML = 20 * 1024 * 1024
MAX_ROW = 2000


def read_xml(z, name):
    info = z.getinfo(name)
    if info.file_size > MAX_XML:
        raise ValueError(f'{name} too large')
    data = z.read(name)
    if b'<!DOCTYPE' in data or b'<!ENTITY' in data:
        raise ValueError(f'{name} has DTD/entity declarations')
    return ET.fromstring(data)


def first_sheet_path(z):
    wb = read_xml(z, 'xl/workbook.xml')
    sheet = wb.find('m:sheets/m:sheet', NS)
    if sheet is None:
        raise ValueError('no sheets')
    rid = sheet.get('{%s}id' % NS['r'])
    rels = read_xml(z, 'xl/_rels/workbook.xml.rels')
    for rel in rels.findall('p:Relationship', NS):
        if rel.get('Id') == rid:
            target = rel.get('Target').lstrip('/')
            return target if target.startswith('xl/') else 'xl/' + target
    raise ValueError('sheet relationship not found')


def shared_strings(z):
    if 'xl/sharedStrings.xml' not in z.namelist():
        return []
    root = read_xml(z, 'xl/sharedStrings.xml')
    return [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])) for si in root.findall('m:si', NS)]


def main():
    raw = sys.stdin.buffer.read()
    z = zipfile.ZipFile(io.BytesIO(raw))
    path = first_sheet_path(z)
    strings = shared_strings(z)
    root = read_xml(z, path)
    cells = []
    for c in root.iter('{%s}c' % NS['m']):
        ref = re.fullmatch(r'([A-Z]+)(\d+)', c.get('r') or '')
        if not ref or int(ref.group(2)) > MAX_ROW:
            continue
        kind = c.get('t')
        if kind == 'inlineStr':
            value = ''.join(t.text or '' for t in c.iter('{%s}t' % NS['m']))
        else:
            v = c.find('m:v', NS)
            if v is None or v.text is None or v.text == '':
                continue
            if kind == 's':
                value = strings[int(v.text)]
            elif kind in ('str', 'e'):
                value = v.text
            elif kind == 'b':
                value = v.text == '1'
            else:
                value = float(v.text)
        if value == '':
            continue
        cells.append({'r': int(ref.group(2)), 'c': ref.group(1), 'v': value})
    json.dump({'sheet': path, 'cells': cells}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:  # report as non-zero so the Node caller isolates the source
        print(f'xlsx parse failed: {exc}', file=sys.stderr)
        sys.exit(2)
