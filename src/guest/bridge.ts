declare const __host: (name: string, value: string, update?: (value: string) => void, id?: number) => Promise<string>;
declare const __cancel: (id: number) => void;
let nextId = 1;
export async function hostCall(name: string, value: unknown, signal?: AbortSignal, update?: (value: any) => void) {
  signal?.throwIfAborted();
  const id = nextId++;
  const abort = () => __cancel(id);
  const pending = __host(name, JSON.stringify(value), raw => update?.(JSON.parse(raw)), id);
  signal?.addEventListener('abort', abort, { once: true });
  try { return JSON.parse(await pending); }
  finally { signal?.removeEventListener('abort', abort); }
}
