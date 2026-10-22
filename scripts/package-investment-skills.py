"""Package the complete investment skills with reproducible ZIP contents."""
from pathlib import Path
from shutil import copytree, ignore_patterns
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.agents' / 'skills'
OUTPUT = ROOT / 'public' / 'investment-skills'
SKILLS = ('stock-analysis', 'comprehensive-equity-valuation', 'trading-analysis-team')
LEGACY_SKILLS = ('stock-research-expert', 'tencent-stock-research-team')


def write_package(filename, skills):
    with ZipFile(OUTPUT / filename, 'w', compression=ZIP_DEFLATED) as archive:
        entries = [('README.md', OUTPUT / 'README.md')]
        for skill in skills:
            directory = SOURCE / skill
            if not (directory / 'SKILL.md').is_file():
                raise FileNotFoundError(directory / 'SKILL.md')
            entries.extend(
                (f'{skill}/{path.relative_to(directory).as_posix()}', path)
                for path in sorted(directory.rglob('*'))
                if path.is_file() and not any(part.startswith('.') or part == '__pycache__' for part in path.relative_to(directory).parts) and path.suffix != '.pyc'
            )
        for name, path in entries:
            info = ZipInfo(name, date_time=(2026, 10, 6, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    print(f'{filename}: {len(entries)} files')


OUTPUT.mkdir(parents=True, exist_ok=True)
# Codex and Antigravity share .agents; sync the unified skill and its legacy names.
for platform in ('.claude', '.opencode', '.codebuddy'):
    for skill in ('stock-analysis', 'comprehensive-equity-valuation') + LEGACY_SKILLS:
        copytree(SOURCE / skill, ROOT / platform / 'skills' / skill, dirs_exist_ok=True, ignore=ignore_patterns('__pycache__', '*.pyc'))
for skill in SKILLS:
    write_package(f'{skill}.zip', (skill,))
for skill in LEGACY_SKILLS:
    # The compatibility entry reads ../stock-analysis/SKILL.md after extraction.
    write_package(f'{skill}.zip', (skill, 'stock-analysis'))
write_package('investment-analysis-skills.zip', SKILLS)
