import type { ModelHandler } from '../types.js';
import { getSystemMessageText } from '@earendil-works/pi-ai/utils/text';
import { getCurrentTools } from '@earendil-works/pi-ai/utils/transcript';
/** OpenAI Chat Completions-compatible transport. Credentials never enter WASM. */
export function openAICompatible(options: { baseURL: string; model: string; apiKey?: string; timeoutMs?: number }): ModelHandler {
  return async ({ context }, signal) => {
    const messages: any[] = context.messages.map((message: any) => {
      if (message.role === 'system') return { role: 'system', content: getSystemMessageText(message) };
      if (message.role === 'user') return { role: 'user', content: typeof message.content === 'string' ? message.content : message.content.map((x: any) => { if (x.type === 'text') return { type: 'text', text: x.text }; if (x.type === 'image') return { type: 'image_url', image_url: { url: `data:${x.mimeType};base64,${x.data}` } }; throw new Error(`Unsupported user content: ${x.type}`); }) };
      if (message.role === 'toolResult') { if (message.content.some((x: any) => x.type !== 'text')) throw new Error('HTTP adapter supports text tool results only'); return { role: 'tool', tool_call_id: message.toolCallId, content: message.content.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n') }; }
      const text = message.content.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('');
      const calls = message.content.filter((x: any) => x.type === 'toolCall').map((x: any) => ({ id: x.id, type: 'function', function: { name: x.name, arguments: JSON.stringify(x.arguments) } }));
      return { role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) };
    });
    const tools = getCurrentTools(context.messages).map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
    const response = await fetch(`${options.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}) },
      body: JSON.stringify({ model: options.model, messages, ...(tools.length ? { tools } : {}), stream: false }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs ?? 60000)]),
    });
    if (!response.ok) throw new Error(`Model request failed: HTTP ${response.status}`);
    const data: any = await response.json(); const choice = data.choices?.[0];
    if (!choice?.message) throw new Error('Model returned no assistant message');
    const content: any[] = [];
    if (choice.message.content) content.push({ type: 'text', text: choice.message.content });
    for (const call of choice.message.tool_calls ?? []) content.push({ type: 'toolCall', id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments) });
    return { role: 'assistant', content, api: 'host', provider: 'host', model: options.model, stopReason: content.some(x => x.type === 'toolCall') ? 'toolUse' : choice.finish_reason === 'length' ? 'length' : 'stop', usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0, totalTokens: data.usage?.total_tokens ?? 0, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, timestamp: Date.now() };
  };
}
