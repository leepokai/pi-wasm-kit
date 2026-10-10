# Changelog

## Unreleased

- OpenAI adapter: accept empty tool-call `arguments` (returned by some compatible providers for zero-argument tools) and include up to 500 bytes of the response body in HTTP errors.
- Package: stop shipping the duplicate guest bundle, esbuild metafile and unused guest declarations (2.5 MB → 1.0 MB unpacked). Bundled-only `abort-controller` and `@earendil-works/chord` move to devDependencies.
- CI: test on Node.js 22.19 (lowest supported) and 24; pin publish workflow actions to commit SHAs; add Dependabot and a security policy.

## 0.2.0 — Experimental

- Add Swift/iOS and Java/Android WebView examples with native tools and process-recovery E2E.
- Integrate iOS 26+ continued processing requests, progress, completion and expiration handling. Physical-device background scheduling is not yet validated.
- Add `autoResume: false` and `resume()` so hosts can commit cancellation before scheduling recovered work.
- Add the Continuation π icon, platform assets, project badges and mobile documentation.
- Preserve prominent inspiration credit to Finn Voorhees's PiDurableKit.

## 0.1.0 — Experimental

Initial upstream Pi Durable runtime in QuickJS WebAssembly, TypeScript host SDK, Node/IndexedDB journals, browser playground, extensions, and recovery tests.
