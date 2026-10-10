import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PiWasmAgent} from '../dist/index.js';
import {openNodeJournal} from '../dist/storage/node.js';
import {openAICompatible} from '../dist/providers/openai.js';

test('HTTP model → WASM Pi → host tool → HTTP model → journal; credentials stay out of guest and journal',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'pi-http-'));const seen=[];
  const server=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);seen.push(body);
    assert.equal(req.headers.authorization,'Bearer test-only-secret');
    const done=body.messages.at(-1).role==='tool';
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:done?'stop':'tool_calls',message:done?{content:'42 via HTTP'}:{content:null,tool_calls:[{id:'http-call',type:'function',function:{name:'double',arguments:'{"n":21}'}}]}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}));
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
  const a=await PiWasmAgent.open({journal:await openNodeJournal(join(dir,'log')),model:openAICompatible({baseURL:`http://127.0.0.1:${server.address().port}/v1`,model:'test',apiKey:'test-only-secret'}),tools:[{name:'double',description:'Double',parameters:{type:'object',properties:{n:{type:'number'}},required:['n']},execute:({n})=>String(n*2)}]});
  t.after(()=>a.terminate());
  await a.wait((await a.submit('double 21')).id);
  assert.match(JSON.stringify(await a.view()),/42 via HTTP/);assert.equal(seen.length,2);
  assert.equal(seen[1].messages.at(-1).content,'42');assert.equal(seen[0].tools[0].function.name,'double');
  const {readFile}=await import('node:fs/promises');assert(!(await readFile(join(dir,'log'),'utf8')).includes('test-only-secret'));
  assert.equal(await a.evaluate('return typeof process;'),'undefined');await a.close();
});

test('HTTP adapter accepts empty tool-call arguments and reports error bodies',async t=>{
  let calls=0;
  const server=createServer(async(req,res)=>{
    for await(const _ of req);calls++;
    if(calls===2){res.writeHead(429);res.end('rate limited');return;}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'c',type:'function',function:{name:'ping',arguments:''}}]}}]}));
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const model=openAICompatible({baseURL:`http://127.0.0.1:${server.address().port}/v1`,model:'test'});
  const first=await model({context:{messages:[]}},AbortSignal.timeout(5000),()=>{});
  assert.deepEqual(first.content[0].arguments,{});
  await assert.rejects(model({context:{messages:[]}},AbortSignal.timeout(5000),()=>{}),/HTTP 429 rate limited/);
});
