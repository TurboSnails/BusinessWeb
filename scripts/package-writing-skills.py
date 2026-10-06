"""Package installed writing skills, keeping all reference and agent files."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'ai-skills'
SKILLS = ('novel-editor', 'literary-writing-mentor', 'tomato-novel-coach')


def package(filename, skills, source):
    entries = [('README.md', OUTPUT / 'writing-skills-README.md')]
    for skill in skills:
        directory = source / skill
        if not (directory / 'SKILL.md').is_file():
            raise FileNotFoundError(directory / 'SKILL.md')
        entries.extend(
            (f'{skill}/{path.relative_to(directory).as_posix()}', path)
            for path in sorted(directory.rglob('*'))
            if path.is_file() and not any(part.startswith('.') for part in path.relative_to(directory).parts)
        )
    with ZipFile(OUTPUT / filename, 'w', compression=ZIP_DEFLATED) as archive:
        for name, path in entries:
            info = ZipInfo(name, date_time=(2026, 10, 6, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    print(f'{filename}: {len(entries)} files')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path.home() / '.codex' / 'skills')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for skill in SKILLS:
        package(f'{skill}.zip', (skill,), args.source)
    package('writing-skills.zip', SKILLS, args.source)
