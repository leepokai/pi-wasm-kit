import { PiWasmAgent } from '../../src/index.js';
import { openBrowserJournal } from '../../src/storage/browser.js';
import { openAICompatible } from '../../src/providers/openai.js';
import type { ModelHandler } from '../../src/types.js';
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const demo: ModelHandler = async ({ context }, signal) => {
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('Cancelled')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  const done = context.messages.at(-1)?.role === 'toolResult';
  return { role: 'assistant', api: 'host', provider: 'host', model: 'local-demo', content: done ? [{ type: 'text', text: '21 × 2 = 42. The tool result and this answer are saved. You can refresh the page and continue.' }] : [{ type: 'toolCall', id: crypto.randomUUID(), name: 'multiply', arguments: { a: 21, b: 2 } }], stopReason: done ? 'stop' : 'toolUse', usage, timestamp: Date.now() };
};
async function journal() {
  const store = await openBrowserJournal('playground-v1');
  return { ...store, async load() { const commits = await store.load(); self.postMessage({ event: { type: 'commit', seq: commits.at(-1)?.seq ?? 0 } }); return commits; } };
}
let nativeId = 1;
const nativePending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
async function nativeMultiply(args: unknown, signal: AbortSignal) {
  signal.throwIfAborted();
  const id = nativeId++;
  let cancel!: () => void;
  try {
    return await new Promise<any>((resolve, reject) => {
      cancel = () => reject(new Error('Native tool cancelled'));
      nativePending.set(id, { resolve, reject });
      signal.addEventListener('abort', cancel, { once: true });
      self.postMessage({ nativeRequest: { id, args } });
    });
  } finally { signal.removeEventListener('abort', cancel); nativePending.delete(id); }
}
let agent: PiWasmAgent | undefined;
self.onmessage = async ({ data }) => {
  if (data.nativeReply) {
    const reply = data.nativeReply, waiter = nativePending.get(reply.id);
    if (reply.error) waiter?.reject(new Error(reply.error)); else waiter?.resolve(reply.result);
    return;
  }
  try {
    let value: unknown;
    if (data.method === 'open') {
      agent = await PiWasmAgent.open({ // Allow trusted guest startup on slower WebViews; Worker termination remains immediate.
        journal: await journal(), cpuSliceMs: 10_000, autoResume: !data.cancelOnOpen, model: data.endpoint ? openAICompatible({ baseURL: data.endpoint, model: data.model }) : demo, tools: [{ name: 'multiply', description: 'Multiply two numbers', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] }, replay: 'safe', execute: async ({ a, b }, ctx) => { ctx.output('Multiplying…'); if (data.nativeTools) { const result = await nativeMultiply({ a, b }, ctx.signal); return `${result.value} (${result.platform} native tool)`; } return String(Number(a) * Number(b)); } }], onEvent: event => self.postMessage({ event }) });
      if (data.cancelOnOpen) { await agent.abort(undefined, true); await agent.resume(); }
      value = { conversationId: agent.conversationId };
    } else {
      if (!agent) throw new Error('Runtime is not open');
      if (data.method === 'submit') { const submission = await agent.submit(data.text); self.postMessage({ admitted: submission.id }); value = await agent.wait(submission.id); }
      else if (data.method === 'view') value = await agent.view();
      else if (data.method === 'inspect') value = await agent.inspect();
      else if (data.method === 'abort') value = await agent.abort();
      else throw new Error('Unknown command');
    }
    self.postMessage({ id: data.id, value });
  } catch (error) { self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) }); }
};
