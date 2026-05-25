# open-youtube-transcript-copy

Source-available unofficial fork of the Firefox extension distributed on Mozilla Add-ons as **YouTube Transcript Copy**.

This repo extracts the AMO `.xpi`, verifies the AMO SHA-256 hash, and keeps source/provenance visible in Git history. It is not affiliated with or endorsed by the original author.

See `AGENTS.md` for workflows, automation details, and maintenance rules.

If the AMO listing publishes a new version or this repo falls behind, please open an issue with the AMO version number or package URL.

## Commands

| Command | Description |
| --- | --- |
| `npm test` | Run updater tests. |
| `npm run sync:local` | Download, verify, extract, and regenerate provenance docs from AMO locally. |
| `npm run sync:github` | Manually start the GitHub Actions AMO sync workflow. |
| `npm run build:extension` | Validate the manifest and build a ZIP artifact from `source/extension/`. |
| `npm run release:github` | Build and create or update the GitHub release for the manifest version. |
| `npm run publish:amo` | Build and submit the extension to AMO with `web-ext`; requires AMO API credentials. |

## Upstream Description

The purpose of this extension is to provide users with a simple, one-click button to copy the transcript of a YouTube video. This eliminates the tedious process of manually opening the transcript panel, highlighting all the text, copying it, and cleaning it up.

The extension enhances this core function with user-configurable settings, such as including the video title, adding timestamps, or formatting the transcript into a single paragraph. All features directly serve the primary purpose of easily extracting and formatting video transcripts for the user's own use.

The extension was made because I needed an extension with this functionality but wanted a clean UI and ease of access. Keep your coffee money, I don't need anything. Thank you!
