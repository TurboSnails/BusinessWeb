import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const directory = await mkdtemp(join(tmpdir(), 'businessweb-functions-'))
try {
  const compiled = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json', '--noEmit', 'false', '--allowImportingTsExtensions', 'false', '--rewriteRelativeImportExtensions', 'true', '--outDir', directory], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr)
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: pkg.type ?? 'commonjs' }))
  await mkdir(join(directory, 'server/knowledge'), { recursive: true })
  for (const file of ['api/china-stock.js', 'api/grid-market.js', 'server/market.mjs', 'api/cls-plate.js', 'server/sectorHistory.js', 'server/knowledge/links.mjs']) await copyFile(resolve(file), join(directory, file))
  await mkdir(join(directory, 'server/functions'), { recursive: true })
  for (const name of await readdir('server/functions')) {
    if (/\.(mjs|js)$/.test(name) && !name.includes('.test.')) await copyFile(resolve(`server/functions/${name}`), join(directory, 'server/functions', name))
  }
  for (const file of [...(await readdir('server')).filter(name => /\.(mjs|js)$/.test(name) && !name.includes('.test.')).map(name => `server/${name}`)]) await copyFile(resolve(file), join(directory, file))
  await mkdir(join(directory, 'api/market-data'), { recursive: true })
  await copyFile(resolve('api/market-data/[marketRoute].js'), join(directory, 'api/market-data/[marketRoute].js'))
  await writeFile(join(directory, 'check.mjs'), `
import assert from 'node:assert/strict';
import sync from './api/grid-sync.js';
import knowledge from './api/knowledge.js';
import pulse from './api/pulse-sync.js';
import candidates from './api/candidates-sync.js';
import companyNotes from './api/company-notes.js';
import market from './api/grid-market.js';
import china from './api/china-stock.js';
import cls from './api/cls-plate.js';
import comments from './api/comments.js';
import ask from './api/ask.js';
import dailyAnalysis from './server/functions/daily-analysis.js';
import candidateAlertsDigest from './server/functions/candidate-alerts-digest.js';
import planSync from './server/functions/plan-sync.js';
import marketData from './api/market-data/[marketRoute].js';
const res = () => ({code:200, body:null, setHeader(){}, status(code){this.code=code;return this}, json(body){this.body=body;return this}});
for (const [handler, request, code] of [[companyNotes,{method:'GET',headers:{},query:{action:'list',market:'cn',code:'600900'}},503],[companyNotes,{method:'POST',headers:{},query:{action:'unlock'}},503],[knowledge,{method:'GET',headers:{},query:{action:'status'}},503],[sync,{method:'GET',headers:{}},503],[pulse,{method:'GET',headers:{}},503],[pulse,{method:'POST',headers:{}},405],[candidates,{method:'GET',headers:{}},503],[candidates,{method:'POST',headers:{}},405],[market,{method:'GET',query:{}},400],[china,{method:'GET',query:{}},400],[cls,{method:'GET',query:{}},400],[comments,{method:'GET',headers:{},query:{}},503],[comments,{method:'PUT',headers:{}},405],[ask,{method:'PUT',headers:{}},405],[ask,{method:'GET',headers:{}},503],[ask,{method:'POST',headers:{}},503]]) {
 const response=res(); await handler(request,response); assert.equal(response.code,code);
}
console.log('Native Node function loading and unconfigured/invalid requests: passed');
const dailyResponse=res(); await dailyAnalysis({method:'POST'},dailyResponse); assert.equal(dailyResponse.code,405);
for (const [request, code] of [[{method:'POST',headers:{}},405],[{method:'GET',headers:{}},503],[{method:'GET',headers:{},query:{weekly:'1'}},503]]) { const response=res(); await candidateAlertsDigest(request,response); assert.equal(response.code,code); }
console.log('Candidate alerts digest + weekly mode (TS from src, native ESM) load and reject unconfigured requests: passed');
const planRes=res(); await planSync({method:'GET',headers:{}},planRes); assert.equal(planRes.code,503);
const planPost=res(); await planSync({method:'POST',headers:{}},planPost); assert.equal(planPost.code,405);
const agg=res(); await marketData({method:'GET',headers:{},query:{marketRoute:'plan-sync'}},agg); assert.equal(agg.code,503);
console.log('Plan-sync wrapper + aggregator lazy route reject unconfigured requests: passed');
`)
  const env = { ...process.env, CRON_SECRET: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', GRID_SYNC_TOKEN: '', PULSE_SYNC_TOKEN: '', PLAN_SYNC_TOKEN: '', COMPANY_NOTES_WRITE_TOKEN: '' }
  const run = spawnSync(process.execPath, ['--no-experimental-detect-module', join(directory, 'check.mjs')], { env, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  process.stdout.write(run.stdout)
} finally {
  await rm(directory, { recursive: true, force: true })
}
