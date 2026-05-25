#!/usr/bin/env node
import { updateFromAmo } from './lib/amo-updater.mjs';

const slug = process.env.AMO_SLUG ?? 'youtube-transcript-copy';
const metadata = await updateFromAmo({ slug });

if (metadata.changed) {
  console.log(`Updated ${metadata.name} ${metadata.version} from AMO.`);
  console.log(`Verified ${metadata.fileHash}.`);
} else {
  console.log(`No AMO package changes for ${metadata.name} ${metadata.version}.`);
  console.log(`Current verified package is ${metadata.fileHash}.`);
}
