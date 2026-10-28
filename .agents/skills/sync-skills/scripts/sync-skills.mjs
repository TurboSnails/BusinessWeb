#!/usr/bin/env node
// 把一个目录里的 Skills 同步到全局中心库，再用相对软链接分发给各个 agent。
// 无 npm 依赖，Node 18+。默认只预览（dry-run），加 --apply 才会写入。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HOME = os.homedir();
const DEFAULT_AGENT_DIRS = [
  '.claude/skills', '.codex/skills', '.cursor/skills', '.kimi/skills',
  '.config/opencode/skills', '.opencode/skills', '.gemini/antigravity/skills', '.gemini/skills', '.codebuddy/skills',
].map(p => path.join(HOME, p));

const USAGE = `用法：node sync-skills.mjs [选项]

  --from DIR       源目录，默认本工具所在的 skills 目录（…/.agents/skills）
  --hub DIR        全局中心库，默认 ~/.agents/skills
  --only a,b       只同步这些 Skill
  --exclude a,b    跳过这些 Skill
  --agents D1,D2   分发的目标目录，默认自动识别已存在的 agent 目录；
                   显式指定的目录不存在时会创建
  --no-link        只同步到中心库，不分发
  --force          目标已存在但不是指向中心库的链接时，备份后替换
  --apply          真正执行；不加则只预览
  -h, --help       显示帮助`;

export function parseArgs(argv) {
  const o = { exclude: [], only: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} 缺少参数`); return argv[++i]; };
    if (a === '--from') o.from = val();
    else if (a === '--hub') o.hub = val();
    else if (a === '--only') o.only = val().split(',').filter(Boolean);
    else if (a === '--exclude') o.exclude = val().split(',').filter(Boolean);
    else if (a === '--agents') o.agents = val().split(',').filter(Boolean);
    else if (a === '--no-link') o.noLink = true;
    else if (a === '--force') o.force = true;
    else if (a === '--apply') o.apply = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  return o;
}

const isSkillDir = p => { try { return fs.statSync(path.join(p, 'SKILL.md')).isFile(); } catch { return false; } };

// 目录内容指纹：相对路径 + 文件内容，忽略以 . 开头的文件和 node_modules。
function fingerprint(dir) {
  const h = crypto.createHash('sha256');
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() || e.isSymbolicLink()) h.update(path.relative(dir, p) + '\0').update(fs.readFileSync(p)).update('\0');
    }
  };
  walk(dir);
  return h.digest('hex');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.DS_Store') continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function sync(opts) {
  const from = path.resolve(opts.from);
  const hub = path.resolve(opts.hub || path.join(HOME, '.agents', 'skills'));
  const backupRoot = path.join(path.dirname(hub), 'skill-backups', stamp());
  const apply = !!opts.apply;
  const log = [];
  const report = { hub, from, apply, added: [], updated: [], unchanged: [], linked: [], linkOk: [], conflicts: [], skipped: [], log };

  if (!fs.existsSync(from)) throw new Error(`源目录不存在：${from}`);
  if (fs.realpathSync(from) === (fs.existsSync(hub) ? fs.realpathSync(hub) : hub)) throw new Error('源目录与中心库相同，无需同步');

  const names = fs.readdirSync(from).filter(n => !n.startsWith('.') && isSkillDir(path.join(from, n)))
    .filter(n => !opts.only?.length || opts.only.includes(n))
    .filter(n => !opts.exclude?.includes(n)).sort();
  const skipped = fs.readdirSync(from).filter(n => !n.startsWith('.') && !names.includes(n) && !isSkillDir(path.join(from, n)));
  report.skipped = skipped;

  if (apply) fs.mkdirSync(hub, { recursive: true });
  for (const n of names) {
    const src = path.join(from, n), dest = path.join(hub, n);
    if (!fs.existsSync(dest)) {
      report.added.push(n);
      if (apply) copyDir(src, dest);
    } else if (fingerprint(src) !== fingerprint(dest)) {
      report.updated.push(n);
      if (apply) {
        fs.mkdirSync(backupRoot, { recursive: true });
        fs.cpSync(dest, path.join(backupRoot, n), { recursive: true });
        fs.rmSync(dest, { recursive: true, force: true });
        copyDir(src, dest);
      }
    } else report.unchanged.push(n);
  }
  if (report.updated.length) report.backup = backupRoot;

  if (!opts.noLink) {
    const explicit = !!opts.agents?.length;
    const candidates = (explicit ? opts.agents.map(p => path.resolve(p)) : DEFAULT_AGENT_DIRS)
      .filter(d => explicit || fs.existsSync(d));
    const seen = new Set(), dirs = [];
    for (const d of candidates) {
      const real = fs.existsSync(d) ? fs.realpathSync(d) : d;
      if (real === (fs.existsSync(hub) ? fs.realpathSync(hub) : hub) || seen.has(real)) continue;
      seen.add(real); dirs.push(d);
    }
    report.agentDirs = dirs;
    for (const d of dirs) {
      if (apply) fs.mkdirSync(d, { recursive: true });
      for (const n of names) {
        const link = path.join(d, n), target = path.join(hub, n);
        const rel = path.relative(fs.existsSync(d) ? fs.realpathSync(d) : d, target);
        let st = null;
        try { st = fs.lstatSync(link); } catch { /* 不存在 */ }
        if (!st) {
          report.linked.push(`${d}/${n}`);
          if (apply) fs.symlinkSync(rel, link);
          continue;
        }
        let ok = false;
        try { ok = fs.realpathSync(link) === fs.realpathSync(target); } catch { /* 悬空链接 */ }
        if (ok) { report.linkOk.push(`${d}/${n}`); continue; }
        if (opts.force) {
          report.linked.push(`${d}/${n}（替换）`);
          if (apply) {
            const b = path.join(backupRoot, 'agents', path.basename(path.dirname(d)) + '-' + path.basename(d));
            fs.mkdirSync(b, { recursive: true });
            fs.renameSync(link, path.join(b, n));
            report.backup = backupRoot;
            fs.symlinkSync(rel, link);
          }
        } else report.conflicts.push(`${d}/${n}`);
      }
    }
  }
  return report;
}

export function format(r) {
  const L = [];
  L.push(`${r.apply ? '已执行' : '预览（未写入，加 --apply 执行）'}：${r.from} → ${r.hub}`);
  L.push(`中心库：新增 ${r.added.length}，更新 ${r.updated.length}，未变 ${r.unchanged.length}`);
  if (r.added.length) L.push(`  新增：${r.added.join(', ')}`);
  if (r.updated.length) L.push(`  更新：${r.updated.join(', ')}（旧版备份到 ${r.backup}）`);
  else if (r.backup) L.push(`被替换的旧内容已备份到 ${r.backup}`);
  if (r.agentDirs) {
    L.push(`分发：新建链接 ${r.linked.length}，已正确 ${r.linkOk.length}，冲突 ${r.conflicts.length}`);
    L.push(`  目标目录：${r.agentDirs.join('、') || '（无）'}`);
    for (const x of r.linked) L.push(`  + ${x}`);
    for (const x of r.conflicts) L.push(`  ! 冲突，未改动（目标已存在且不是指向中心库的链接，可加 --force）：${x}`);
  }
  if (r.skipped.length) L.push(`已忽略（没有 SKILL.md）：${r.skipped.join(', ')}`);
  return L.join('\n');
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) { console.log(USAGE); process.exit(0); }
    o.from = o.from || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    console.log(format(sync(o)));
  } catch (e) {
    console.error(`错误：${e.message}\n\n${USAGE}`);
    process.exit(1);
  }
}
