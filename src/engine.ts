import { newQuickJSWASMModuleFromVariant, type QuickJSSyncVariant, type QuickJSContext, type QuickJSRuntime, type QuickJSDeferredPromise, type QuickJSHandle } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
// The upstream variant uses a CJS declaration file for its ESM default export.
let modulePromise: ReturnType<typeof newQuickJSWASMModuleFromVariant> | undefined;
const getQuickJS = () => modulePromise ??= newQuickJSWASMModuleFromVariant(variant as unknown as QuickJSSyncVariant);
import source from './guest-source.js';

type Handler = (method: string, data: any, signal: AbortSignal, update: (value: unknown) => void) => Promise<unknown>;
/** JSON-only boundary. No host objects or ambient filesystem/network enter the VM. */
export class Engine {
  private vm: QuickJSContext;
  private runtime: QuickJSRuntime;
  private stopped = false;
  private queued = false;
  private pumps = 0;
  private deadline = Infinity;
  private timers = new Map<number, { timer: ReturnType<typeof setTimeout>; callback: QuickJSHandle }>();
  private nextTimer = 1;
  private pending = new Set<QuickJSDeferredPromise>();
  private controller = new AbortController();
  private activeCalls = new Set<Promise<void>>();
  private disposal?: Promise<void>;
  private effects = new Map<number, { controller: AbortController; callback?: QuickJSHandle }>();
  private constructor(module: Awaited<ReturnType<typeof getQuickJS>>, private handler: Handler, private emit: (event: any) => void, private cpuMs: number, memory: number) {
    this.runtime = module.newRuntime();
    this.runtime.setMemoryLimit(memory);
    this.runtime.setMaxStackSize(1024 * 1024);
    this.runtime.setInterruptHandler(() => this.stopped || performance.now() > this.deadline);
    this.vm = this.runtime.newContext();
    try {
      this.install();
      this.run(() => this.vm.unwrapResult(this.vm.evalCode(source, 'pi-durable.guest.js')).dispose());
    } catch (error) { this.vm.dispose(); this.runtime.dispose(); throw new Error(error instanceof Error ? error.message : String(error)); }
  }
  static async create(handler: Handler, emit: (event: any) => void, cpuMs = 1000, memory = 64 * 1024 * 1024) {
    return new Engine(await getQuickJS(), handler, emit, cpuMs, memory);
  }
  private run<T>(fn: () => T): T {
    this.deadline = performance.now() + this.cpuMs;
    try { return fn(); } finally { this.deadline = Infinity; }
  }
  private expose(name: string, fn: (...args: QuickJSHandle[]) => QuickJSHandle | void) {
    const handle = this.vm.newFunction(name, fn);
    this.vm.setProp(this.vm.global, name, handle);
    handle.dispose();
  }
  private install() {
    this.expose('__cancel', id => { this.effects.get(this.vm.getNumber(id!))?.controller.abort(); });
    this.expose('__host', (method, raw, callback, requestId) => {
      const name = this.vm.getString(method!);
      const data = JSON.parse(this.vm.getString(raw!));
      const promise = this.vm.newPromise();
      this.pending.add(promise);
      const id = requestId ? this.vm.getNumber(requestId) : 0;
      const effect = { controller: new AbortController(), callback: callback && this.vm.typeof(callback) === 'function' ? callback.dup() : undefined };
      if (id) this.effects.set(id, effect);
      const signal = AbortSignal.any([this.controller.signal, effect.controller.signal]);
      const update = (value: unknown) => {
        if (this.stopped || signal.aborted || !effect.callback?.alive) return;
        const raw = this.vm.newString(JSON.stringify(value));
        try { this.run(() => this.vm.unwrapResult(this.vm.callFunction(effect.callback!, this.vm.undefined, raw)).dispose()); }
        finally { raw.dispose(); this.pump(); }
      };
      const finish = (value: unknown, failed: boolean) => {
        if (effect.callback?.alive) effect.callback.dispose();
        if (id) this.effects.delete(id);
        this.settle(promise, value, failed);
      };
      void Promise.resolve().then(() => this.handler(name, data, signal, update)).then(
        value => finish(value, false),
        error => finish(error instanceof Error ? error.message : String(error), true),
      );
      return promise.handle;
    });
    this.expose('__emit', raw => { this.emit(JSON.parse(this.vm.getString(raw!))); });
    this.expose('__hostSync', (name, arg) => {
      const method = this.vm.getString(name!); const value = this.vm.getString(arg!);
      switch (method) {
        case 'url': { const [input, base] = JSON.parse(value); const url = new URL(input, base ?? undefined); return this.vm.newString(JSON.stringify({ href: url.href, origin: url.origin, protocol: url.protocol, username: url.username, password: url.password, host: url.host, hostname: url.hostname, port: url.port, pathname: url.pathname, search: url.search, hash: url.hash })); }
        case 'now': return this.vm.newString(String(performance.now()));
        case 'uuid': return this.vm.newString(JSON.stringify(crypto.randomUUID()));
        case 'random': return this.vm.newString(JSON.stringify(Array.from(crypto.getRandomValues(new Uint8Array(Number(value))))));
        case 'encode': return this.vm.newString(JSON.stringify(Array.from(new TextEncoder().encode(value))));
        case 'decode': return this.vm.newString(JSON.stringify(new TextDecoder().decode(Uint8Array.from(JSON.parse(value)))));
        default: throw new Error('Unknown synchronous capability');
      }
    });
    this.expose('__timer', (fn, delay) => {
      const id = this.nextTimer++;
      const callback = fn!.dup();
      const timer = setTimeout(() => {
        this.timers.delete(id);
        if (this.stopped) return;
        try { this.run(() => this.vm.unwrapResult(this.vm.callFunction(callback, this.vm.undefined)).dispose()); }
        catch (error) { this.emit({ type: 'error', message: String(error) }); }
        finally { callback.dispose(); this.pump(); }
      }, Math.min(Math.max(0, this.vm.getNumber(delay!)), 2147483647));
      this.timers.set(id, { timer, callback });
      return this.vm.newNumber(id);
    });
    this.expose('__clearTimer', id => {
      const key = this.vm.getNumber(id!); const item = this.timers.get(key);
      if (item) { clearTimeout(item.timer); item.callback.dispose(); this.timers.delete(key); }
    });
  }
  private settle(promise: QuickJSDeferredPromise, value: unknown, failed: boolean) {
    if (this.stopped) return;
    const handle = failed ? this.vm.newError(String(value)) : this.vm.newString(JSON.stringify(value ?? null));
    try { this.run(() => failed ? promise.reject(handle) : promise.resolve(handle)); }
    finally { handle.dispose(); promise.dispose(); this.pending.delete(promise); }
    this.pump();
  }
  private pump() {
    if (this.queued || this.stopped) return;
    this.queued = true;
    const schedule = ++this.pumps % 16 === 0 ? (fn: () => void) => setTimeout(fn, 0) : queueMicrotask;
    schedule(() => {
      this.queued = false;
      if (this.stopped) return;
      const result = this.run(() => this.runtime.executePendingJobs(100));
      if (result.error) {
        const message = JSON.stringify(this.vm.dump(result.error)); result.error.dispose();
        this.emit({ type: 'error', message });
      }
      if (this.runtime.hasPendingJob()) this.pump();
    });
  }
  async call<T>(method: string, data: unknown = {}): Promise<T> {
    if (this.stopped) throw new Error('WASM runtime is closed');
    const fn = this.vm.getProp(this.vm.global, '__dispatch');
    const name = this.vm.newString(method); const raw = this.vm.newString(JSON.stringify(data));
    let promise: QuickJSHandle;
    try { promise = this.run(() => this.vm.unwrapResult(this.vm.callFunction(fn, this.vm.undefined, name, raw))); }
    finally { fn.dispose(); name.dispose(); raw.dispose(); }
    let release!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    this.activeCalls.add(released);
    const signal = this.controller.signal;
    let onAbort!: () => void;
    try {
      const stopped = new Promise<never>((_, reject) => { onAbort = () => reject(new Error('WASM runtime was terminated')); signal.addEventListener('abort', onAbort, { once: true }); });
      const resolved = this.vm.resolvePromise(promise).then(result => {
        if (this.stopped) {
          if (result.error) result.error.dispose(); else result.value.dispose();
          throw new Error('WASM runtime was terminated');
        }
        const value = this.vm.unwrapResult(result);
        try { return JSON.parse(this.vm.getString(value)) as T; } finally { value.dispose(); }
      });
      this.pump();
      return await Promise.race([resolved, stopped]);
    } finally {
      signal.removeEventListener('abort', onAbort);
      promise.dispose();
      this.activeCalls.delete(released);
      release();
    }
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.stopped = true;
    this.controller.abort();
    for (const effect of this.effects.values()) if (effect.callback?.alive) effect.callback.dispose();
    this.effects.clear();
    for (const { timer, callback } of this.timers.values()) { clearTimeout(timer); callback.dispose(); }
    this.timers.clear();
    for (const promise of this.pending) promise.dispose();
    this.pending.clear();
    // Rejected call() waiters must release their handles before freeing the context.
    this.disposal = Promise.all([...this.activeCalls]).then(() => { this.vm.dispose(); this.runtime.dispose(); });
    return this.disposal;
  }
}
