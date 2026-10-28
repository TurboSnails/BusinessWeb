"""Build the downloadable fullstack-workflow skill ZIP from its tracked source."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.agents' / 'skills' / 'fullstack-workflow'
OUTPUT = ROOT / 'public' / 'ai-skills' / 'fullstack-workflow.zip'
STAMP = (2026, 10, 28, 0, 0, 0)

if __name__ == '__main__':
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SOURCE.rglob('*') if p.is_file() and not p.name.startswith('.'))
    with ZipFile(OUTPUT, 'w') as archive:
        for path in files:
            info = ZipInfo(f'fullstack-workflow/{path.relative_to(SOURCE).as_posix()}', date_time=STAMP)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    print(OUTPUT.relative_to(ROOT), len(files), 'files')
