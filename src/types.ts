import type { AssistantMessage, AssistantMessageEvent, Model, TranscriptContext } from '@earendil-works/pi-ai';
import type { StorageWrite, ConversationView, SettledSubmissionRecord, AgentEvent as PiEvent, AgentState, ToolExecutionResult, HarnessSettings } from '@earendil-works/pi-durable';

export interface JournalCommit { seq: number; writes: readonly StorageWrite[] }
/** One exclusive owner. append resolves only after an atomic durable commit. */
export interface Journal {
  load(): Promise<JournalCommit[]>;
  append(commit: JournalCommit): Promise<void>;
  close(): Promise<void>;
}
export interface ModelRequest { model: Model<any>; context: TranscriptContext; options?: Record<string, unknown> }
export type ModelHandler = (request: ModelRequest, signal: AbortSignal, emit: (event: AssistantMessageEvent) => void) => Promise<AssistantMessage>;
export interface ToolContext { taskId: number; conversationId: number; signal: AbortSignal; callId: string; output(text: string): void }
export interface HostTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Set only when retrying after interruption is safe. */
  replay?: 'safe';
  execute(args: Record<string, unknown>, context: ToolContext): Promise<string | ToolExecutionResult> | string | ToolExecutionResult;
}
export interface AgentOptions {
  journal: Journal;
  model: ModelHandler;
  tools?: HostTool[];
  /** CommonJS sources exporting Pi extensions. Reinstall the same definitions on recovery. */
  extensions?: string[];
  settings?: Omit<HarnessSettings, 'extensions'>;
  instructions?: string;
  modelId?: string;
  contextWindow?: number;
  memoryLimitBytes?: number;
  cpuSliceMs?: number;
  onEvent?: (event: AgentEvent) => void;
}
export type AgentEvent = { type: 'commit'; seq: number } | { type: 'error'; message: string } | { type: 'events'; conversationId: number; events: readonly PiEvent[] };
export type AgentView = ConversationView;
export type SubmissionResult = SettledSubmissionRecord;

export type AgentConfiguration = Partial<Pick<AgentState, 'model' | 'thinkingLevel' | 'instructions' | 'cwd'>> & { extensions?: string[]; tools?: string[] };
