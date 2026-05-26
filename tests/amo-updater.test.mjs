import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  assertSafeArchivePath,
  bumpPatchVersion,
  extractXpiBuffer,
  normalizeAddonMetadata,
  patchManifestForFork,
  renderReadme,
  renderUpstreamMarkdown,
  shouldSkipUpdate,
  updateFromAmo,
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
  icon_url: 'https://addons.mozilla.org/user-media/addon_icons/2920/2920626-64.png?modified=example',
  icons: {
    32: 'https://addons.mozilla.org/user-media/addon_icons/2920/2920626-32.png?modified=example',
    64: 'https://addons.mozilla.org/user-media/addon_icons/2920/2920626-64.png?modified=example',
    128: 'https://addons.mozilla.org/user-media/addon_icons/2920/2920626-128.png?modified=example',
  },
  name: { 'en-US': 'YouTube Transcript Copy' },
  previews: [
    {
      id: 323201,
      caption: { 'en-US': 'Main Image' },
      image_size: [1280, 800],
      image_url: 'https://addons.mozilla.org/user-media/previews/full/323/323201.png?modified=example',
      position: 0,
      thumbnail_size: [533, 333],
      thumbnail_url: 'https://addons.mozilla.org/user-media/previews/thumbs/323/323201.jpg?modified=example',
    },
  ],
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
  assert.throws(() => assertSafeArchivePath('..'), /Unsafe archive path/);
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
    iconUrl: 'https://addons.mozilla.org/user-media/addon_icons/2920/2920626-64.png?modified=example',
    icons: {
      32: 'https://addons.mozilla.org/user-media/addon_icons/2920/2920626-32.png?modified=example',
      64: 'https://addons.mozilla.org/user-media/addon_icons/2920/2920626-64.png?modified=example',
      128: 'https://addons.mozilla.org/user-media/addon_icons/2920/2920626-128.png?modified=example',
    },
    licenseName: 'MIT License',
    licenseSlug: 'MIT',
    licenseUrl: 'https://spdx.org/licenses/MIT.html',
    name: 'YouTube Transcript Copy',
    previews: [
      {
        id: 323201,
        caption: 'Main Image',
        imageSize: [1280, 800],
        imageUrl: 'https://addons.mozilla.org/user-media/previews/full/323/323201.png?modified=example',
        position: 0,
        thumbnailSize: [533, 333],
        thumbnailUrl: 'https://addons.mozilla.org/user-media/previews/thumbs/323/323201.jpg?modified=example',
      },
    ],
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
  assert.match(upstream, /AMO listing icon: https:\/\/addons\.mozilla\.org\/user-media\/addon_icons\/2920\/2920626-64\.png/);
  assert.match(upstream, /\[Main Image\]\(https:\/\/addons\.mozilla\.org\/user-media\/previews\/full\/323\/323201\.png/);
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
  assert.deepStrictEqual(patched.developer, {
    name: 'stone-w4tch3r',
    url: 'https://github.com/stone-w4tch3r/open-youtube-transcript-copy',
  });
  assert.match(patched.description, /^Open fork;/);
  assert.match(patched.description, /Upstream description\./);
});

test('shouldSkipUpdate returns true when AMO package identity has not changed', () => {
  const existing = normalizeAddonMetadata(sampleAddon, '2026-05-24T00:00:00.000Z');
  const incoming = normalizeAddonMetadata(sampleAddon, '2026-05-25T00:00:00.000Z');

  assert.equal(shouldSkipUpdate(existing, incoming), true);
});

test('shouldSkipUpdate returns false when AMO listing media changes', () => {
  const existing = {
    ...normalizeAddonMetadata(sampleAddon, '2026-05-24T00:00:00.000Z'),
    iconUrl: null,
    icons: {},
    previews: [],
  };
  const incoming = normalizeAddonMetadata(sampleAddon, '2026-05-25T00:00:00.000Z');

  assert.equal(shouldSkipUpdate(existing, incoming), false);
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

test('updateFromAmo refreshes listing media without re-extracting the unchanged XPI', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'open-yt-transcript-copy-'));
  const manifestPath = path.join(workspace, 'source/extension/manifest.json');
  const mirrorPath = path.join(workspace, '.mirror/amo.json');

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await mkdir(path.dirname(mirrorPath), { recursive: true });
  await mkdir(path.join(workspace, 'docs'), { recursive: true });
  await writeFile(path.join(workspace, 'docs/README.prepend.md'), '# Local Context\n');
  await writeFile(manifestPath, JSON.stringify({ manifest_version: 3, version: '2.0.0' }, null, 2));
  await writeFile(
    mirrorPath,
    `${JSON.stringify({
      ...normalizeAddonMetadata(sampleAddon, '2026-05-24T00:00:00.000Z'),
      iconUrl: null,
      icons: {},
      previews: [],
    }, null, 2)}\n`,
  );

  const media = new Map([
    [sampleAddon.icons[128], Buffer.from('icon-bytes')],
    [sampleAddon.previews[0].image_url, Buffer.from('preview-bytes')],
  ]);

  const result = await updateFromAmo({
    rootDir: workspace,
    updatedAt: '2026-05-25T00:00:00.000Z',
    fetchImpl: async (url) => {
      const urlText = String(url);
      if (urlText.includes('/addons/addon/')) {
        return { ok: true, json: async () => sampleAddon };
      }
      if (media.has(urlText)) {
        const body = media.get(urlText);
        return { ok: true, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
      }
      throw new Error(`Unexpected XPI download for media-only update: ${url}`);
    },
  });

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const mirror = JSON.parse(await readFile(mirrorPath, 'utf8'));
  const upstream = await readFile(path.join(workspace, 'UPSTREAM.md'), 'utf8');

  assert.equal(result.changed, true);
  assert.equal(manifest.version, '2.0.0');
  assert.equal(mirror.iconUrl, sampleAddon.icon_url);
  assert.equal(mirror.previews[0].caption, 'Main Image');
  assert.match(upstream, /## Upstream Listing Media/);
});

test('updateFromAmo downloads AMO listing assets when package metadata is unchanged', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'open-yt-transcript-copy-'));
  const manifestPath = path.join(workspace, 'source/extension/manifest.json');
  const mirrorPath = path.join(workspace, '.mirror/amo.json');

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await mkdir(path.dirname(mirrorPath), { recursive: true });
  await mkdir(path.join(workspace, 'docs'), { recursive: true });
  await writeFile(path.join(workspace, 'docs/README.prepend.md'), '# Local Context\n');
  await writeFile(manifestPath, JSON.stringify({ manifest_version: 3, version: '2.0.0' }, null, 2));
  await writeFile(mirrorPath, `${JSON.stringify(normalizeAddonMetadata(sampleAddon, '2026-05-24T00:00:00.000Z'), null, 2)}\n`);

  const media = new Map([
    [sampleAddon.icons[128], Buffer.from('icon-bytes')],
    [sampleAddon.previews[0].image_url, Buffer.from('preview-bytes')],
  ]);

  const result = await updateFromAmo({
    rootDir: workspace,
    updatedAt: '2026-05-25T00:00:00.000Z',
    fetchImpl: async (url) => {
      const urlText = String(url);
      if (urlText.includes('/addons/addon/')) {
        return { ok: true, json: async () => sampleAddon };
      }
      if (media.has(urlText)) {
        const body = media.get(urlText);
        return { ok: true, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
      }
      throw new Error(`Unexpected download: ${urlText}`);
    },
  });

  const assetsManifest = JSON.parse(await readFile(path.join(workspace, 'assets/amo-listing/manifest.json'), 'utf8'));
  const icon = await readFile(path.join(workspace, 'assets/amo-listing/icon.png'));
  const preview = await readFile(path.join(workspace, 'assets/amo-listing/preview-1.png'));

  assert.equal(result.changed, true);
  assert.deepEqual(icon, Buffer.from('icon-bytes'));
  assert.deepEqual(preview, Buffer.from('preview-bytes'));
  assert.equal(assetsManifest.icon.path, 'icon.png');
  assert.equal(assetsManifest.icon.sha256, sha256(Buffer.from('icon-bytes')));
  assert.deepEqual(assetsManifest.previews[0].caption, { 'en-US': 'Main Image' });
  assert.equal(assetsManifest.previews[0].path, 'preview-1.png');
  assert.equal(assetsManifest.previews[0].sha256, sha256(Buffer.from('preview-bytes')));
});

test('bumpPatchVersion increments the last numeric component', () => {
  assert.equal(bumpPatchVersion('2.0.0'), '2.0.1');
  assert.equal(bumpPatchVersion('2.0.9'), '2.0.10');
  assert.equal(bumpPatchVersion('1.0.8.1'), '1.0.8.2');
  assert.equal(bumpPatchVersion('0.0.0'), '0.0.1');
});

test('patchManifestForFork with forkVersion replaces version and keeps identity patch', () => {
  const patched = patchManifestForFork(
    {
      browser_specific_settings: {
        gecko: { id: 'youtube-transcript-copier@dislikelever.com' },
      },
      description: 'Upstream description.',
      manifest_version: 3,
      name: 'YouTube Transcript Copier',
      version: '1.0.9',
    },
    { forkVersion: '2.0.1' },
  );

  assert.equal(patched.version, '2.0.1');
  assert.equal(patched.name, 'Open YouTube Transcript Copier');
  assert.equal(patched.browser_specific_settings.gecko.id, 'open-youtube-transcript-copy@stone-w4tch3r.github.io');
});

test('patchManifestForFork with upstreamVersion sets version_name for provenance display', () => {
  const patched = patchManifestForFork(
    {
      browser_specific_settings: {
        gecko: { id: 'upstream@example.com' },
      },
      manifest_version: 3,
      name: 'Upstream Name',
      version: '1.0.9',
    },
    { forkVersion: '2.0.1', upstreamVersion: '1.0.9' },
  );

  assert.equal(patched.version, '2.0.1');
  assert.equal(patched.version_name, '2.0.1 (upstream 1.0.9)');
});

test('patchManifestForFork without options preserves upstream version (backward compat)', () => {
  const patched = patchManifestForFork({
    browser_specific_settings: {
      gecko: { id: 'upstream@example.com' },
    },
    manifest_version: 3,
    name: 'Upstream Name',
    version: '1.0.9',
  });

  assert.equal(patched.version, '1.0.9');
  assert.equal(patched.version_name, undefined);
  assert.equal(patched.name, 'Open YouTube Transcript Copier');
});

test('patchManifestForFork always sets MIT license required for AMO listed submissions', () => {
  const patched = patchManifestForFork({
    browser_specific_settings: {
      gecko: { id: 'upstream@example.com' },
    },
    manifest_version: 3,
    name: 'Upstream Name',
    version: '1.0.9',
  });

  assert.equal(patched.license, 'MIT');
});

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
