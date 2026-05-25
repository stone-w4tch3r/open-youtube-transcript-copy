#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('source/extension/manifest.json', 'utf8'));

const requiredFields = ['manifest_version', 'name', 'version', 'description', 'content_scripts', 'icons'];
const missing = requiredFields.filter((field) => manifest[field] === undefined);

if (missing.length > 0) {
  throw new Error(`Missing manifest fields: ${missing.join(', ')}`);
}

const icons = manifest.icons || {};
if (!icons['48']) {
  throw new Error('Manifest must include a 48x48 icon (minimum size required by AMO).');
}

const gecko = manifest.browser_specific_settings?.gecko;

if (!gecko) {
  throw new Error('Manifest is missing browser_specific_settings.gecko. Required for Firefox add-ons.');
}

if (!gecko.id) {
  throw new Error('Manifest is missing browser_specific_settings.gecko.id. Required for Firefox add-ons.');
}

if (gecko.id === 'youtube-transcript-copier@dislikelever.com') {
  console.warn('Manifest still uses the upstream extension ID. Change it before publishing a store listing.');
}

if (!gecko.data_collection_permissions) {
  throw new Error('Manifest is missing browser_specific_settings.gecko.data_collection_permissions. Required for new AMO submissions.');
}

if (!gecko.strict_min_version) {
  console.warn('Manifest is missing browser_specific_settings.gecko.strict_min_version. Strongly recommended for AMO.');
}

console.log(`Validated extension manifest ${manifest.name} ${manifest.version}.`);
