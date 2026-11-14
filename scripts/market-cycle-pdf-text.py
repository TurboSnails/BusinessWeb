#!/usr/bin/env python3
"""Extract plain text per page from a PDF (bytes on stdin) with pypdf; print JSON.

Usage: python3 -I scripts/market-cycle-pdf-text.py < file.pdf
Output: {"pages": ["page 1 text", "page 2 text", ...]}
Text only; no number interpretation (the caller validates the layout it expects).
Requires pypdf (pinned in scripts/requirements-market-cycle.txt).
"""
import io
import json
import sys

MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 60


def main():
    raw = sys.stdin.buffer.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('pdf too large')
    if not raw.startswith(b'%PDF'):
        raise ValueError('not a pdf')
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(raw))
    if len(reader.pages) > MAX_PAGES:
        raise ValueError('too many pages')
    pages = [(page.extract_text() or '') for page in reader.pages]
    json.dump({'pages': pages}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # noqa: BLE001 - surface a short reason to the caller
        print(f'{type(e).__name__}: {e}', file=sys.stderr)
        sys.exit(2)
