import { AbortController, AbortSignal } from 'abort-controller/dist/abort-controller.mjs';
declare const __hostSync: (name: string, value: string) => string;
declare const __timer: (callback: () => void, ms: number) => number;
declare const __clearTimer: (id: number) => void;
const abort = AbortController.prototype.abort;
AbortController.prototype.abort = function(reason?: unknown) {
  if (this.signal.aborted) return;
  Object.defineProperty(this.signal, 'reason', { value: reason ?? new Error('Operation aborted') });
  abort.call(this);
};
(AbortSignal.prototype as any).throwIfAborted = function() { if (this.aborted) throw this.reason; };
(AbortSignal as any).any = (signals: any[]) => {
  const controller = new AbortController();
  const handlers = new Map<any, () => void>();
  const stop = (signal: any) => {
    (controller.abort as any)(signal.reason);
    for (const [source, handler] of handlers) source.removeEventListener('abort', handler);
  };
  for (const signal of signals) {
    if (signal.aborted) { stop(signal); break; }
    const handler = () => stop(signal); handlers.set(signal, handler);
    signal.addEventListener('abort', handler, { once: true });
  }
  return controller.signal;
};
Object.assign(globalThis, {
  AbortController, AbortSignal,
  URL: class {
    href!: string;
    constructor(input: string, base?: string) { Object.assign(this, JSON.parse(__hostSync('url', JSON.stringify([String(input), base])))); }
    toString() { return this.href; }
    toJSON() { return this.href; }
    static canParse(input: string, base?: string) { try { __hostSync('url', JSON.stringify([input, base])); return true; } catch { return false; } }
  },
  setTimeout: (fn: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) => __timer(() => fn(...args), ms),
  clearTimeout: __clearTimer,
  performance: { now: () => Number(__hostSync('now', '')) },
  queueMicrotask: (fn: () => void) => Promise.resolve().then(fn),
  structuredClone: (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value)),
  crypto: {
    randomUUID: () => JSON.parse(__hostSync('uuid', '')),
    getRandomValues: (array: Uint8Array) => { array.set(JSON.parse(__hostSync('random', String(array.length)))); return array; },
  },
  TextEncoder: class {
    encode(text = '') { return Uint8Array.from(JSON.parse(__hostSync('encode', text))); }
  },
  TextDecoder: class {
    decode(bytes: Uint8Array = new Uint8Array()) { return JSON.parse(__hostSync('decode', JSON.stringify(Array.from(bytes)))); }
  },
  console: { log() {}, warn() {}, error() {}, assert() {} },
  DOMException: class extends Error { constructor(message: string, name = "Error") { super(message); this.name = name; } },
});
