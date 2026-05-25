#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { updateFromAmo } from './lib/amo-updater.mjs';

const slug = process.env.AMO_SLUG ?? 'youtube-transcript-copy';
const metadata = await updateFromAmo({ slug });

if (metadata.changed) {
  const manifest = JSON.parse(
    await readFile(path.join(process.cwd(), 'source/extension/manifest.json'), 'utf8'),
  );
  console.log(`Updated ${metadata.name} ${metadata.version} from AMO.`);
  console.log(`Verified ${metadata.fileHash}.`);
  console.log(`Fork version: ${manifest.version}${manifest.version_name ? ` (${manifest.version_name})` : ''}.`);
} else {
  console.log(`No AMO package changes for ${metadata.name} ${metadata.version}.`);
  console.log(`Current verified package is ${metadata.fileHash}.`);
}
