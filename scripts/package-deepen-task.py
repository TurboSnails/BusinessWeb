"""Build the downloadable deepen-task skill from its tracked source."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'agent-skills' / 'skills' / 'deepen-task' / 'SKILL.md'
OUTPUT = ROOT / 'public' / 'ai-skills' / 'deepen-task.zip'

if __name__ == '__main__':
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    info = ZipInfo('deepen-task/SKILL.md', date_time=(2026, 10, 27, 0, 0, 0))
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    with ZipFile(OUTPUT, 'w') as archive:
        archive.writestr(info, SOURCE.read_bytes())
    print(OUTPUT.relative_to(ROOT))
