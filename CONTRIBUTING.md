# Contributing

Use Node.js 22.19+ and `npm ci`. Run `npm test`, `npm run typecheck`, `npm run build:demo`, and `npm run test:e2e` (after installing Playwright Chromium) before proposing changes.

Keep guest code free of Node/browser dependencies unless supplied by an explicit bridge. Preserve Pi’s durability and safe/unsafe replay semantics. Every adapter change should include failure/recovery tests. Do not commit journals, credentials, generated guest-source.ts, dist or node_modules. Generated artifacts are built from exact locked dependencies.

Please include observable behavior, validation, and any platform limitations in a pull request. Physical Android/iOS and Safari/Firefox testing are especially useful contributions. Do not claim platform support based only on a viewport emulation test.
