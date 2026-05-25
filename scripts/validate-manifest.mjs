#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('source/extension/manifest.json', 'utf8'));

const requiredFields = ['manifest_version', 'name', 'version', 'content_scripts'];
const missing = requiredFields.filter((field) => manifest[field] === undefined);

if (missing.length > 0) {
  throw new Error(`Missing manifest fields: ${missing.join(', ')}`);
}

if (manifest.browser_specific_settings?.gecko?.id === 'youtube-transcript-copier@dislikelever.com') {
  console.warn('Manifest still uses the upstream extension ID. Change it before publishing a store listing.');
}

console.log(`Validated extension manifest ${manifest.name} ${manifest.version}.`);
