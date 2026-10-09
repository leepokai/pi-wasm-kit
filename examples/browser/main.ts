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
const error = (reason: unknown) => { $('error').textContent = reason instanceof Error ? reason.message : String(reason); };
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
    render(await call('view'));
    const state = await call('inspect');
    status(state.tasks.length ? 'Running · progress saved' : 'Ready · progress saved');
  } catch (e) { if (worker) error(e); }
}
async function open() {
  $('error').textContent = ''; status('Starting runtime…');
  $('reopen') .setAttribute('disabled', '');
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onerror = e => { error(e.message); interrupt(); };
  worker.onmessage = ({ data }) => {
    if (data.event) {
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
    const info = await call('open', { endpoint, model });
    $('conversation').textContent = String(info.conversationId);
    $('mode').textContent = endpoint ? 'CONNECTED MODEL' : 'LOCAL DEMO MODEL';
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
$('prompt-form').onsubmit = async event => { event.preventDefault(); $('error').textContent = ''; try { status('Running…'); await call('submit', { text: $<HTMLInputElement>('prompt').value }); await refresh(); } catch (e) { if (worker) error(e); } };
$('interrupt').onclick = interrupt;
$('reopen').onclick = () => void open();
$('cancel').onclick = () => { void call('abort').then(refresh).catch(error); };
void open();
