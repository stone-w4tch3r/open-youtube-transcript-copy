# open-youtube-transcript-copy

This is an unofficial open fork of the Firefox extension distributed on Mozilla Add-ons as **YouTube Transcript Copy**.

The original AMO listing does not publish a source repository. This repository extracts the AMO-distributed `.xpi`, verifies the package hash published by AMO, and keeps the resulting source visible in Git history.

AMO reports the upstream add-on license as **MIT License**. Upstream author, version, package URL, and hash metadata are preserved in `UPSTREAM.md` and `.mirror/amo.json`.

This repository is not affiliated with or endorsed by the original author. If an official upstream source repository becomes available, this fork should link to it and reconsider the mirroring workflow.

Upstream sync is intentionally manual. If the AMO listing publishes a new version or if this repository falls behind, please open an issue with the AMO version number or package URL.

## Commands

| Command | Description |
| --- | --- |
| `npm test` | Run updater tests. |
| `npm run sync:local` | Download, verify, extract, and regenerate provenance docs from AMO locally. |
| `npm run sync:github` | Manually start the GitHub Actions AMO sync workflow. |
| `npm run build:extension` | Validate the manifest and build a ZIP artifact from `source/extension/`. |
| `npm run publish:amo` | Build and submit the extension to AMO with `web-ext`; requires AMO API credentials. |

## Upstream Description

The purpose of this extension is to provide users with a simple, one-click button to copy the transcript of a YouTube video. This eliminates the tedious process of manually opening the transcript panel, highlighting all the text, copying it, and cleaning it up.

The extension enhances this core function with user-configurable settings, such as including the video title, adding timestamps, or formatting the transcript into a single paragraph. All features directly serve the primary purpose of easily extracting and formatting video transcripts for the user's own use.

The extension was made because I needed an extension with this functionality but wanted a clean UI and ease of access. Keep your coffee money, I don't need anything. Thank you!
