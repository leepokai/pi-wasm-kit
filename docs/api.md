# API guide

`PiWasmAgent.open(options)` takes ownership of the journal and returns a live runtime. It restores committed state, installs extensions, attaches root events when requested, then resumes the scheduler. `conversationId` identifies the root. Supplying initial instructions does not overwrite an existing conversation’s configuration.

## Conversation operations

| Method | Result / behavior |
| --- | --- |
| `submit(content, requestId?, { conversationId?, whenBusy? }?)` | Durable admission → `{id}`; content is Pi user content, including images |
| `submitDraft(draft, conversationId?)` | Input or passive entry write |
| `wait(submissionId)` | Durable settled submission (`done` or `unanswered`) |
| `view(conversationId?)` | Committed visible entries and Pi mounted documents |
| `context(conversationId?, at?)` | Raw active entries and model context |
| `configure(change, conversationId?)` | Instructions, model, thinking, extension/tool names, cwd |
| `createConversation(agent?)` | New ownerless conversation; pass model explicitly |
| `fork(entryId, conversationId?)` | New ownerless fork at a visible entry |
| `reset(handoff?, conversationId?)` | Admit a new context marker |
| `compact(instructions?, conversationId?)` | `{taskId}`; `waitForTask` waits for result |
| `abort(conversationId?, background=false)` | Cancel conversation scope durably |
| `abortSubmission(id)` | Withdraw a queued input when possible |

Configuration accepts arrays of registered extension/tool names. Advanced upstream add/remove/null configuration is available through guest `conversation.configure`. The root uses provider `host` and `modelId` (default `host-model`). The bundled host catalog contains one model; changing the ID to an unregistered model does not automatically add a provider. A custom model handler may route requests itself.

## Paused recovery

`open({ autoResume: false, ... })` loads the journal without starting the scheduler. Use this when the host has saved a cancellation intent before a process stops:

```ts
const agent = await PiWasmAgent.open({ journal, model, autoResume: false });
await agent.abort(undefined, true); // Commit cancellation of root and its background work.
// Acknowledge the host cancellation marker only after this commit succeeds.
await agent.resume();
```

Default `autoResume: true` resumes unfinished work automatically. Paused instances can read state and admit changes; waits require scheduling to resume. This cancels the root conversation; applications with multiple conversations must apply their own cancellation scope.

## Tasks, extensions and lifecycle

| Method | Behavior |
| --- | --- |
| `inspect()` | Scheduler status, live tasks and unsettled submissions |
| `taskGraph()` | JSON snapshot of upstream task graph |
| `waitForTask(id)` | Terminal task record |
| `watch(conversationId?)` | Forward that conversation’s snapshot and event batches to `onEvent` |
| `install(source)` | Install/replace a CommonJS extension; returns name |
| `uninstall(name)` | Remove live registration; does not rewrite historical records |
| `evaluate(source, args?, conversationId?)` | Execute trusted async guest function body, return JSON |
| `resume()` | Start scheduling after a paused open |
| `close()` | Graceful close and journal release |
| `terminate()` | Dispose VM abruptly, abort host effects and release journal |

Do not overlap close/reopen. Caller promises may reject when the VM terminates. Keep submission IDs or stable request IDs to reacquire work after reopen. Reinstall the same compatible extension definitions on recovery.

## Events and models

`onEvent` receives `commit`, `error`, or `events` envelopes. Pi `events` contain a conversation ID and an ordered batch of upstream events (initial snapshot, messages, tool progress, inbox, usage, compaction, task failures). An observer exception is isolated from commit publication. Consumers should render text safely and handle snapshot replacement.

`ModelHandler(request, signal, emit)` returns a complete Pi `AssistantMessage`. `request` contains the host catalog model, Pi transcript context and serializable request options. Incremental events may be passed to `emit` before returning. Do not emit terminal done/error events yourself; the bridge sends one from your returned message. Pass cancellation to your network request.

`openAICompatible` posts buffered `/chat/completions` requests and converts text, tool calls/results and user image blocks. It propagates HTTP errors and timeout cancellation. It does not implement OAuth, provider-specific reasoning/deferred polling, pricing, audio, or image tool results; unsupported tool content is rejected. Costs are zero placeholders; token counts use the response’s usage data. A custom handler can return real cost accounting.

## Host tools

`execute(args, {taskId, conversationId, callId, signal, output})` returns text or Pi `ToolExecutionResult`. Structured results can carry content, errors, details, diagnostics, usage and control requests. `output(text)` forwards incremental retained output. `replay: 'safe'` is an explicit claim by the host that rerunning is safe; it is not a transaction around external effects.

## Journal contract

A journal has `load`, `append`, and `close`. `append` must atomically persist one detached commit, reject sequence conflicts, and resolve only after durable adoption. The guest must have exclusive ownership. A failed append must not allow later commits to be silently accepted. Implement encryption/remote storage in this layer only after preserving these semantics. The included adapters are single-owner local stores.
