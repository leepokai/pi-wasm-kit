import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiWasmAgent } from '../dist/index.js';
import { openNodeJournal } from '../dist/storage/node.js';
import { fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
const answer = text => fauxAssistantMessage(text);
const setup = async t => { const dir = await mkdtemp(join(tmpdir(), 'pi-wasm-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return join(dir, 'journal.jsonl'); };
const until = async fn => { for (let i = 0; i < 200; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('Timed out'); };

test('real Pi in WASM: tool validation, progress, events, persistence and deduplication', async t => {
  const path = await setup(t); const events = []; let calls = 0;
  const options = { model: async ({context}) => context.messages.at(-1).role === 'toolResult' ? answer('The result is 42') : { ...answer(''), stopReason: 'toolUse', content: [{type:'toolCall',id:'c1',name:'multiply',arguments:{value:21}}] }, tools: [{ name:'multiply',description:'Double a number',parameters:{type:'object',properties:{value:{type:'number'}},required:['value'],additionalProperties:false}, replay:'safe', execute: (args, ctx) => { calls++; ctx.output('Calculating…'); return String(args.value*2); } }], onEvent:e=>events.push(e) };
  let a = await PiWasmAgent.open({ ...options, journal: await openNodeJournal(path) });
  const first = await a.submit('double 21', 'same-request');
  assert.equal((await a.wait(first.id)).status, 'done');
  assert.equal(calls,1);
  assert.match(JSON.stringify(await a.view()), /The result is 42/);
  await a.close();
  a = await PiWasmAgent.open({ ...options, journal:await openNodeJournal(path) });
  assert.equal((await a.submit('double 21','same-request')).id, first.id);
  assert.equal((await a.wait(first.id)).status,'done');
  assert.equal(calls,1);
  assert(events.some(e=>e.type==='events' && e.events.some(x=>x.type==='tool_execution_start')));
  assert.match(JSON.stringify(await a.view()), /pi.usage/);
  await a.close();
});

test('abrupt VM termination resumes a persisted submission and model cancellation reaches host', async t => {
  const path = await setup(t); let started=false, aborted=false;
  const a = await PiWasmAgent.open({journal:await openNodeJournal(path),model:(_req,signal)=>new Promise((_resolve,reject)=>{started=true;signal.addEventListener('abort',()=>{aborted=true;reject(new Error('interrupted'));},{once:true});})});
  const {id}=await a.submit('survive');
  await until(()=>started);
  const waiting = a.wait(id); const rejected = assert.rejects(waiting, /terminated/);
  await a.terminate(); await rejected;
  assert(aborted);
  const restored=await PiWasmAgent.open({journal:await openNodeJournal(path),model:async()=>answer('resumed successfully')});
  assert.equal((await restored.wait(id)).status,'done');
  assert.match(JSON.stringify(await restored.view()),/resumed successfully/);
  await restored.close();
});

test('abort cancels an in-flight model request without terminating WASM', async t => {
  const path=await setup(t);let started=false,aborted=false;
  const a=await PiWasmAgent.open({journal:await openNodeJournal(path),model:(_req,signal)=>new Promise((_resolve,reject)=>{started=true;signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancelled'));},{once:true});})});
  await a.submit('cancel');await until(()=>started);await a.abort();assert(aborted);
  assert.equal((await a.inspect()).tasks.length,0);await a.close();
});

test('configuration, forks, reset, separate conversations and guest module isolation', async t => {
  const path=await setup(t);const a=await PiWasmAgent.open({journal:await openNodeJournal(path),model:async()=>answer('hello')});
  await a.configure({instructions:'Be brief'});
  const {id}=await a.submit('first');const settled=await a.wait(id);
  const {conversationId}=await a.fork(settled.answer);
  assert.match(JSON.stringify(await a.view(conversationId)),/first/);
  await a.reset('new context',conversationId);
  assert.match(JSON.stringify(await a.context(conversationId)),/new context/);
  const created=await a.createConversation({model:{provider:'host',modelId:'host-model'},instructions:'Separate'});
  const second=await a.submit('second','second-request',created);await a.wait(second.id);
  assert(!JSON.stringify(await a.view()).includes('second-request'));
  assert.deepEqual(await a.evaluate('return { process: typeof process, fetch: typeof fetch, wasm: typeof __host };'),{process:'undefined',fetch:'undefined',wasm:'function'});
  await assert.rejects(a.install("require('node:fs')"),/Guest module not available/);
  await a.close();
});

test('exclusive journal ownership and torn final record recovery', async t=>{
  const path=await setup(t);const journal=await openNodeJournal(path);
  await journal.load();await assert.rejects(openNodeJournal(path),/owner/);
  await journal.append({seq:1,writes:[]});await journal.close();
  await appendFile(path,'{"seq":2,"wri');
  const restored=await openNodeJournal(path);assert.equal((await restored.load()).length,1);await restored.append({seq:2,writes:[]});await restored.close();
});

test('CPU limit interrupts guest loops',async t=>{
  const path=await setup(t);const a=await PiWasmAgent.open({journal:await openNodeJournal(path),model:async()=>answer('ok'),cpuSliceMs:100});
  await assert.rejects(a.evaluate('while (true) {}'),/interrupted/);await a.terminate();
});

for (const safe of [false, true]) test(`interrupted ${safe ? 'safe' : 'unsafe'} tools ${safe ? 'resume' : 'do not replay'}`, async t => {
  const path=await setup(t);let started=false,calls=0;
  const model=async({context})=>context.messages.at(-1).role==='toolResult'?answer('finished'):{...answer(''),stopReason:'toolUse',content:[{type:'toolCall',id:'effect',name:'effect',arguments:{}}]};
  const tool={name:'effect',description:'An external effect',parameters:{type:'object',properties:{}},...(safe?{replay:'safe'}:{}),execute:(_args,ctx)=>{calls++;started=true;return new Promise((_resolve,reject)=>ctx.signal.addEventListener('abort',()=>reject(new Error('shutdown')),{once:true}));}};
  let a=await PiWasmAgent.open({journal:await openNodeJournal(path),model,tools:[tool]});
  const {id}=await a.submit('do it');await until(()=>started);await a.terminate();
  a=await PiWasmAgent.open({journal:await openNodeJournal(path),model,tools:[{...tool,execute:()=>{calls++;return 'effect complete';}}]});
  await a.wait(id);assert.equal(calls,safe?2:1);
  if(!safe) assert.match(JSON.stringify(await a.view()),/interrupted and may have partially run/);
  await a.close();
});

test('CommonJS extensions, tool wrappers, prompt sections, document transactions and custom tasks',async t=>{
  const {readFile}=await import('node:fs/promises');const path=await setup(t);
  const source=await readFile(new URL('../examples/extensions/counter.cjs',import.meta.url),'utf8');
  const model=async({context})=>context.messages.at(-1).role==='toolResult'?answer('counter changed'):{...answer(''),stopReason:'toolUse',content:[{type:'toolCall',id:'inc',name:'increment',arguments:{amount:3}}]};
  let a=await PiWasmAgent.open({journal:await openNodeJournal(path),model,extensions:[source]});
  const {id}=await a.submit('increment');await a.wait(id);
  assert.equal((await a.evaluate("return harness.snapshot(pi.defineDoc({kind:'example.counter',version:1,scope:'conversation',history:'rewindable',fork:'asOf',initial:()=>({value:0,applied:{}})}),conversation.id,context);")).value,3);
  assert.match(JSON.stringify(await a.context()),/counter-guide/);
  const taskId=await a.evaluate(`const task = registry.snapshot().task('example.double'); return conversation.commit(tx => tx.createTask(task, {value:21}, {ownership:{kind:'conversation'}}), context);`);
  assert.equal((await a.waitForTask(taskId)).state.outcome.result,42);
  await a.close();
  a=await PiWasmAgent.open({journal:await openNodeJournal(path),model,extensions:[source]});
  assert.equal((await a.evaluate("return harness.snapshot(pi.defineDoc({kind:'example.counter',version:1,scope:'conversation',history:'rewindable',fork:'asOf',initial:()=>({value:0,applied:{}})}),conversation.id,context);")).value,3);await a.close();
});

test('manual compaction records a summary task and keeps usable context',async t=>{
  const path=await setup(t);const a=await PiWasmAgent.open({journal:await openNodeJournal(path),settings:{compaction:{keepRecentTokens:1000,enabled:false}},model:async()=>answer('Summary of previous work. '.repeat(300))});
  for(let i=0;i<4;i++){const {id}=await a.submit(`message ${i} `+'context '.repeat(800));await a.wait(id);}
  const {taskId}=await a.compact('Keep the goal');const receipt=await a.waitForTask(taskId);
  assert.equal(receipt.state.outcome.status,'completed');
  assert((await a.view()).entries.some(e=>e.kind==='pi.compaction'));await a.close();
});

test('SIGKILL process recovery reclaims dead owner and restores submission',async t=>{
  const {fork}=await import('node:child_process');const {once}=await import('node:events');
  const path=await setup(t);const child=fork(new URL('./fixtures/crash-child.mjs',import.meta.url),[path],{stdio:['ignore','ignore','pipe','ipc']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  let id,started;await new Promise((resolve,reject)=>{child.on('error',reject);child.on('message',data=>{id??=data.id;started||=data.started;if(id&&started)resolve();});});
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  const a=await PiWasmAgent.open({journal:await openNodeJournal(path),model:async()=>answer('Recovered after SIGKILL')});
  assert.equal((await a.wait(id)).status,'done');assert.equal((await a.submit('persist across process death','kill-test')).id,id);await a.close();
});

test('streamed model updates reach committed Pi event batches',async t=>{
  const path=await setup(t),events=[];
  const a=await PiWasmAgent.open({journal:await openNodeJournal(path),settings:{progress:{partialIntervalMs:0}},onEvent:e=>{if(e.type==='events')events.push(...e.events);},model:async(_request,_signal,emit)=>{
    const partial={...answer(''),content:[{type:'text',text:''}]};
    emit({type:'start',partial});emit({type:'text_start',contentIndex:0,partial});
    partial.content[0].text='Hello';emit({type:'text_delta',contentIndex:0,delta:'Hello',partial});
    await new Promise(r=>setTimeout(r,40));partial.content[0].text='Hello streamed';emit({type:'text_delta',contentIndex:0,delta:' streamed',partial});await new Promise(r=>setTimeout(r,40));return answer('Hello streamed');
  }});
  await a.wait((await a.submit('stream')).id);assert(events.some(e=>e.type==='message_update'));await a.close();
});

test('follow-up and steering inputs survive the busy inbox',async t=>{
  const path=await setup(t);let release,started=false,count=0;
  const a=await PiWasmAgent.open({journal:await openNodeJournal(path),model:async()=>{count++;if(count===1){started=true;await new Promise(r=>{release=r;});}return answer('turn '+count);}});
  const first=await a.submit('first');await until(()=>started);
  const follow=await a.submit('next','follow',{whenBusy:'followUp'});const steer=await a.submit('adjust','steer',{whenBusy:'steer'});
  await assert.rejects(a.submit('reject','reject',{whenBusy:'reject'}),/busy/i);
  release();await Promise.all([a.wait(first.id),a.wait(follow.id),a.wait(steer.id)]);
  const content=JSON.stringify(await a.view());assert.match(content,/next/);assert.match(content,/adjust/);await a.close();
});

test('guest tool creates and waits for an owned subagent conversation',async t=>{
  const path=await setup(t);
  const source=`const pi=require('@earendil-works/pi-durable'); const {Type}=require('@earendil-works/pi-ai');
  module.exports=pi.defineExtension({name:'delegation',tools:[pi.defineTool({name:'delegate',description:'Delegate to a child',parameters:Type.Object({}),execute:async(args,api,context)=>{
    const child=await api.commit(async tx=>{const c=await tx.createConversation({ownership:{kind:'task',taskId:api.taskId}});await pi.configure(tx,c.id,{model:{provider:'host',modelId:'host-model'},tools:[],instructions:'Child agent'});return c.id;},context);
    const conversation=await api.conversation(child,context);const submission=await conversation.submit({type:'input',content:'child request'},context);await submission.wait(context);
    return {content:[{type:'text',text:'Child finished'}],details:{child}};
  }})]});`;
  const a=await PiWasmAgent.open({journal:await openNodeJournal(path),extensions:[source],model:async({context})=>{
    if(context.messages.some(m=>m.role==='user'&&m.content==='child request'))return answer('child answer');
    return context.messages.at(-1).role==='toolResult'?answer('parent answer'):{...answer(''),stopReason:'toolUse',content:[{type:'toolCall',id:'delegate-call',name:'delegate',arguments:{}}]};
  }});
  await a.wait((await a.submit('delegate')).id);
  const tool=(await a.view()).entries.find(e=>e.kind==='pi.tool-result');assert.equal(tool.model[0].isError,false);
  const child=tool.model[0].details.child;assert.match(JSON.stringify(await a.view(child)),/child answer/);
  const graph=JSON.stringify(await a.taskGraph());assert(graph.length>2);await a.close();
});
