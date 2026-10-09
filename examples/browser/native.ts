/** Demo-only capability bridge. Native hosts must also enforce origin and input checks. */
type NativeWindow = Window & {
  webkit?: { messageHandlers?: { piNative?: { postMessage(value: unknown): Promise<unknown> } } };
  piNative?: { postMessage(value: string): void; onmessage?: (event: { data: string }) => void };
};
const host = window as NativeWindow;
export const hasNativeHost = !!(host.webkit?.messageHandlers?.piNative || host.piNative);
let nextId = 1;
const pending = new Map<number, { resolve(value: any): void; reject(reason: Error): void }>();
if (host.piNative) host.piNative.onmessage = event => {
  try {
    const reply = JSON.parse(event.data);
    const waiter = pending.get(reply.id);
    if (reply.error) waiter?.reject(new Error(reply.error)); else waiter?.resolve(reply.result);
  } catch (error) { console.error('Invalid native reply', error); }
};
export async function nativeCall(method: string, args: unknown = {}): Promise<any> {
  if (!hasNativeHost) throw new Error('No native host');
  const id = nextId++;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Native host timed out')), 10000); });
  const request = { id, method, args };
  try {
    const result = host.webkit?.messageHandlers?.piNative
      ? host.webkit.messageHandlers.piNative.postMessage(request)
      : new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); host.piNative!.postMessage(JSON.stringify(request)); });
    return await Promise.race([result, timeout]);
  } finally { clearTimeout(timer!); pending.delete(id); }
}
