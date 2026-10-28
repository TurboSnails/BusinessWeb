import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sync, parseArgs } from './sync-skills.mjs';

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sync-skills-'));
const skill = (root, name, body = 'a') => {
  fs.mkdirSync(path.join(root, name, 'references'), { recursive: true });
  fs.writeFileSync(path.join(root, name, 'SKILL.md'), `---\nname: ${name}\n---\n${body}`);
  fs.writeFileSync(path.join(root, name, 'references', 'x.md'), body);
};

test('dry-run changes nothing; apply copies and links', () => {
  const t = mk(), from = path.join(t, 'src'), hub = path.join(t, 'hub'), ag = path.join(t, 'agent');
  skill(from, 'one'); fs.mkdirSync(path.join(from, 'not-a-skill'), { recursive: true });
  const dry = sync({ from, hub, agents: [ag] });
  assert.deepEqual(dry.added, ['one']);
  assert.equal(fs.existsSync(hub), false);
  assert.deepEqual(dry.skipped, ['not-a-skill']);
  const r = sync({ from, hub, agents: [ag], apply: true });
  assert.equal(fs.readFileSync(path.join(hub, 'one', 'references', 'x.md'), 'utf8'), 'a');
  assert.equal(fs.realpathSync(path.join(ag, 'one')), fs.realpathSync(path.join(hub, 'one')));
  assert.ok(!path.isAbsolute(fs.readlinkSync(path.join(ag, 'one'))));
  assert.equal(r.linked.length, 1);
});

test('second run is idempotent; changed skill is updated with backup', () => {
  const t = mk(), from = path.join(t, 'src'), hub = path.join(t, 'hub'), ag = path.join(t, 'agent');
  skill(from, 'one');
  sync({ from, hub, agents: [ag], apply: true });
  const again = sync({ from, hub, agents: [ag], apply: true });
  assert.deepEqual([again.added, again.updated, again.linked], [[], [], []]);
  assert.deepEqual(again.unchanged, ['one']);
  skill(from, 'one', 'b');
  const upd = sync({ from, hub, agents: [ag], apply: true });
  assert.deepEqual(upd.updated, ['one']);
  assert.equal(fs.readFileSync(path.join(hub, 'one', 'references', 'x.md'), 'utf8'), 'b');
  assert.equal(fs.readFileSync(path.join(upd.backup, 'one', 'references', 'x.md'), 'utf8'), 'a');
});

test('existing real dir or foreign link is a conflict unless --force', () => {
  const t = mk(), from = path.join(t, 'src'), hub = path.join(t, 'hub'), ag = path.join(t, 'agent');
  skill(from, 'one'); skill(ag, 'one', 'mine');
  const r = sync({ from, hub, agents: [ag], apply: true });
  assert.equal(r.conflicts.length, 1);
  assert.equal(fs.lstatSync(path.join(ag, 'one')).isSymbolicLink(), false);
  const f = sync({ from, hub, agents: [ag], apply: true, force: true });
  assert.equal(f.conflicts.length, 0);
  assert.equal(fs.lstatSync(path.join(ag, 'one')).isSymbolicLink(), true);
  const saved = path.join(f.backup, 'agents', `${path.basename(t)}-agent`, 'one', 'references', 'x.md');
  assert.equal(fs.readFileSync(saved, 'utf8'), 'mine');
});

test('only / exclude / no-link and same-dir guard', () => {
  const t = mk(), from = path.join(t, 'src'), hub = path.join(t, 'hub'), ag = path.join(t, 'agent');
  skill(from, 'a'); skill(from, 'b'); skill(from, 'c');
  const r = sync({ from, hub, agents: [ag], apply: true, only: ['a', 'b'], exclude: ['b'], noLink: true });
  assert.deepEqual(r.added, ['a']);
  assert.equal(fs.existsSync(ag), false);
  assert.throws(() => sync({ from: hub, hub }), /相同/);
  assert.throws(() => parseArgs(['--bogus']), /未知参数/);
});
