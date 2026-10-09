# End-to-end validation

The v0.2 work was validated locally on macOS arm64 with Node 26, Chromium, an iPhone 17 Pro iOS 26.5 Simulator (Xcode 27 SDK), and an API 35 arm64 Android Emulator. The GitHub Actions workflow repeats the checks on Ubuntu with Node 24. CI status is the authoritative result for the published commit.

## Executable checks

- `npm test`: 16 integration tests using real QuickJS WASM and the real upstream Pi scheduler. Covers a complete tool/model loop, journal replay, deduplication, abrupt VM termination with pending callers, cancellation before resumed model execution, safe/unsafe interrupted tools, forks/reset/configuration, exclusive locking and torn writes, CPU interruption, extension sections/wrappers, transactional documents, custom tasks, compaction, process SIGKILL recovery, streamed model events, steering/follow-ups and an owned subagent conversation. A local HTTP server validates the transport without paid credentials.
- `npm run build:demo && npm run test:e2e`: 8 production-bundle browser tests across desktop Chromium and a mobile Chromium viewport. Covers actual Worker termination and resume, refresh, two-tab writer exclusion, closing a tab during unfinished work and reopening another, and actual HTTP model requests through the Worker/tool bridge. The mobile viewport does not certify Android/iOS devices.
- `npm run typecheck`: checks SDK, guest, browser UI/Worker, configs and browser test TypeScript.
- `npm run test:package`: packs the library, installs the tarball and production dependencies in a fresh temporary consumer, imports all four public exports, executes real WASM, reopens a journal, checks request deduplication and checks bundled license notices.
- Manual browser inspection: exercised interrupt/reopen/reload against the demo and inspected the rendered interface and persisted state. The README screenshot comes from this run.

- Native iOS: `xcodebuild test` as documented in [the example](../examples/ios) covers file-backed expiration intent, exactly-once completion, Swift tool execution, saved-result recovery without replay, and a new answer after interrupting/relaunching the app.
- Native Android: [the adb E2E script](../examples/android/test/recovery.py) runs the Java tool and force-stops/relaunches the actual app to check completed and unfinished work.
- The `Mobile examples` workflow builds both wrappers and repeats their native E2E. These are distinct from browser mobile-viewport tests.

## Limits of these checks

Synthetic/local fixture model responses test orchestration, protocol handling and persistence. They do not verify a paid provider's live behavior. Safari, Firefox, Android hardware, iOS hardware, physical-device background task grants, distributed/network filesystems, storage eviction, database-native execution and standalone WASI have not been validated. The project does not claim complete PiDurableKit API compatibility or audited hostile-plugin isolation.
