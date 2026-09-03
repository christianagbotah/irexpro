import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scannerPath = join(dirname(fileURLToPath(import.meta.url)), 'scan-tracked-secrets.mjs');

function runFixture(content) {
  const root = mkdtempSync(join(tmpdir(), 'irexpro-secret-scan-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    mkdirSync(join(root, 'fixtures'), { recursive: true });
    writeFileSync(join(root, 'fixtures', 'candidate.txt'), content);
    execFileSync('git', ['add', 'fixtures/candidate.txt'], { cwd: root });
    return spawnSync(process.execPath, [scannerPath], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const clean = runFixture('CHANGE_ME_TO_LONG_RANDOM_SECRET_IN_DEV');
if (clean.status !== 0) {
  throw new Error(`Safe placeholder fixture failed:\n${clean.stderr}`);
}

const fixtures = [
  ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
  ['-----BEGIN RSA ', 'PRIVATE KEY-----'].join(''),
  ['-----BEGIN EC ', 'PRIVATE KEY-----'].join(''),
  ['-----BEGIN OPENSSH ', 'PRIVATE KEY-----'].join(''),
  ['-----BEGIN ENCRYPTED ', 'PRIVATE KEY-----'].join(''),
  ['-----BEGIN PGP PRIVATE KEY ', 'BLOCK-----'].join(''),
  `AKIA${'A'.repeat(16)}`,
  `github_pat_${'A'.repeat(24)}`,
  `ghp_${'A'.repeat(36)}`,
  `AIza${'A'.repeat(35)}`,
  `xoxb-${'A'.repeat(24)}`,
  `sk_live_${'A'.repeat(32)}`,
];

for (const secretValue of fixtures) {
  const result = runFixture(`prefix ${secretValue} suffix`);
  if (result.status === 0) {
    throw new Error('A representative secret fixture was not rejected.');
  }
  if (result.stderr.includes(secretValue)) {
    throw new Error('Scanner output exposed the detected secret value.');
  }
  if (!result.stderr.includes('fixtures/candidate.txt')) {
    throw new Error('Scanner output did not identify the affected path.');
  }
}

// A tracked symlink must be inspected as its immutable Git blob (the link
// target text), never followed into an external working-tree file.
{
  const root = mkdtempSync(join(tmpdir(), 'irexpro-secret-symlink-'));
  const external = join(root, 'external-secret.txt');
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    writeFileSync(external, ['-----BEGIN ', 'PRIVATE KEY-----'].join(''));
    symlinkSync(external, join(root, 'tracked-link'));
    execFileSync('git', ['add', 'tracked-link'], { cwd: root });
    const result = spawnSync(process.execPath, [scannerPath], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error('Scanner followed a tracked symlink instead of reading its Git blob.');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log('Tracked-source secret scanner tests passed.');
