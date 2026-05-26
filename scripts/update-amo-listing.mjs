#!/usr/bin/env node
import { updateAmoListing } from './lib/amo-listing-updater.mjs';

try {
  const result = await updateAmoListing();

  if (result.skipped) {
    console.log(`Skipping AMO listing update: ${result.reason}.`);
    process.exit(0);
  }

  const changes = [];
  if (result.patchKeys.length > 0) changes.push(`metadata: ${result.patchKeys.join(', ')}`);
  if (result.media.iconUploaded) changes.push('icon');
  if (result.media.previewsDeleted > 0) changes.push(`deleted previews: ${result.media.previewsDeleted}`);
  if (result.media.previewsUploaded > 0) changes.push(`uploaded previews: ${result.media.previewsUploaded}`);
  if (result.media.previewsUpdated > 0) changes.push(`updated previews: ${result.media.previewsUpdated}`);

  if (changes.length === 0) {
    console.log('AMO listing already in sync. Nothing to update.');
  } else {
    console.log(`AMO listing updated: ${changes.join('; ')}.`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
