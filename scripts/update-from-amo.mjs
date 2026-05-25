#!/usr/bin/env node
import { updateFromAmo } from './lib/amo-updater.mjs';

const slug = process.env.AMO_SLUG ?? 'youtube-transcript-copy';
const metadata = await updateFromAmo({ slug });

console.log(`Updated ${metadata.name} ${metadata.version} from AMO.`);
console.log(`Verified ${metadata.fileHash}.`);
