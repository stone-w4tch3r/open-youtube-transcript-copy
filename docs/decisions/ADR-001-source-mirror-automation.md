# ADR-001: Use Provenance-Tracked AMO Extraction

## Status
Accepted

## Date
2026-05-25

## Context
The Firefox add-on has no public upstream repository listed in Mozilla Add-ons metadata, but AMO exposes downloadable XPI packages and reports the add-on license as MIT. We want an open repository that is useful to users and maintainers without implying that it is the official source.

## Decision
Create an unofficial open fork that extracts the AMO-distributed XPI into `source/extension/`, verifies the AMO-provided SHA-256 hash before extraction, and generates `README.md`, `UPSTREAM.md`, and `.mirror/amo.json` from AMO metadata.

Updates will be automated by GitHub Actions. The scheduled workflow will run the updater and open a pull request when AMO publishes a different package.

## Alternatives Considered

### Manual Source Import Only
Pros: smallest setup and less automation.
Cons: future updates are easy to miss and provenance can drift.
Rejected because repeatability is the point of this repository.

### Automated Store Republishing
Pros: users could install a separately published extension.
Cons: higher legal, moderation, and user-confusion risk; requires review of branding and store policies.
Rejected for the draft. Build artifacts are acceptable, but store publishing should be a separate reviewed decision.

### Treat Greasy Fork Script as Upstream
Pros: public source page exists.
Cons: different author, different code, and not the same AMO package.
Rejected because it is not reliable provenance for the Firefox add-on.

## Consequences
- The repository is transparent about origin and license evidence.
- The extracted source remains reviewable in normal GitHub diffs.
- Automation must defend against unsafe archive paths before writing files.
- Any future store listing should use distinct naming, icons, and extension IDs unless upstream permission is obtained.
