import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { retryDelayMs, updateAmoListing } from '../scripts/lib/amo-listing-updater.mjs';

test('retryDelayMs honors AMO throttling response text', () => {
  const response = { headers: { get: () => null }, status: 429 };
  const text = '{"detail":"Request was throttled. Expected available in 386 seconds."}';

  assert.equal(retryDelayMs(response, text, 1), 386000);
});

test('updateAmoListing uploads local AMO listing icon and replaces changed previews', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'open-yt-transcript-copy-listing-'));
  const assetsDir = path.join(workspace, 'assets/amo-listing');
  const requests = [];

  await mkdir(path.join(workspace, 'source/extension'), { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  await writeFile(path.join(workspace, 'source/extension/manifest.json'), JSON.stringify({
    browser_specific_settings: { gecko: { id: 'fork@example.com' } },
  }));
  await writeFile(path.join(workspace, '.amo-listing.json'), JSON.stringify({
    description: { 'en-US': 'Already current.' },
  }));
  await writeFile(path.join(assetsDir, 'icon.png'), 'new-icon');
  await writeFile(path.join(assetsDir, 'preview-1.png'), 'new-preview');
  await writeFile(path.join(assetsDir, 'manifest.json'), JSON.stringify({
    icon: {
      path: 'icon.png',
      sha256: 'c9662f4480fb3b9d86bb71cfb64a3460dba833a4266c94f654f700e125773014',
      sourceUrl: 'https://addons.mozilla.org/upstream-icon.png',
    },
    previews: [
      {
        caption: { 'en-US': 'Main Image' },
        path: 'preview-1.png',
        position: 0,
        sha256: '44404f40dcd08a20298e646971ce76db81674e0b7f3e7c5e57e24eabb9828671',
        sourceUrl: 'https://addons.mozilla.org/upstream-preview.png',
      },
    ],
  }));

  const result = await updateAmoListing({
    rootDir: workspace,
    apiKey: 'api-key',
    apiSecret: 'api-secret',
    fetchImpl: async (url, options = {}) => {
      const urlText = String(url);
      requests.push({ url: urlText, options });

      if (urlText.endsWith('/api/v5/addons/addon/fork%40example.com/')) {
        if ((options.method ?? 'GET') === 'GET') {
          return okJson({
            description: { 'en-US': 'Already current.' },
            icon_url: 'https://cdn.example/current-icon.png',
            previews: [
              {
                id: 10,
                caption: { 'en-US': 'Old caption' },
                image_url: 'https://cdn.example/current-preview.png',
                position: 0,
              },
            ],
          });
        }
        if (options.method === 'PATCH' && options.body instanceof FormData) {
          return okJson({ ok: true });
        }
      }

      if (urlText === 'https://cdn.example/current-icon.png') return okBytes('old-icon');
      if (urlText === 'https://cdn.example/current-preview.png') return okBytes('old-preview');
      if (urlText.endsWith('/api/v5/addons/addon/fork%40example.com/previews/10/') && options.method === 'DELETE') {
        return okJson({ ok: true });
      }
      if (urlText.endsWith('/api/v5/addons/addon/fork%40example.com/previews/') && options.method === 'POST') {
        assert.equal(options.body instanceof FormData, true);
        return okJson({ id: 20 });
      }
      if (urlText.endsWith('/api/v5/addons/addon/fork%40example.com/previews/20/') && options.method === 'PATCH') {
        assert.deepEqual(JSON.parse(options.body), { caption: { 'en-US': 'Main Image' }, position: 0 });
        return okJson({ id: 20 });
      }

      throw new Error(`Unexpected request: ${options.method ?? 'GET'} ${urlText}`);
    },
  });

  const iconUpload = requests.find((request) => request.options.method === 'PATCH' && request.options.body instanceof FormData);
  const previewDelete = requests.find((request) => request.options.method === 'DELETE');
  const previewCreate = requests.find((request) => request.options.method === 'POST');
  const previewPatch = requests.find((request) => request.options.method === 'PATCH' && typeof request.options.body === 'string');

  assert.deepEqual(result.patchKeys, []);
  assert.equal(result.media.iconUploaded, true);
  assert.equal(result.media.previewsUploaded, 1);
  assert.equal(iconUpload.options.headers.Authorization.startsWith('JWT '), true);
  assert.equal(previewDelete.url.endsWith('/previews/10/'), true);
  assert.equal(previewCreate.url.endsWith('/previews/'), true);
  assert.equal(previewPatch.url.endsWith('/previews/20/'), true);

  assert.equal(await readFile(path.join(assetsDir, 'icon.png'), 'utf8'), 'new-icon');
});

function okJson(body) {
  return {
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function okBytes(text) {
  const buffer = Buffer.from(text);
  return {
    ok: true,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    text: async () => text,
  };
}
