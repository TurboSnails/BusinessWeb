"""Build the downloadable kf-deeper skill from its tracked source."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.agents' / 'skills' / 'kf-deeper' / 'SKILL.md'
OUTPUT = ROOT / 'public' / 'ai-skills' / 'kf-deeper.zip'

if __name__ == '__main__':
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    info = ZipInfo('kf-deeper/SKILL.md', date_time=(2026, 10, 28, 0, 0, 0))
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    with ZipFile(OUTPUT, 'w') as archive:
        archive.writestr(info, SOURCE.read_bytes())
    print(OUTPUT.relative_to(ROOT))
