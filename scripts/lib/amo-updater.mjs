import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

const DEFAULT_AMO_API_BASE = 'https://addons.mozilla.org/api/v5/addons/addon';
const FORK_EXTENSION_ID = 'open-youtube-transcript-copy@stone-w4tch3r.github.io';
const FORK_EXTENSION_NAME = 'Open YouTube Transcript Copier';
const FORK_DESCRIPTION_PREFIX = 'Source-available fork; source: https://github.com/stone-w4tch3r/open-youtube-transcript-copy.';

export function verifySha256(buffer, expectedHash) {
  const expected = expectedHash.replace(/^sha256:/i, '').toLowerCase();
  const actual = createHash('sha256').update(buffer).digest('hex');

  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch: expected ${expected}, got ${actual}`);
  }
}

export function assertSafeArchivePath(entryName) {
  const unixName = entryName.replaceAll('\\', '/');
  const normalized = path.posix.normalize(unixName);

  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    throw new Error(`Unsafe archive path: ${entryName}`);
  }

  return normalized;
}

export function normalizeAddonMetadata(addon, updatedAt = new Date().toISOString()) {
  const version = addon.current_version;
  const file = version.file;
  const license = version.license;

  return {
    amoUrl: addon.url,
    authors: addon.authors.map((author) => ({
      name: author.name,
      url: author.url,
      username: author.username,
    })),
    description: addon.description?.['en-US'] ?? '',
    fileHash: file.hash,
    fileSize: file.size,
    fileUrl: file.url,
    guid: addon.guid,
    homepage: addon.homepage,
    licenseName: license.name?.['en-US'] ?? license.slug,
    licenseSlug: license.slug,
    licenseUrl: license.url,
    name: addon.name?.['en-US'] ?? addon.slug,
    slug: addon.slug,
    supportUrl: addon.support_url,
    updatedAt,
    version: version.version,
  };
}

export function renderReadme(prependMarkdown, metadata) {
  const trimmedPrepend = prependMarkdown.trimEnd();
  return `${trimmedPrepend}\n\n## Upstream Description\n\n${metadata.description.trim()}\n`;
}

export function renderUpstreamMarkdown(metadata) {
  const authors = metadata.authors
    .map((author) => `- [${author.name}](${author.url}) (${author.username})`)
    .join('\n');

  return `# Upstream Provenance

This repository is an unofficial open fork generated from the Mozilla Add-ons package for the extension listed below.

- Name: ${metadata.name}
- Slug: \`${metadata.slug}\`
- Version: \`${metadata.version}\`
- Extension ID: \`${metadata.guid}\`
- AMO listing: ${metadata.amoUrl}
- XPI package: ${metadata.fileUrl}
- SHA-256: \`${metadata.fileHash}\`
- Package size: ${metadata.fileSize} bytes
- License: [${metadata.licenseName}](${metadata.licenseUrl}) (AMO slug: \`${metadata.licenseSlug}\`)
- Homepage: ${metadata.homepage ?? 'not listed'}
- Support URL: ${metadata.supportUrl ?? 'not listed'}
- Extracted at: ${metadata.updatedAt}

## Upstream Authors

${authors}

## Notes

AMO reports the upstream add-on license as MIT. This repository preserves that license evidence and records the exact package hash used for extraction.

Mozilla signing artifacts under \`META-INF/\` are not copied into \`source/extension/\` because this repository is a fork and those signatures do not apply to rebuilt packages.
`;
}

export function patchManifestForFork(manifest) {
  return {
    ...manifest,
    name: FORK_EXTENSION_NAME,
    description: `${FORK_DESCRIPTION_PREFIX} ${manifest.description ?? ''}`.trim(),
    browser_specific_settings: {
      ...manifest.browser_specific_settings,
      gecko: {
        ...manifest.browser_specific_settings?.gecko,
        id: FORK_EXTENSION_ID,
      },
    },
  };
}

export function shouldSkipUpdate(existingMetadata, incomingMetadata) {
  if (!existingMetadata) return false;

  return (
    existingMetadata.version === incomingMetadata.version &&
    existingMetadata.fileUrl === incomingMetadata.fileUrl &&
    existingMetadata.fileHash === incomingMetadata.fileHash
  );
}

export async function fetchAddonMetadata(slug, fetchImpl = fetch, apiBase = DEFAULT_AMO_API_BASE) {
  const response = await fetchImpl(`${apiBase}/${encodeURIComponent(slug)}/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch AMO metadata: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function downloadPackage(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to download XPI: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function extractXpiBuffer(buffer, destinationDir, options = {}) {
  const { omitMetaInf = true } = options;
  await rm(destinationDir, { recursive: true, force: true });
  await mkdir(destinationDir, { recursive: true });

  const zipFile = await openZipBuffer(buffer);

  try {
    await new Promise((resolve, reject) => {
      zipFile.on('entry', async (entry) => {
        try {
          const safeName = assertSafeArchivePath(entry.fileName);
          const isDirectory = safeName.endsWith('/');

          if (omitMetaInf && safeName.startsWith('META-INF/')) {
            zipFile.readEntry();
            return;
          }

          const outputPath = path.join(destinationDir, safeName);
          const relativeOutput = path.relative(destinationDir, outputPath);
          if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
            throw new Error(`Unsafe archive path: ${entry.fileName}`);
          }

          if (isDirectory) {
            await mkdir(outputPath, { recursive: true });
          } else {
            await mkdir(path.dirname(outputPath), { recursive: true });
            const readStream = await openReadStream(zipFile, entry);
            await pipeline(readStream, createWriteStream(outputPath, { flags: 'wx' }));
          }

          zipFile.readEntry();
        } catch (error) {
          reject(error);
        }
      });

      zipFile.once('end', resolve);
      zipFile.once('error', reject);
      zipFile.readEntry();
    });
  } finally {
    zipFile.close();
  }
}

export async function updateFromAmo(options = {}) {
  const {
    rootDir = process.cwd(),
    slug = 'youtube-transcript-copy',
    fetchImpl = fetch,
    updatedAt = new Date().toISOString(),
  } = options;

  const addon = await fetchAddonMetadata(slug, fetchImpl);
  const metadata = normalizeAddonMetadata(addon, updatedAt);
  const mirrorPath = path.join(rootDir, '.mirror/amo.json');
  const extensionManifestPath = path.join(rootDir, 'source/extension/manifest.json');
  const existingMetadata = await readJsonIfExists(mirrorPath);

  if (shouldSkipUpdate(existingMetadata, metadata) && await pathExists(extensionManifestPath)) {
    return { ...existingMetadata, changed: false };
  }

  const packageBuffer = await downloadPackage(metadata.fileUrl, fetchImpl);

  verifySha256(packageBuffer, metadata.fileHash);
  await extractXpiBuffer(packageBuffer, path.join(rootDir, 'source/extension'));
  await patchExtractedManifest(extensionManifestPath);

  await mkdir(path.join(rootDir, '.mirror'), { recursive: true });
  await writeFile(mirrorPath, `${JSON.stringify(metadata, null, 2)}\n`);

  const prepend = await readText(path.join(rootDir, 'docs/README.prepend.md'));
  await writeFile(path.join(rootDir, 'README.md'), renderReadme(prepend, metadata));
  await writeFile(path.join(rootDir, 'UPSTREAM.md'), renderUpstreamMarkdown(metadata));

  return { ...metadata, changed: true };
}

async function patchExtractedManifest(manifestPath) {
  const manifest = JSON.parse(await readText(manifestPath));
  await writeFile(manifestPath, `${JSON.stringify(patchManifestForFork(manifest), null, 2)}\n`);
}

async function readText(filePath) {
  const { readFile } = await import('node:fs/promises');
  return readFile(filePath, 'utf8');
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readText(filePath));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function openZipBuffer(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipFile) => {
      if (error) reject(error);
      else resolve(zipFile);
    });
  });
}

function openReadStream(zipFile, entry) {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, readStream) => {
      if (error) reject(error);
      else resolve(Readable.from(readStream));
    });
  });
}
