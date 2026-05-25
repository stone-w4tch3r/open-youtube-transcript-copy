#!/usr/bin/env node
import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const manifest = JSON.parse(await readFile('source/extension/manifest.json', 'utf8'));
const artifactName = `open-youtube-transcript-copy-${manifest.version}.zip`;

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await run('zip', ['-r', `../../dist/${artifactName}`, '.', '-x', '.amo-upload-uuid'], { cwd: 'source/extension' });

console.log(`Built dist/${artifactName}`);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
