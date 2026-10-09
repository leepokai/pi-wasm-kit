import { Engine } from './engine.js';
import type { AgentOptions, AgentView, SubmissionResult, AgentConfiguration } from './types.js';
export type * from './types.js';
import type { SubmissionDraft, UserInput, ContextView, HarnessInspection, TaskGraph } from '@earendil-works/pi-durable';

export class PiWasmAgent {
  private constructor(private engine: Engine, private options: AgentOptions, readonly conversationId: number) {}
  static async open(options: AgentOptions) {
    let engine: Engine | undefined;
    try {
      const names = new Set<string>();
      for (const tool of options.tools ?? []) {
        if (names.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
        names.add(tool.name);
      }
      const emit = (event: any) => { try { options.onEvent?.(event); } catch { /* Observers cannot affect commits. */ } };
      engine = await Engine.create(async (method, data, signal, update) => {
        if (signal.aborted) throw new Error('Runtime terminated');
        switch (method) {
          case 'load': return options.journal.load();
          case 'append': await options.journal.append(data); emit({ type: 'commit', seq: data.seq }); return null;
          case 'model': return options.model(data, signal, update);
          case 'tool': {
            const tool = options.tools?.find(tool => tool.name === data.name);
            if (!tool) throw new Error(`Tool not granted: ${data.name}`);
            return tool.execute(data.args, { taskId: data.taskId, conversationId: data.conversationId, callId: data.callId, signal, output: text => update({ type: 'output', text }) });
          }
          default: throw new Error(`Capability not granted: ${method}`);
        }
      }, emit, options.cpuSliceMs, options.memoryLimitBytes);
      const opened = await engine.call<{ conversationId: number }>('open', { tools: (options.tools ?? []).map(({ execute, ...definition }) => definition), instructions: options.instructions, modelId: options.modelId, contextWindow: options.contextWindow, extensions: options.extensions, settings: options.settings, events: !!options.onEvent, autoResume: options.autoResume });
      return new PiWasmAgent(engine, options, opened.conversationId);
    } catch (error) { await engine?.dispose(); await options.journal.close(); throw error; }
  }
  /** Start scheduling after opening with autoResume: false. */
  resume() { return this.engine.call<void>('resume', {}); }
  submit(content: UserInput, requestId = crypto.randomUUID(), options: { conversationId?: number; whenBusy?: 'steer' | 'followUp' | 'reject' } = {}) {
    return this.submitDraft({ type: 'input', content, requestId, whenBusy: options.whenBusy }, options.conversationId);
  }
  submitDraft(submission: SubmissionDraft, conversationId?: number) { return this.engine.call<{ id: number }>('submit', { submission, conversationId }); }
  wait(id: number) { return this.engine.call<SubmissionResult>('wait', { id }); }
  view(conversationId?: number) { return this.engine.call<AgentView>('view', { conversationId }); }
  context(conversationId?: number, at?: number) { return this.engine.call<ContextView>('context', { conversationId, at }); }
  configure(change: AgentConfiguration, conversationId?: number) { return this.engine.call<void>('configure', { change, conversationId }); }
  createConversation(agent?: Omit<AgentConfiguration, 'extensions' | 'tools'>) { return this.engine.call<{ conversationId: number }>('createConversation', { agent }); }
  fork(at: number, conversationId?: number) { return this.engine.call<{ conversationId: number }>('fork', { at, conversationId }); }
  reset(handoff?: string, conversationId?: number) { return this.engine.call<void>('reset', { handoff, conversationId }); }
  compact(instructions?: string, conversationId?: number) { return this.engine.call<{ taskId: number }>('compact', { instructions, conversationId }); }
  waitForTask(id: number) { return this.engine.call<any>('waitForTask', { id }); }
  inspect() { return this.engine.call<HarnessInspection>('inspect'); }
  taskGraph() { return this.engine.call<TaskGraph>('taskGraph'); }
  abort(conversationId?: number, background = false) { return this.engine.call<void>('abort', { conversationId, background }); }
  abortSubmission(id: number) { return this.engine.call<string>('abortSubmission', { id }); }
  watch(conversationId?: number) { return this.engine.call<void>('watch', { conversationId }); }
  install(source: string) { return this.engine.call<string>('install', { source }); }
  uninstall(name: string) { return this.engine.call<void>('uninstall', { name }); }
  /** Trusted application code inside WASM. Arguments/results must be JSON serializable. */
  evaluate<T = unknown>(source: string, args: unknown = null, conversationId?: number) { return this.engine.call<T>('evaluate', { source, args, conversationId }); }
  async close() { try { await this.engine.call('close'); } finally { await this.terminate(); } }
  /** Abrupt shutdown: unfinished work stays persisted and resumes on next open. */
  async terminate() { await this.engine.dispose(); await this.options.journal.close(); }
}
