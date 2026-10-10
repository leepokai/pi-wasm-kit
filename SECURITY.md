# Security

Report vulnerabilities privately through GitHub's **Report a vulnerability** button on the [Security tab](https://github.com/leepokai/pi-wasm-kit/security), not in public issues.

In scope: escaping the QuickJS WASM guest, reaching host capabilities that were not granted, credentials leaking into the guest or journal, and journal ownership/corruption bugs.

Out of scope by design: extension sources and `evaluate()` are trusted application code, not a multitenant sandbox (see [architecture](docs/architecture.md)).
