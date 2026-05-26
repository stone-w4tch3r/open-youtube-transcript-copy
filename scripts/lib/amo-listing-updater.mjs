import crypto, { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const AMO_API = 'https://addons.mozilla.org/api/v5';
const LISTING_PATH = '.amo-listing.json';
const MANIFEST_PATH = 'source/extension/manifest.json';
const LISTING_ASSETS_MANIFEST_PATH = 'assets/amo-listing/manifest.json';

export async function updateAmoListing(options = {}) {
  const {
    rootDir = process.cwd(),
    apiKey = process.env.WEB_EXT_API_KEY,
    apiSecret = process.env.WEB_EXT_API_SECRET,
    fetchImpl = fetch,
  } = options;

  if (!apiKey || !apiSecret) {
    throw new Error('WEB_EXT_API_KEY and WEB_EXT_API_SECRET must be set.');
  }

  const manifest = await readJson(path.join(rootDir, MANIFEST_PATH));
  const guid = manifest.browser_specific_settings?.gecko?.id;

  if (!guid) {
    throw new Error('Manifest is missing browser_specific_settings.gecko.id');
  }

  const desired = await readJson(path.join(rootDir, LISTING_PATH));
  const assetsManifest = await readJsonIfExists(path.join(rootDir, LISTING_ASSETS_MANIFEST_PATH));
  const auth = { apiKey, apiSecret };

  let current;
  try {
    current = await fetchAMOJson(`/addons/addon/${encodeURIComponent(guid)}/`, auth, fetchImpl);
  } catch (error) {
    if (error.status === 404) {
      return { skipped: true, reason: 'add-on not found', patchKeys: [], media: emptyMediaResult() };
    }
    throw error;
  }

  const patch = diffListing(current, desired);
  const patchKeys = Object.keys(patch);

  if (patchKeys.length > 0) {
    await fetchAMOJson(`/addons/addon/${encodeURIComponent(guid)}/`, auth, fetchImpl, 'PATCH', patch);
  }

  const media = assetsManifest
    ? await syncListingMedia({
      assetsDir: path.join(rootDir, 'assets/amo-listing'),
      assetsManifest,
      current,
      fetchImpl,
      guid,
      auth,
    })
    : emptyMediaResult();

  return { skipped: false, patchKeys, media };
}

export function diffListing(current, desired) {
  const patch = {};

  for (const [key, desiredValue] of Object.entries(desired)) {
    const currentValue = normalizeCurrentValue(key, current[key]);
    const wantedValue = normalizeDesiredValue(key, desiredValue);

    if (deepEqual(currentValue, wantedValue)) continue;
    if (isEmptyTranslated(wantedValue)) continue;

    patch[key] = wantedValue;
  }

  return patch;
}

async function syncListingMedia(options) {
  const { assetsDir, assetsManifest, current, fetchImpl, guid, auth } = options;
  const result = emptyMediaResult();
  const addonPath = `/addons/addon/${encodeURIComponent(guid)}/`;

  if (assetsManifest.icon) {
    const currentIconUrl = current.icons?.['128'] ?? current.icons?.[128] ?? current.icon_url;
    const currentIconHash = currentIconUrl ? await downloadSha256(currentIconUrl, fetchImpl) : null;
    if (currentIconHash !== assetsManifest.icon.sha256) {
      await fetchAMOForm(addonPath, auth, fetchImpl, 'PATCH', {
        icon: path.join(assetsDir, assetsManifest.icon.path),
      });
      result.iconUploaded = true;
    }
  }

  const desiredPreviews = [...(assetsManifest.previews ?? [])].sort((a, b) => a.position - b.position);
  const desiredPositions = new Set(desiredPreviews.map((preview) => preview.position));
  const currentByPosition = new Map((current.previews ?? []).map((preview) => [preview.position, preview]));

  for (const currentPreview of current.previews ?? []) {
    if (!desiredPositions.has(currentPreview.position)) {
      await fetchAMOJson(`${addonPath}previews/${currentPreview.id}/`, auth, fetchImpl, 'DELETE');
      result.previewsDeleted += 1;
    }
  }

  for (const desiredPreview of desiredPreviews) {
    const currentPreview = currentByPosition.get(desiredPreview.position);
    const currentHash = currentPreview?.image_url ? await downloadSha256(currentPreview.image_url, fetchImpl) : null;

    if (currentHash !== desiredPreview.sha256) {
      if (currentPreview) {
        await fetchAMOJson(`${addonPath}previews/${currentPreview.id}/`, auth, fetchImpl, 'DELETE');
        result.previewsDeleted += 1;
      }

      const created = await fetchAMOForm(`${addonPath}previews/`, auth, fetchImpl, 'POST', {
        image: path.join(assetsDir, desiredPreview.path),
      });

      if (!created.id) {
        throw new Error('AMO preview upload response did not include an id.');
      }

      await patchPreviewMetadata(addonPath, auth, fetchImpl, created.id, desiredPreview);
      result.previewsUploaded += 1;
      continue;
    }

    if (!deepEqual(normalizePreviewCaption(currentPreview.caption), desiredPreview.caption)) {
      await patchPreviewMetadata(addonPath, auth, fetchImpl, currentPreview.id, desiredPreview);
      result.previewsUpdated += 1;
    }
  }

  return result;
}

function patchPreviewMetadata(addonPath, auth, fetchImpl, previewId, desiredPreview) {
  return fetchAMOJson(`${addonPath}previews/${previewId}/`, auth, fetchImpl, 'PATCH', {
    caption: desiredPreview.caption,
    position: desiredPreview.position,
  });
}

function emptyMediaResult() {
  return {
    iconUploaded: false,
    previewsDeleted: 0,
    previewsUploaded: 0,
    previewsUpdated: 0,
  };
}

function normalizeCurrentValue(key, value) {
  if (key === 'contributions_url') {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object') return value.url ?? null;
    return value;
  }

  if (key === 'homepage' || key === 'support_email') {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return { 'en-US': value };
    if (typeof value === 'object' && value !== null) return value;
    return null;
  }

  if (key === 'categories') {
    if (value === null || value === undefined) return {};
    return value;
  }

  if (key === 'tags') {
    if (!Array.isArray(value)) return [];
    return [...value].sort();
  }

  return value ?? null;
}

function normalizeDesiredValue(key, value) {
  if (key === 'contributions_url') {
    return value === '' || value === null ? null : value;
  }

  if (key === 'categories') {
    return value ?? {};
  }

  if (key === 'tags') {
    if (!Array.isArray(value)) return [];
    return [...value].sort();
  }

  return value ?? null;
}

function normalizePreviewCaption(caption) {
  if (caption && typeof caption === 'object') return caption;
  return caption ? { 'en-US': caption } : { 'en-US': '' };
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isEmptyTranslated(value) {
  if (typeof value !== 'object' || value === null) return false;
  return Object.keys(value).length > 0 && Object.values(value).every((v) => v === '' || v === null);
}

export function createJWT(issuer, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuer, iat: now, exp: now + 300, jti: crypto.randomUUID() };
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');
  return `${b64Header}.${b64Payload}.${signature}`;
}

async function fetchAMOJson(amoPath, auth, fetchImpl, method = 'GET', body) {
  const options = {
    method,
    auth,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  return fetchAMO(amoPath, options, fetchImpl);
}

async function fetchAMOForm(amoPath, auth, fetchImpl, method, files) {
  const form = new FormData();

  for (const [field, filePath] of Object.entries(files)) {
    const buffer = await readFile(filePath);
    form.append(field, new Blob([buffer], { type: mimeType(filePath) }), path.basename(filePath));
  }

  return fetchAMO(amoPath, {
    method,
    auth,
    headers: {},
    body: form,
  }, fetchImpl);
}

async function fetchAMO(amoPath, options, fetchImpl) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const requestOptions = {
      ...options,
      headers: {
        ...options.headers,
        Authorization: authHeader(options.auth),
      },
    };
    delete requestOptions.auth;

    const response = await fetchImpl(`${AMO_API}${amoPath}`, requestOptions);
    if (response.ok) {
      if (options.method === 'DELETE') return {};
      return response.json();
    }

    const text = await response.text();
    const error = new Error(`AMO API ${options.method} ${amoPath} failed: ${response.status} ${text}`);
    error.status = response.status;

    if (response.status === 429 || response.status >= 500) {
      lastError = error;
      const delay = retryDelayMs(response, text, attempt);
      console.warn(`AMO API ${options.method} ${amoPath} returned ${response.status}; retrying in ${Math.ceil(delay / 1000)} seconds.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    throw error;
  }

  throw lastError;
}

function authHeader(auth) {
  return `JWT ${createJWT(auth.apiKey, auth.apiSecret)}`;
}

export function retryDelayMs(response, text, attempt) {
  const retryAfter = Number(response.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;

  const match = text.match(/Expected available in (\d+) seconds/i);
  if (match) return Number(match[1]) * 1000;

  return attempt * 1000;
}

async function downloadSha256(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to download current AMO media for comparison: ${response.status} ${response.statusText}`);
  }
  return sha256(Buffer.from(await response.arrayBuffer()));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  return 'image/png';
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read or parse ${path.relative(process.cwd(), filePath)}: ${error.message}`);
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Failed to read or parse ${path.relative(process.cwd(), filePath)}: ${error.message}`);
  }
}
