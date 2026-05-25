import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  assertSafeArchivePath,
  extractXpiBuffer,
  normalizeAddonMetadata,
  patchManifestForFork,
  renderReadme,
  renderUpstreamMarkdown,
  shouldSkipUpdate,
  verifySha256,
} from '../scripts/lib/amo-updater.mjs';

const sampleAddon = {
  authors: [
    {
      name: 'Dislike Lever',
      url: 'https://addons.mozilla.org/en-US/firefox/user/19050162/',
      username: 'anonymous-example',
    },
  ],
  current_version: {
    version: '1.0.8',
    file: {
      hash: 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      size: 3,
      url: 'https://addons.mozilla.org/firefox/downloads/file/example/example.xpi',
    },
    license: {
      slug: 'MIT',
      name: { 'en-US': 'MIT License' },
      url: 'https://spdx.org/licenses/MIT.html',
    },
  },
  description: {
    'en-US': 'The upstream AMO description.\n\nSecond paragraph.',
  },
  guid: 'youtube-transcript-copier@dislikelever.com',
  homepage: null,
  name: { 'en-US': 'YouTube Transcript Copy' },
  slug: 'youtube-transcript-copy',
  support_url: null,
  url: 'https://addons.mozilla.org/en-US/firefox/addon/youtube-transcript-copy/',
};

test('verifySha256 accepts AMO sha256-prefixed hashes', () => {
  assert.doesNotThrow(() => {
    verifySha256(Buffer.from('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

test('verifySha256 rejects mismatched package hashes', () => {
  assert.throws(
    () => verifySha256(Buffer.from('abc'), 'sha256:0000000000000000000000000000000000000000000000000000000000000000'),
    /SHA-256 mismatch/,
  );
});

test('assertSafeArchivePath rejects traversal and absolute archive paths', () => {
  assert.equal(assertSafeArchivePath('manifest.json'), 'manifest.json');
  assert.throws(() => assertSafeArchivePath('../manifest.json'), /Unsafe archive path/);
  assert.throws(() => assertSafeArchivePath('/manifest.json'), /Unsafe archive path/);
  assert.throws(() => assertSafeArchivePath('nested/../../manifest.json'), /Unsafe archive path/);
});

test('normalizeAddonMetadata keeps provenance fields needed by docs and automation', () => {
  const metadata = normalizeAddonMetadata(sampleAddon, '2026-05-25T00:00:00.000Z');

  assert.deepEqual(metadata, {
    amoUrl: 'https://addons.mozilla.org/en-US/firefox/addon/youtube-transcript-copy/',
    authors: [
      {
        name: 'Dislike Lever',
        url: 'https://addons.mozilla.org/en-US/firefox/user/19050162/',
        username: 'anonymous-example',
      },
    ],
    description: 'The upstream AMO description.\n\nSecond paragraph.',
    fileHash: 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    fileSize: 3,
    fileUrl: 'https://addons.mozilla.org/firefox/downloads/file/example/example.xpi',
    guid: 'youtube-transcript-copier@dislikelever.com',
    homepage: null,
    licenseName: 'MIT License',
    licenseSlug: 'MIT',
    licenseUrl: 'https://spdx.org/licenses/MIT.html',
    name: 'YouTube Transcript Copy',
    slug: 'youtube-transcript-copy',
    supportUrl: null,
    updatedAt: '2026-05-25T00:00:00.000Z',
    version: '1.0.8',
  });
});

test('renderReadme prepends local open-fork context before upstream description', () => {
  const readme = renderReadme('# Local Context\n\n', normalizeAddonMetadata(sampleAddon, '2026-05-25T00:00:00.000Z'));

  assert.match(readme, /^# Local Context/);
  assert.match(readme, /## Upstream Description\n\nThe upstream AMO description/);
});

test('renderUpstreamMarkdown records package hash, source URL, and license evidence', () => {
  const upstream = renderUpstreamMarkdown(normalizeAddonMetadata(sampleAddon, '2026-05-25T00:00:00.000Z'));

  assert.match(upstream, /# Upstream Provenance/);
  assert.match(upstream, /Version: `1\.0\.8`/);
  assert.match(upstream, /SHA-256: `sha256:ba7816bf8f01cfea/);
  assert.match(upstream, /License: \[MIT License\]/);
  assert.match(upstream, /Dislike Lever/);
});

test('extractXpiBuffer extracts source files and omits Mozilla signing artifacts', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'open-yt-transcript-copy-'));
  const archiveRoot = path.join(workspace, 'archive');
  const outputDir = path.join(workspace, 'output');
  const archivePath = path.join(workspace, 'fixture.xpi');

  await mkdir(path.join(archiveRoot, 'META-INF'), { recursive: true });
  await writeFile(path.join(archiveRoot, 'manifest.json'), '{"manifest_version":3}\n');
  await writeFile(path.join(archiveRoot, 'META-INF/mozilla.sf'), 'signature\n');

  const zip = spawnSync('zip', ['-r', archivePath, '.'], {
    cwd: archiveRoot,
    encoding: 'utf8',
  });
  assert.equal(zip.status, 0, zip.stderr);

  await extractXpiBuffer(await readFile(archivePath), outputDir);

  assert.equal(await readFile(path.join(outputDir, 'manifest.json'), 'utf8'), '{"manifest_version":3}\n');
  await assert.rejects(() => readFile(path.join(outputDir, 'META-INF/mozilla.sf'), 'utf8'), /ENOENT/);
});

test('patchManifestForFork gives the extracted extension a distinct public fork identity', () => {
  const patched = patchManifestForFork({
    browser_specific_settings: {
      gecko: {
        id: 'youtube-transcript-copier@dislikelever.com',
      },
    },
    description: 'Upstream description.',
    manifest_version: 3,
    name: 'YouTube Transcript Copier',
    version: '1.0.8',
  });

  assert.equal(patched.name, 'Open YouTube Transcript Copier');
  assert.equal(patched.browser_specific_settings.gecko.id, 'open-youtube-transcript-copy@stone-w4tch3r.github.io');
  assert.equal(patched.browser_specific_settings.gecko.strict_min_version, '115.0');
  assert.deepStrictEqual(patched.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
  assert.equal(patched.homepage_url, 'https://github.com/stone-w4tch3r/open-youtube-transcript-copy');
  assert.match(patched.description, /^Source-available fork;/);
  assert.match(patched.description, /Upstream description\./);
});

test('shouldSkipUpdate returns true when AMO package identity has not changed', () => {
  const existing = normalizeAddonMetadata(sampleAddon, '2026-05-24T00:00:00.000Z');
  const incoming = normalizeAddonMetadata(sampleAddon, '2026-05-25T00:00:00.000Z');

  assert.equal(shouldSkipUpdate(existing, incoming), true);
});

test('shouldSkipUpdate returns false when AMO package hash changes', () => {
  const existing = normalizeAddonMetadata(sampleAddon, '2026-05-24T00:00:00.000Z');
  const incoming = {
    ...existing,
    fileHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    updatedAt: '2026-05-25T00:00:00.000Z',
  };

  assert.equal(shouldSkipUpdate(existing, incoming), false);
});
