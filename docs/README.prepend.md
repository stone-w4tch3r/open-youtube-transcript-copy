# open-youtube-transcript-copy

This is an unofficial open fork of the Firefox extension distributed on Mozilla Add-ons as **YouTube Transcript Copy**.

The original AMO listing does not publish a source repository. This repository extracts the AMO-distributed `.xpi`, verifies the package hash published by AMO, and keeps the resulting source visible in Git history.

AMO reports the upstream add-on license as **MIT License**. Upstream author, version, package URL, and hash metadata are preserved in `UPSTREAM.md` and `.mirror/amo.json`.

This repository is not affiliated with or endorsed by the original author. If an official upstream source repository becomes available, this fork should link to it and reconsider the mirroring workflow.

## Commands

| Command | Description |
| --- | --- |
| `npm test` | Run updater tests. |
| `npm run update:amo` | Download, verify, extract, and regenerate provenance docs from AMO. |
| `npm run build` | Build a ZIP artifact from `source/extension/`. |
