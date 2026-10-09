import { hasNativeHost, nativeCall } from './native.js';
import type { AgentView } from '../../src/types.js';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const savedConnection = JSON.parse(localStorage.getItem('pi-wasm-kit:connection') ?? '{}');
$<HTMLInputElement>('endpoint').value = savedConnection.endpoint ?? '';
$<HTMLInputElement>('model').value = savedConnection.model ?? '';
let worker: Worker | undefined;
let nextId = 1;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
const status = (text: string) => { $('status').textContent = text; };
const error = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  $('error').textContent = message;
  if (hasNativeHost) void nativeCall('state', { status: `Error: ${message}`, summary: '', proof: '', busy: true }).catch(console.error);
};
function call(method: string, args = {}) {
  if (!worker) return Promise.reject(new Error('Runtime is interrupted'));
  const id = nextId++;
  return new Promise<any>((resolve, reject) => { pending.set(id, { resolve, reject }); worker!.postMessage({ id, method, ...args }); });
}
function render(view: AgentView) {
  const messages = $('messages'); messages.replaceChildren();
  for (const entry of view.entries) for (const message of entry.model ?? []) {
    if (message.role === 'system') continue;
    const item = document.createElement('div'); item.className = `message ${message.role}`;
    const label = document.createElement('span'); label.className = 'role'; label.textContent = message.role === 'toolResult' ? 'Tool result · saved' : message.role;
    const content = typeof message.content === 'string' ? message.content : message.content.map(block => block.type === 'text' ? block.text : block.type === 'toolCall' ? `Calling ${block.name}(${JSON.stringify(block.arguments)})` : `[${block.type}]`).join('\n');
    item.append(label, document.createTextNode(content)); messages.append(item);
  }
  if (!messages.childNodes.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Give the agent a task. Then interrupt it and reopen the runtime.'; messages.append(empty); }
  messages.scrollTop = messages.scrollHeight;
  $('state').textContent = JSON.stringify(view, null, 2);
}
async function refresh() {
  if (!worker) return;
  try {
    const view: AgentView = await call('view');
    render(view);
    const state = await call('inspect');
    const current = state.tasks.length ? 'Running · progress saved' : 'Ready · progress saved';
    status(current);
    if (hasNativeHost) {
      const messages = view.entries.flatMap(entry => entry.model ?? []);
      const text = (message: any) => typeof message?.content === 'string' ? message.content : (message?.content ?? []).filter((block: any) => block.type === 'text').map((block: any) => block.text).join('');
      await nativeCall('state', { status: current, summary: `${text([...messages].reverse().find(message => message.role === 'assistant'))} · replies: ${messages.filter(message => message.role === 'assistant' && text(message)).length}`, proof: text([...messages].reverse().find(message => message.role === 'toolResult')), busy: state.tasks.length > 0 });
    }
  } catch (e) { if (worker) error(e); }
}
async function open() {
  $('error').textContent = ''; status('Starting runtime…');
  $('reopen') .setAttribute('disabled', '');
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onerror = e => { error(e.message); interrupt(); };
  const owner = worker;
  worker.onmessage = ({ data }) => {
    if (data.nativeRequest) {
      const { id, args } = data.nativeRequest;
      void nativeCall('multiply', args).then(result => owner.postMessage({ nativeReply: { id, result } }), error => owner.postMessage({ nativeReply: { id, error: String(error) } }));
    } else if (data.event) {
      if (data.event.type === 'commit') $('seq').textContent = String(data.event.seq);
      if (data.event.type === 'error') error(data.event.message);
      if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = undefined; void refresh(); }, 100);
    } else if (data.admitted) status(`Running · submission ${data.admitted} saved`);
    else { const item = pending.get(data.id); pending.delete(data.id); if (data.error) item?.reject(new Error(data.error)); else item?.resolve(data.value); }
  };
  try {
    const endpoint = $<HTMLInputElement>('endpoint').value.trim(), model = $<HTMLInputElement>('model').value.trim();
    if (!!endpoint !== !!model) throw new Error('Enter both endpoint and model, or leave both empty for the local demo.');
    localStorage.setItem('pi-wasm-kit:connection', JSON.stringify({ endpoint, model }));
    const configuration = hasNativeHost ? await nativeCall('configuration') : {};
    const info = await call('open', { endpoint, model, nativeTools: hasNativeHost, cancelOnOpen: !!configuration.cancelOnOpen });
    if (configuration.cancelOnOpen) await nativeCall('cancelAcknowledged');
    $('conversation').textContent = String(info.conversationId);
    $('mode').textContent = endpoint ? 'CONNECTED MODEL' : hasNativeHost ? 'DEMO MODEL · NATIVE TOOL' : 'LOCAL DEMO MODEL';
    for (const id of ['send', 'interrupt', 'cancel']) $(id).removeAttribute('disabled');
    await refresh();
  } catch (e) { error(e); interrupt(); }
}
function interrupt() {
  worker?.terminate(); worker = undefined;
  for (const item of pending.values()) item.reject(new Error('Runtime interrupted; reopen to resume.'));
  pending.clear(); clearTimeout(refreshTimer); refreshTimer = undefined;
  status('Interrupted · journal retained');
  for (const id of ['send', 'interrupt', 'cancel']) $(id).setAttribute('disabled', '');
  $('reopen').removeAttribute('disabled');
}
$('prompt-form').onsubmit = async event => { event.preventDefault(); $('error').textContent = ''; try { status('Running…'); const settled = await call('submit', { text: $<HTMLInputElement>('prompt').value }); if (hasNativeHost) await nativeCall('completed', { success: settled.status === 'done' }); await refresh(); } catch (e) { if (worker) error(e); if (hasNativeHost) void nativeCall('completed', { success: false }).catch(error); } };
$('interrupt').onclick = interrupt;
$('reopen').onclick = () => void open();
$('cancel').onclick = () => { void call('abort').then(refresh).catch(error); };
void open();
