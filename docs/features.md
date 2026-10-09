# PiDurableKit feature preservation

This is inspired by PiDurableKit, not API-compatible with its Swift types. It embeds the upstream Pi Durable 1.1.0 package directly. The classification below distinguishes implemented bridges from APIs accessible only in guest JavaScript.

| Area | Implementation | Validation / boundary |
| --- | --- | --- |
| Durable root conversation | `open`, `submit`, `wait`, `view` | Real WASM + reopen tests |
| Multiple conversations | `createConversation`, optional conversation ID | Separate conversation and fork tests |
| Steering / follow-ups | `submit(..., id, {whenBusy})` | Busy inbox, steering, follow-up and reject-mode tests |
| Submission deduplication | Caller-provided request ID | Repeat after reopen returns the original ID |
| Configuration / reset / fork | First-class methods | Integration tests |
| Manual / automatic compaction | `compact`, `settings.compaction` | Manual compaction integration; automatic policy is upstream |
| Model / thinking selection | Configuration and host request options | One host provider/catalog model per runtime; host interprets options |
| Host tools | JSON schemas, string or Pi result, progress, cancellation | Tool loop and interrupted safe/unsafe tool tests |
| Multimodal content | Pi content in SDK; user images in HTTP adapter | No image-model integration test; adapter tool images are not supported |
| Model streaming | Custom model handler emits Pi events | Incremental event test; HTTP helper buffers responses |
| Events / usage / task graph | Pi event batches, `view`, `inspect`, `taskGraph` | Events and usage integration tests |
| Extensions | CommonJS `module.exports`, install / uninstall | Example tool, section and wrapper executed in WASM |
| Hooks / custom tools | Upstream APIs inside guest extensions | Same registry and task engine; no native callback API for hooks |
| Documents / transactions | `pi.defineDoc`, `harness.snapshot`, `conversation.commit` inside guest | Durable counter tested across reopen |
| Custom tasks / child tasks / subagents | Upstream APIs inside guest; `waitForTask` on host | Custom task and owned subagent tested; not a native Swift DSL |
| Migration | Upstream task/document version and migration APIs in extensions | Application owns compatible definitions; no automatic code migration |
| Fork-aware history / as-of documents | Upstream entry and document APIs through `evaluate` | Custom document tokens must match persisted semantics |
| Observable Swift / AsyncSequence wrappers | TypeScript promises and callbacks | No Swift package |
| SQLite | Replaced by exclusive JSONL/IndexedDB journals | No SQLite compatibility or import from PiDurableKit journals |
| OAuth / Keychain / provider catalog | Supply host transport and credential management | No Apple OAuth UI or secret store bundled |
| Shell / filesystem / environment | Explicit host tools | No built-in shell, filesystem or `ExecutionEnv` implementation |
| Android / iOS | Possible WebView adaptation | No native adapters or physical device validation |
| PostgreSQL / WASI | Not implemented | Current WASM artifact needs JavaScript host glue |

`view().docs` mounts Pi’s agent/live/inbox/provider/usage documents, as upstream does. Custom documents are read with `harness.snapshot()` in guest code, not automatically included in `view()`.
