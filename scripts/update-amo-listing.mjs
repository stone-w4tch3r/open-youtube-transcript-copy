#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const LISTING_PATH = '.amo-listing.json';
const MANIFEST_PATH = 'source/extension/manifest.json';
const AMO_API = 'https://addons.mozilla.org/api/v5';

const apiKey = process.env.WEB_EXT_API_KEY;
const apiSecret = process.env.WEB_EXT_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error('WEB_EXT_API_KEY and WEB_EXT_API_SECRET must be set.');
  process.exitCode = 1;
  process.exit(1);
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const guid = manifest.browser_specific_settings?.gecko?.id;

if (!guid) {
  throw new Error('Manifest is missing browser_specific_settings.gecko.id');
}

const desired = JSON.parse(await readFile(LISTING_PATH, 'utf8'));

const jwt = createJWT(apiKey, apiSecret);

let current;
try {
  current = await fetchAMO(`/addons/addon/${encodeURIComponent(guid)}/`, jwt);
} catch (err) {
  if (err.status === 404) {
    console.log(`Add-on ${guid} not found on AMO. Skipping listing update (add-on not yet created).`);
    process.exit(0);
  }
  throw err;
}

const patch = diffListing(current, desired);

if (Object.keys(patch).length === 0) {
  console.log('AMO listing already in sync. Nothing to update.');
  process.exit(0);
}

await fetchAMO(`/addons/addon/${encodeURIComponent(guid)}/`, jwt, 'PATCH', patch);
console.log('AMO listing updated:', Object.keys(patch).join(', '));

function diffListing(current, desired) {
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

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isEmptyTranslated(value) {
  if (typeof value !== 'object' || value === null) return false;
  return Object.keys(value).length > 0 && Object.values(value).every((v) => v === '' || v === null);
}

function createJWT(issuer, secret) {
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

async function fetchAMO(path, jwt, method = 'GET', body) {
  const opts = {
    method,
    headers: { Authorization: `JWT ${jwt}`, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${AMO_API}${path}`, opts);
    if (res.ok) return res.json();

    const text = await res.text();
    const err = new Error(`AMO API ${method} ${path} failed: ${res.status} ${text}`);
    err.status = res.status;

    if (res.status === 429 || res.status >= 500) {
      lastErr = err;
      const delay = attempt * 1000;
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    throw err;
  }

  throw lastErr;
}
