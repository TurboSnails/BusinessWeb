#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { projectRoot, port } from '../server/knowledge/config.mjs';
const uiPort = port(process.env.KNOWLEDGE_UI_PORT, 5173);
const env = { ...process.env, KNOWLEDGE_TOKEN: process.env.KNOWLEDGE_TOKEN || randomBytes(32).toString('hex'), KNOWLEDGE_UI_PORT: String(uiPort) };
const children = [];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
for (const args of [['run', 'knowledge:server'], ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort']]) {
  const child = spawn('npm', args, { cwd: projectRoot, env, stdio: 'inherit', shell: false });
  children.push(child);
  child.on('error', error => { console.error(error.message); close(1); });
  child.on('exit', code => close(code ?? 1));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => close());
console.log(`个人知识中心：http://127.0.0.1:${uiPort}/knowledge`);
