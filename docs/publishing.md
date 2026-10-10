# Publishing to npm

The package is `pi-wasm-kit`, maintained from `leepokai/pi-wasm-kit`.
`.github/workflows/publish.yml` publishes version tags (`v*`) and offers a manual dry run.

## Dedicated CI token

Create a granular token in the npm account that owns the package:

- Name: `pi-wasm-kit-github-actions`.
- Packages and scopes: **Read and write (publish and stage)**, **Only select packages and scopes**, select **pi-wasm-kit** only.
- Organizations: **No access**.
- Bypass 2FA: enabled for unattended publishing.
- Expiration: 60 days. The initial token expires on **2026-12-09**.

Store it as the `NPM_TOKEN` secret in the repository's **npm environment**, not in a checked-in `.npmrc`. The environment permits `main` and `v*` tags. The workflow passes the secret only to the publishing step; installation, builds, tests and package verification do not receive it. Pull requests do not trigger this workflow.

To rotate the secret, create a replacement with the same limited permissions, then use the secure interactive prompt (do not pass a token in command-line arguments):

```sh
gh secret set NPM_TOKEN --repo leepokai/pi-wasm-kit --env npm
```

Run the dry run below before revoking the old token in npm. Never paste tokens into issues, pull requests or chat.

## Release

1. Update the version in `package.json` and `package-lock.json`, update the changelog, and commit the release to `main`.
2. Create and push its matching tag, for example:

   ```sh
   git tag v0.2.1
   git push origin v0.2.1
   ```

3. Watch **Publish npm** in GitHub Actions. The workflow checks the package name, lockfile version and tag; runs runtime tests, type checks and browser E2E; packs the SDK and tests installation of that exact archive; then publishes it with provenance. Stable version strings use `latest`; semver prereleases use `next`.
4. After publication it installs the exact version from npm into a fresh project and checks WASM execution, journal reopen, and no replay of completed model work.

A GitHub Release alone does not trigger npm publication. Tags created before this workflow existed, including `v0.2.0`, are not replayed. Do not move existing release tags or republish an existing npm version.

To validate on `main` without uploading a version:

```sh
gh workflow run publish.yml --repo leepokai/pi-wasm-kit --ref main -f dry_run=true
```

A dry run verifies token authentication, runs the full build/test/package path, and calls `npm publish --dry-run`. It does not prove that npm will accept a real write; the first tagged release verifies that. A non-dry-run dispatch must run against a matching version tag.

## Move to Trusted Publishing

npm has announced that bypass-2FA tokens are expected to lose direct publishing around **January 2027**. Migrate before that change (or when the initial token expires).

In the npm package's **Settings → Trusted Publisher**, configure:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `leepokai` |
| Repository | `pi-wasm-kit` |
| Workflow filename | `publish.yml` |
| Environment | `npm` |
| Allowed actions | Direct publishing (`npm publish`) |

The workflow already grants `id-token: write`. After configuring npm, remove `NODE_AUTH_TOKEN` from the publishing step, remove the token-only `npm whoami` dry-run check, and remove the `NPM_TOKEN` secret. Validate a real release within npm's current configuration validation window (2 days), then revoke the old npm token. The OIDC path uses short-lived workflow credentials and does not require token rotation.

References: [npm granular tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens/), [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/), [token publishing changes](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/).
