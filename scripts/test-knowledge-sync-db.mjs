import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const database=`sync_test_${Date.now()}`
execFileSync('docker',['exec','businessweb-sync-test','psql','-U','postgres','-c',`create database ${database}`])
const run=sql=>execFileSync('docker',['exec','-i','businessweb-sync-test','psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']})
run('alter role service_role bypassrls;')
run(readFileSync('supabase/migrations/202610050001_knowledge.sql','utf8'))
run(readFileSync('supabase/migrations/202610050002_knowledge_sync.sql','utf8'))
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
const gen='11111111-1111-4111-8111-111111111111',empty='22222222-2222-4222-8222-222222222222',id='a'.repeat(64)
const note={path:'A.md',content:'# Hello',version:createHash('sha256').update('# Hello').digest('hex')}
run(`select businessweb_sync_stage('${gen}','${id}',${literal([note])});`)
const graph={vaultId:id,nodes:[{path:'A.md',title:'Hello'}],edges:[],unresolved:0}
if(run(`select businessweb_sync_publish(0,'${gen}','${id}',${literal(graph)},1,${literal([{path:'A.md',relations:{outgoing:[],backlinks:[]}}])});`).trim()!=='t')throw Error('initial publish failed')
if(run(`select businessweb_sync_publish(0,'${empty}','${id}',${literal({vaultId:id,nodes:[],edges:[],unresolved:0})},0,'[]');`).trim()!=='f')throw Error('stale revision accepted')
if(run(`select businessweb_sync_publish(1,'${empty}','${id}',${literal({vaultId:id,nodes:[],edges:[],unresolved:0})},0,'[]');`).trim()!=='t')throw Error('empty snapshot rejected')
const manifest=JSON.parse(run(`select businessweb_sync_manifest('${gen}',null);`).trim());if(manifest.notes.length!==1||manifest.head.revision!==1)throw Error('old snapshot unavailable')
if(JSON.parse(run(`select businessweb_sync_manifest('${empty}',null);`).trim()).notes.length!==0)throw Error('empty manifest')
if(JSON.parse(run(`select businessweb_sync_note('${gen}','A.md');`).trim()).content!=='# Hello')throw Error('old body unavailable')
for(const sql of [`select businessweb_sync_stage('${gen}','${id}',${literal([note])});`,`select businessweb_sync_stage('33333333-3333-4333-8333-333333333333','${id}',${literal([{...note,content:'tampered'}])});`]){
 let rejected=false;try{run(sql)}catch{rejected=true}if(!rejected)throw Error('unsafe batch accepted')
}
if(run("select has_table_privilege('anon','businessweb_knowledge_notes','SELECT'),has_function_privilege('authenticated','businessweb_sync_stage(uuid,text,jsonb)','EXECUTE');").trim()!=='f|f')throw Error('unauthorized access')
let legacyRejected=false
try { run(`select businessweb_upload_knowledge_batch('${empty}',${literal([{note:{...note,vaultId:id,title:'Hello'}}])});`) } catch { legacyRejected=true }
if(!legacyRejected)throw Error('legacy uploader mutated a published empty snapshot')
const many='55555555-5555-4555-8555-555555555555'
const manyNotes=Array.from({length:227},(_,i)=>({...note,path:`Page-${String(i).padStart(3,'0')}.md`}))
for(let i=0;i<manyNotes.length;i+=100)run(`set role service_role;select businessweb_sync_stage('${many}','${id}',${literal(manyNotes.slice(i,i+100))});`)
const manyGraph={vaultId:id,nodes:manyNotes.map(n=>({path:n.path,title:'Hello'})),edges:[],unresolved:0}
if(!run(`set role service_role;select businessweb_sync_publish(2,'${many}','${id}',${literal(manyGraph)},227,${literal(manyNotes.map(n=>({path:n.path,relations:{outgoing:[],backlinks:[]}})))});`).trim().endsWith('t'))throw Error('service role cannot publish')
const first=JSON.parse(run(`select businessweb_sync_manifest('${many}',null);`).trim())
const second=JSON.parse(run(`select businessweb_sync_manifest('${many}','${first.nextCursor}');`).trim())
if(first.total!==227||first.notes.length!==200||second.notes.length!==27||second.nextCursor!==null)throw Error('database pagination truncated')
let oldRepublishRejected=false
try{run(`select businessweb_publish_knowledge(3,'${gen}','${id}',${literal(graph)});`)}catch{oldRepublishRejected=true}
if(!oldRepublishRejected)throw Error('legacy RPC republished historical generation')
console.log('PostgreSQL integration: publish, CAS, empty snapshot, immutable history, SHA-256 and permissions passed.')
