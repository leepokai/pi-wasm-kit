import { PiWasmAgent } from '../../dist/index.js';
import { openNodeJournal } from '../../dist/storage/node.js';
import { openAICompatible } from '../../dist/providers/openai.js';
const model = process.env.PI_MODEL;
if (!model) throw new Error('Set PI_MODEL and optionally PI_API_KEY / PI_BASE_URL. See README.');
const agent = await PiWasmAgent.open({
  journal: await openNodeJournal('.data/chat.jsonl'),
  model: openAICompatible({ baseURL: process.env.PI_BASE_URL ?? 'https://api.openai.com/v1', model, apiKey: process.env.PI_API_KEY }),
  onEvent: event => { if (event.type === 'error') console.error(event.message); },
});
try {
  const submission = await agent.submit(process.argv.slice(2).join(' ') || 'Hello!');
  await agent.wait(submission.id);
  const view = await agent.view();
  for (const entry of view.entries) for (const message of entry.model ?? []) {
    if (message.role === 'assistant') console.log(message.content.filter(block => block.type === 'text').map(block => block.text).join('\n'));
  }
} finally { await agent.close(); }
