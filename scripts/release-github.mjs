#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(await readFile('source/extension/manifest.json', 'utf8'));
const tag = `v${manifest.version}`;

const distFiles = await readdir('dist');
const xpiFiles = distFiles.filter((f) => f.endsWith('.xpi')).sort();
const xpiFile = xpiFiles[xpiFiles.length - 1];
const artifact = xpiFile ? `dist/${xpiFile}` : `dist/open-youtube-transcript-copy-${manifest.version}.zip`;

const title = `open-youtube-transcript-copy ${tag}`;
  const signedNote = xpiFile
    ? 'Signed by Mozilla AMO (listed channel). Installable from the Firefox Add-ons store or via "Install Add-on From File" in about:addons.'
    : 'Unsigned development build. Not installable in Firefox Release/Beta without add-on signing disabled.';

const notes = `${signedNote}\n\nBuilt from the open-youtube-transcript-copy source tree for extension version ${manifest.version}.\n\nSee UPSTREAM.md for AMO package provenance.`;

if (run('gh', ['release', 'view', tag], { allowFailure: true }).status === 0) {
  run('gh', ['release', 'upload', tag, artifact, '--clobber']);
  console.log(`Updated GitHub release ${tag} with ${artifact}.`);
} else {
  run('gh', ['release', 'create', tag, artifact, '--title', title, '--notes', notes]);
  console.log(`Created GitHub release ${tag} with ${artifact}.`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.allowFailure ? 'pipe' : 'inherit',
  });

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
  }

  return result;
}
