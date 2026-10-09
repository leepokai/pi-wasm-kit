// Executed inside QuickJS WASM; no Node.js globals are available.
const { defineDoc, defineTask, defineTool, defineExtension, section, wrapTool } = require('@earendil-works/pi-durable');
const { Type } = require('@earendil-works/pi-ai');
const Counter = defineDoc({ kind: 'example.counter', version: 1, scope: 'conversation', history: 'rewindable', fork: 'asOf', initial: () => ({ value: 0, applied: {} }) });
const increment = defineTool({
  name: 'increment', description: 'Increment a durable counter', parameters: Type.Object({ amount: Type.Number() }), replay: 'safe',
  async execute({ amount }, api, context) {
    const value = await api.commit(async tx => {
      const doc = await tx.doc(Counter, api.conversationId);
      // Idempotency record and document mutation share one durable transaction.
      const previous = doc.applied[String(api.taskId)];
      if (previous !== undefined) return previous;
      doc.value += amount;
      doc.applied[String(api.taskId)] = doc.value;
      return doc.value;
    }, context);
    return { content: [{ type: 'text', text: String(value) }] };
  },
});
const Double = defineTask({
  name: 'example.double', version: 1, initial: () => ({ phase: 'compute' }),
  phases: { compute: async (task, runtime, context) => {
    await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'completed', result: task.input.value * 2 } }), context);
  } },
  abort: async (_task, runtime, context) => { await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), context); },
});
module.exports = defineExtension({
  name: 'counter', tools: [increment], tasks: [Double],
  sections: [section('counter-guide', () => 'Use increment when the user requests changing the counter.')],
  wraps: [wrapTool(increment, tool => ({ ...tool, async execute(args, api, context) { api.output('Updating counter…'); return tool.execute(args, api, context); } }))],
});
