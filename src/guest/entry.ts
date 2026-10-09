import './platform.js';
import * as contexts from '@earendil-works/chord/context';
import * as pi from '@earendil-works/pi-durable';
import { Type } from '@earendil-works/pi-ai';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import type { AssistantMessage, Model, TranscriptContext } from '@earendil-works/pi-ai';
import { JournalStorage } from './journal.js';
import { hostCall } from './bridge.js';
declare const __emit: (value: string) => void;
const context = contexts.BACKGROUND_CONTEXT;
let harness: pi.Harness;
let root: pi.Conversation;
const registry = pi.createRegistry();
const watches = new Map<number, pi.AgentEventStream>();
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
function stream(model: Model<any>, transcript: TranscriptContext, options?: { signal?: AbortSignal }) {
  const events = createAssistantMessageEventStream();
  void hostCall('model', { model, context: transcript, options: { ...options, signal: undefined } }, options?.signal, event => events.push(event)).then(message => {
    if (message.stopReason === 'error' || message.stopReason === 'aborted') events.push({ type: 'error', reason: message.stopReason, error: message });
    else events.push({ type: 'done', reason: message.stopReason, message });
    events.end(message);
  }, error => {
    const message: AssistantMessage = { role: 'assistant', api: 'host', provider: 'host', model: model.id, content: [], usage, stopReason: options?.signal?.aborted ? 'aborted' : 'error', errorMessage: String(error), timestamp: Date.now() };
    events.push({ type: 'error', reason: message.stopReason as 'error' | 'aborted', error: message });
    events.end(message);
  });
  return events;
}
function install(source: string) {
  const module = { exports: {} as any };
  const require = (name: string) => {
    if (name === '@earendil-works/pi-durable') return pi;
    if (name === '@earendil-works/pi-ai') return { Type };
    if (name === '@earendil-works/chord/context') return contexts;
    throw new Error(`Guest module not available: ${name}`);
  };
  new Function('module', 'exports', 'require', source)(module, module.exports, require);
  const extension = module.exports.default ?? module.exports;
  registry.install(extension);
  return extension.name;
}
async function conversation(args: any) {
  if (args.conversationId === undefined) return root;
  const found = await harness.conversation(args.conversationId, context);
  if (!found) throw new Error('Conversation not found');
  return found;
}
async function watch(id: any) {
  if (watches.has(id)) return;
  const stream = await pi.watchEvents(harness, id, context);
  watches.set(id, stream);
  const emit = (events: readonly pi.AgentEvent[]) => __emit(JSON.stringify({ type: 'events', conversationId: id, events }));
  emit([stream.snapshot]);
  stream.start(async events => { emit(events); });
}
async function open(config: any) {
  const models = createModels();
  models.setProvider(createProvider({ id: 'host', auth: { apiKey: { name: 'Host', resolve: async () => ({ auth: {} }) } }, models: [{ id: config.modelId ?? 'host-model', name: 'Host model', provider: 'host', baseUrl: 'host://model', api: 'host', reasoning: true, input: ['text', 'image'], cost: usage.cost, contextWindow: config.contextWindow ?? 32768, maxTokens: 4096 }], api: { stream, streamSimple: stream } }));
  registry.install(pi.defineExtension({ name: 'host-tools', tools: config.tools.map((tool: any) => pi.defineTool({ ...tool, execute: async (args: unknown, api: any, ctx: any) => {
    const result = await hostCall('tool', { name: tool.name, args, taskId: api.taskId, conversationId: api.conversationId, callId: api.callId }, ctx.abortSignal, update => { if (update.type === 'output') api.output(update.text); });
    return typeof result === 'string' ? { content: [{ type: 'text', text: result }] } : result;
  } })) }));
  for (const source of config.extensions ?? []) install(source);
  harness = await pi.Harness.open(await JournalStorage.open(), { models, registry, settings: config.settings, onReport: error => __emit(JSON.stringify({ type: 'error', message: String(error) })) }, context);
  root = await harness.root(context, { agent: { model: { provider: 'host', modelId: config.modelId ?? 'host-model' }, instructions: config.instructions ?? 'You are a helpful assistant.' } });
  if (config.events) await watch(root.id);
  if (config.autoResume !== false) harness.resume();
  return { conversationId: root.id };
}
const api: Record<string, (args: any) => Promise<unknown>> = {
  open,
  resume: async () => { harness.resume(); return null; },
  submit: async args => ({ id: (await (await conversation(args)).submit(args.submission, context)).id }),
  wait: async args => { const submission = await harness.submission(args.id, context); if (!submission) throw new Error('Submission not found'); return submission.wait(context); },
  view: async args => { const state = await (await conversation(args)).viewState(context); try { return state.value; } finally { state.dispose(); } },
  context: async args => (await conversation(args)).context(context, args.at === undefined ? {} : { at: args.at }),
  configure: async args => { const change = { ...args.change }; const snapshot = registry.snapshot();
    if (change.extensions) change.extensions = change.extensions.map((name: string) => { const ext = snapshot.extension(name); if (!ext) throw new Error(`Unknown extension: ${name}`); return ext; });
    if (change.tools) change.tools = change.tools.map((name: string) => { const tool = snapshot.tools().find(t => t.tool.name === name)?.tool; if (!tool) throw new Error(`Unknown tool: ${name}`); return tool; });
    await (await conversation(args)).configure(change, context); return null; },
  createConversation: async args => ({ conversationId: (await harness.createConversation({ ownership: { kind: 'ownerless' }, agent: args.agent }, context)).id }),
  fork: async args => ({ conversationId: (await (await conversation(args)).fork(args.at, { ownership: { kind: 'ownerless' } }, context)).id }),
  reset: async args => { await (await conversation(args)).reset(args.handoff, context); return null; },
  compact: async args => ({ taskId: await (await conversation(args)).compact(args.instructions, context) }),
  waitForTask: async args => harness.waitForTask(args.id, context),
  inspect: async () => harness.inspect(context),
  taskGraph: async () => { const state = await harness.taskGraph(context); try { return state.value; } finally { state.dispose(); } },
  abort: async args => { await (await conversation(args)).abort(context, { background: args.background }); return null; },
  abortSubmission: async args => harness.abortSubmission(args.id, context),
  watch: async args => { await watch((await conversation(args)).id); return null; },
  install: async args => install(args.source),
  uninstall: async args => { registry.uninstall({ name: args.name }); return null; },
  evaluate: async args => {
    const fn = new Function('pi', 'Type', 'harness', 'conversation', 'registry', 'context', 'args', `return (async () => { ${args.source}\n })()`);
    return fn(pi, Type, harness, await conversation(args), registry, context, args.args);
  },
  close: async () => { for (const stream of watches.values()) await stream.stop(); watches.clear(); await harness.close(context); return null; },
};
(globalThis as any).__dispatch = async (method: string, raw: string) => {
  if (!Object.hasOwn(api, method)) throw new Error('Unknown guest method');
  return JSON.stringify((await api[method]!(JSON.parse(raw))) ?? null);
};
