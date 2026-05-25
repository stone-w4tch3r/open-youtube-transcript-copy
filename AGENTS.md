# AGENTS.md

Operational guide for humans and agents working on `open-youtube-transcript-copy`.

This repository is an **unofficial open fork** of the Firefox add-on distributed on Mozilla Add-ons as **YouTube Transcript Copy**. The upstream AMO listing does not publish a source repository, so this repo keeps a provenance-tracked extraction of the AMO `.xpi` package.

---

## Project Map

```text
open-youtube-transcript-copy/
|
|-- source/extension/              Extracted extension source used for builds
|   |-- manifest.json              Fork-patched manifest
|   |-- content.js                 Upstream extension logic
|   `-- icons/                    Extracted icons/assets
|
|-- scripts/
|   |-- lib/amo-updater.mjs        AMO metadata, hash verification, extraction
|   |-- update-from-amo.mjs        Thin CLI wrapper around the updater
|   |-- build-extension.mjs        Builds dist/*.zip from source/extension
|   |-- validate-manifest.mjs      Validates required manifest fields
|   `-- release-github.mjs         Creates/updates GitHub release assets
|
|-- tests/amo-updater.test.mjs     Unit tests for updater safety and behavior
|-- .mirror/amo.json               Last accepted upstream AMO metadata snapshot
|-- UPSTREAM.md                    Human-readable upstream provenance
|-- docs/README.prepend.md         Local README preface source
|-- README.md                      Generated README: prepend + AMO description
|-- TODO.md                       Deferred automation ideas
`-- .github/workflows/             CI, upstream sync, release automation
```

---

## Core Principles

| Rule | Why |
| --- | --- |
| Treat AMO as the upstream package source. | There is no known official source repository. |
| Verify AMO hashes before extraction. | Prevents committing a corrupted or unexpected package. |
| Keep provenance visible. | Future maintainers need to know exactly which AMO package produced the source. |
| Do not pretend this repo is official. | The upstream author has not endorsed this fork. |
| Do not preserve Mozilla signing artifacts. | `META-INF/` signatures do not apply after fork changes. |
| Prefer update PRs over direct automated commits to `master`. | Keeps upstream changes reviewable. |

---

## Source Ownership Model

```text
          Mozilla Add-ons API
                  |
                  v
        AMO metadata + XPI URL
                  |
                  v
          Download XPI package
                  |
                  v
          Verify SHA-256 hash
                  |
                  v
       Safely extract package files
                  |
                  v
        Patch manifest for this fork
                  |
                  v
  source/extension + README + UPSTREAM + .mirror
```

`source/extension/` is generated from AMO, then lightly patched for this fork. Avoid casual manual edits there unless the goal is a deliberate fork change. If the goal is to sync upstream, use `npm run sync:local` or the **Sync Upstream AMO Package and Open Update PR** workflow.

The fork patch currently changes the extension identity:

```text
Upstream name:       YouTube Transcript Copier
Fork display name:   Open YouTube Transcript Copier
Fork Firefox ID:     open-youtube-transcript-copy@stone-w4tch3r.github.io
```

---

## Provenance Files

| File | Owner | Meaning |
| --- | --- | --- |
| `.mirror/amo.json` | updater | Machine-readable AMO snapshot for the accepted package. |
| `UPSTREAM.md` | updater | Human-readable package URL, version, SHA-256, author, license evidence. |
| `README.md` | updater | `docs/README.prepend.md` plus upstream AMO description. |
| `docs/README.prepend.md` | maintainers | Local project intro and command table. |

When editing README text, edit `docs/README.prepend.md` first. Running `npm run sync:local` may regenerate `README.md` from that prepend file.

---

## Command Reference

| Command | Use |
| --- | --- |
| `npm test` | Run Node test suite. |
| `npm run validate-manifest` | Check required extension manifest fields. |
| `npm run build:no-validate-manifest` | Build `dist/open-youtube-transcript-copy-<version>.zip` (unsigned, no validation). |
| `npm run build:with-validate-manifest` | Validate manifest, then build unsigned ZIP artifact. |
| `npm run sign:no-listing` | Validate manifest, then sign with `web-ext --channel unlisted`. Produces a signed `.xpi` in `dist/` for self-distribution on GitHub Releases. Requires `WEB_EXT_API_KEY` + `WEB_EXT_API_SECRET`. |
| `npm run sign:with-listing` | Validate manifest, then sign and submit to AMO with `web-ext --channel listed`. Requires `WEB_EXT_API_KEY` + `WEB_EXT_API_SECRET`. |
| `npm run release:no-listing:local` | Sign (unlisted) → create or update GitHub Release with the signed `.xpi`. Requires `gh` auth + AMO API credentials. |
| `npm run release:no-listing:ci` | Trigger the Publish GitHub Release workflow on CI. |
| `npm run release:with-listing:local` | Alias for `npm run sign:with-listing`. |
| `npm run release:with-listing:ci` | Trigger the Publish to AMO Store workflow on CI. |
| `npm run sync:local` | Pull latest AMO package locally, verify hash, update generated files if AMO changed. |
| `npm run sync:ci` | Trigger the upstream sync workflow on CI. |

Recommended local verification before pushing meaningful changes:

```bash
npm test
npm run build:with-validate-manifest
npm audit --audit-level=high
```

---

## Upstream Sync Flow

The upstream sync path is intentionally manual-only. GitHub scheduled workflows can be disabled after repository inactivity, and this upstream appears to update slowly.

```text
Maintainer clicks workflow_dispatch
              |
              v
Sync Upstream AMO Package and Open Update PR
              |
              v
          npm ci
              |
              v
       npm run sync:local
              |
              v
  changed? ---------------- no ------------------+
     |                                         |
    yes                                        v
     |                                  stop workflow
     v                                         |
 generated source/provenance                   |
     |                                         |
     v                                         |
 tests + manifest validation + build           |
     |                                         |
     v                                         |
 create/update PR
     |
     v
 upload ZIP artifact
```

Important behavior:

```text
No AMO package change
  -> updater returns changed=false
  -> generated files are not rewritten
  -> tests/build/artifact/PR steps are skipped
  -> no update PR is opened

AMO package changed
  -> updater downloads and verifies new XPI
  -> generated files change
  -> tests/build run
  -> update PR opens from automation/update-from-amo
  -> merging PR to master creates a version tag if missing
  -> tag push publishes/updates the GitHub release
```

The update PR can be created because repository Actions settings allow workflow write tokens and pull request creation.

---

## Verification Workflow

`.github/workflows/01-verify-source-build-and-package-artifact.yml` runs on pushes to `main`/`master` and on pull requests.

GitHub Actions display name: **Verify Source, Build, and Package Artifact**.

```text
push / pull_request
        |
        v
      npm ci
        |
        v
     npm test
        |
        v
npm run validate-manifest
        |
        v
    npm run build
        |
        v
npm audit --audit-level=high
        |
        v
 upload dist/*.zip artifact
```

Note: PRs created by `GITHUB_TOKEN` may not trigger a separate PR CI run. The **Sync Upstream AMO Package and Open Update PR** workflow already runs tests, manifest validation, and build before opening the PR.

---

## Release Flow

GitHub releases are tag-driven. They can still be started manually, but the normal path is: merge an upstream update PR, let **Create Version Tag After Master Update** create `v<manifest.version>`, then let **Publish GitHub Release From Version Tag** sign and publish the signed `.xpi` for that tag.

```text
update PR merged to master
           |
           v
Create Version Tag After Master Update
           |
           v
read source/extension/manifest.json
           |
           v
tag exists? ---- yes ----> stop
    |
   no
    |
    v
create v<manifest.version>
    |
    v
tag push triggers Publish GitHub Release From Version Tag
    |
    v
npm test + npm run sign:no-listing
    |
    v
scripts/release-github.mjs
    |
    v
upload signed dist/*.xpi to GitHub Release
```

The release script uses `source/extension/manifest.json` as the version source of truth. For version `1.0.8`, the tag is `v1.0.8` and the asset is the signed `.xpi` produced by `web-ext sign --channel unlisted`.

### AMO Store Publication

To submit to the AMO public listing (reviewed, listed for all Firefox users):

```bash
# Locally
npm run release:with-listing:local

# Via GitHub Actions
gh workflow run 05-publish-to-amo-store.yml
```

Both require `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` in the environment (local) or in GitHub Actions secrets (`AMO_API_KEY`, `AMO_API_SECRET`).

---

## AMO Updater Internals

`scripts/lib/amo-updater.mjs` is the core module. Keep it conservative.

```text
fetchAddonMetadata(slug)
        |
        v
normalizeAddonMetadata(addon)
        |
        v
shouldSkipUpdate(existing, incoming)?
        |
        |-- yes --> return changed=false
        |
        `-- no
             |
             v
       downloadPackage(fileUrl)
             |
             v
       verifySha256(buffer, fileHash)
             |
             v
       extractXpiBuffer(buffer, source/extension)
             |
             v
       patchManifestForFork(manifest)
             |
             v
       write .mirror/amo.json, README.md, UPSTREAM.md
```

Security-sensitive pieces:

| Function | Guardrail |
| --- | --- |
| `verifySha256` | Fails if AMO package bytes do not match AMO hash. |
| `assertSafeArchivePath` | Rejects absolute paths, `..` traversal, and Windows drive paths. |
| `extractXpiBuffer` | Extracts with safe paths and skips `META-INF/` signing artifacts. |
| `shouldSkipUpdate` | Compares version, file URL, and file hash to avoid timestamp-only diffs. |

---

## Testing Strategy

Current tests cover updater behavior, not YouTube runtime behavior.

```text
tests/amo-updater.test.mjs
|
|-- hash verification
|-- unsafe archive path rejection
|-- AMO metadata normalization
|-- README/UPSTREAM rendering
|-- XPI extraction without META-INF
|-- fork manifest identity patch
`-- no-op update detection
```

When changing updater behavior, add or update tests first. Good regression targets include:

- A corrupted XPI hash must fail before extraction.
- An archive entry like `../manifest.json` must be rejected.
- An unchanged AMO package must not rewrite generated files.
- A changed AMO package must regenerate source and provenance.

---

## Common Tasks

### Sync Upstream Locally

```bash
npm run sync:local
git diff --stat
npm test
npm run build:with-validate-manifest
```

Expected no-change output includes:

```text
No AMO package changes for YouTube Transcript Copy <version>.
Current verified package is sha256:<hash>.
```

### Start Upstream Sync On GitHub

```bash
npm run sync:ci
```

Then inspect the run:

```bash
gh run list --workflow 02-sync-upstream-amo-package-and-open-update-pr.yml --limit 5
```

### Create Or Update GitHub Release Locally

```bash
npm run release:no-listing:local
```

Requires `gh` authentication with release permissions.

### Build A Store Package

```bash
npm run build:with-validate-manifest
```

The unsigned ZIP appears in `dist/`.

### Submit To AMO

```bash
npm run release:with-listing:local
```

This uses `web-ext sign`, so it requires AMO API credentials in the environment expected by `web-ext`. Do not commit credentials.

---

## Operational Gotchas

| Gotcha | What To Do |
| --- | --- |
| `README.md` is generated. | Edit `docs/README.prepend.md`, then regenerate when appropriate. |
| `source/extension/` is mostly generated. | Prefer AMO sync for upstream changes. Mark deliberate fork edits clearly in commits. |
| GitHub PRs from `GITHUB_TOKEN` may not trigger PR CI. | Trust the upstream sync workflow checks, or use a PAT/GitHub App if separate PR checks are required. |
| AMO has no known public outbound update webhook. | Use manual workflow dispatch or future `repository_dispatch` polling automation. |
| GitHub scheduled workflows can be disabled after inactivity. | Keep sync manual unless an external trigger is added. |
| Release tags are manifest-version based. | Merging a new manifest version to `master` creates `v<version>` if that tag is missing. |

---

## Safe Change Checklist

Before committing:

```text
[ ] Change is scoped and intentional.
[ ] Generated files were changed only by sync/build logic or intentionally edited.
[ ] npm test passes.
[ ] npm run build:with-validate-manifest passes when build/release/sync logic changed.
[ ] npm audit --audit-level=high passes when dependencies changed.
[ ] UPSTREAM.md and .mirror/amo.json agree after upstream sync.
[ ] README.md matches docs/README.prepend.md plus upstream description.
```

Before opening or merging an upstream sync PR:

```text
[ ] AMO version increased or file URL/hash changed.
[ ] Workflow verified the package hash.
[ ] PR diff contains expected source/provenance files only.
[ ] Built artifact version matches source/extension/manifest.json.
```

---

## Temporary Test Branch Pattern

Use this pattern to test update automation without damaging `master`:

```text
master at current AMO version
        |
        v
create test/upstream-sync-from-<old-version>
        |
        v
seed branch with older AMO source/provenance
        |
        v
push branch
        |
        v
run Sync Upstream AMO Package and Open Update PR workflow on that branch
        |
        v
expect PR: automation/update-from-amo -> test branch
        |
        v
verify PR diff + artifact
        |
        v
close PR and delete test branches
```

Clean up after test branches. Do not merge synthetic rollback branches.

---

## Repository State As Of This Guide

- Default branch: `master`
- Current extracted AMO version: see `source/extension/manifest.json`
- Current upstream provenance: see `UPSTREAM.md`
- Verification flow: `Verify Source, Build, and Package Artifact`
- Upstream sync flow: manual `Sync Upstream AMO Package and Open Update PR`
- Version tagging flow: automatic `Create Version Tag After Master Update`
- GitHub release asset flow: automatic `Publish GitHub Release From Version Tag`; manual dispatch remains available
- Scheduled sync: intentionally disabled
