import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
  '-----BEGIN PRIVATE KEY-----',
  '-----BEGIN RSA PRIVATE KEY-----',
  '-----BEGIN EC PRIVATE KEY-----',
  '-----BEGIN OPENSSH PRIVATE KEY-----',
  '-----BEGIN ENCRYPTED PRIVATE KEY-----',
  '-----BEGIN PGP PRIVATE KEY BLOCK-----',
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

console.log('Tracked-source secret scanner tests passed.');

