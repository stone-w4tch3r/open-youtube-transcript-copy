# Open YouTube Transcript Copy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a transparent, MIT-licensed open fork of the AMO-distributed YouTube Transcript Copy extension with repeatable source extraction and update automation.

**Architecture:** Keep the extracted browser extension source isolated in `source/extension/`. Put AMO fetch, verification, extraction, and documentation generation in reusable Node modules under `scripts/lib/`, with thin CLI entry points. GitHub Actions runs tests on every change and opens update PRs when AMO publishes a new version.

**Tech Stack:** Node.js 22, native `node:test`, `yauzl` for safe ZIP/XPI extraction, GitHub Actions, Mozilla Add-ons API.

---

### Task 1: Repository Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `docs/README.prepend.md`
- Create: `LICENSE`
- Create: `NOTICE`

**Step 1: Define project scripts**

Add npm scripts for `test`, `update:amo`, and `build`.

**Step 2: Add project provenance text**

Write a README prepend that clearly states this is an unofficial open fork extracted from the AMO package and that upstream attribution is preserved.

**Step 3: Add license and notice**

Use MIT for this repository and document that AMO reports the upstream add-on license as MIT.

### Task 2: AMO Update Library

**Files:**
- Create: `tests/amo-updater.test.mjs`
- Create: `scripts/lib/amo-updater.mjs`
- Create: `scripts/update-from-amo.mjs`

**Step 1: Write failing tests**

Cover SHA-256 verification, unsafe archive path rejection, AMO metadata normalization, and README/UPSTREAM generation.

**Step 2: Run tests and confirm RED**

Run `npm test`. Expected: fails because `scripts/lib/amo-updater.mjs` does not exist yet.

**Step 3: Implement minimal library**

Implement fetch/download helpers, hash verification, safe XPI extraction, metadata normalization, and generated docs.

**Step 4: Run tests and confirm GREEN**

Run `npm test`. Expected: all tests pass.

### Task 3: CI and Update Automation

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/update-from-amo.yml`

**Step 1: Add CI workflow**

Run `npm ci`, `npm test`, `npm run build`, and extension manifest validation on pushes and PRs.

**Step 2: Add scheduled update workflow**

Run `npm run update:amo` weekly and on manual dispatch, then create a PR if generated files changed.

### Task 4: Seed Draft Source

**Files:**
- Generate: `source/extension/**`
- Generate: `README.md`
- Generate: `UPSTREAM.md`
- Generate: `.mirror/amo.json`

**Step 1: Run update script**

Run `npm run update:amo` against `youtube-transcript-copy`.

**Step 2: Verify generated source**

Check that the extracted manifest version matches AMO and that SHA-256 verification passed before extraction.

### Task 5: Final Verification

**Files:**
- All changed files

**Step 1: Run tests**

Run `npm test`.

**Step 2: Run build**

Run `npm run build`.

**Step 3: Review status**

Run `git status --short` and verify only intended files are present.
