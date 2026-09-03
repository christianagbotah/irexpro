import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'check-tracked-artifacts.mjs');

function writeFixture(root, path, content = 'fixture') {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function runFixture(paths) {
  const root = mkdtempSync(join(tmpdir(), 'irexpro-tracked-artifacts-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    for (const path of paths) {
      writeFixture(root, path);
      execFileSync('git', ['add', '--force', '--', path], { cwd: root });
    }
    return spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const allowed = runFixture(['src/index.js', '.env.example', 'docs/public.crt']);
if (allowed.status !== 0) {
  throw new Error(`Allowed fixture failed:\n${allowed.stderr}`);
}

for (const forbidden of [
  'apps/api/.env',
  'apps/api/.env.production',
  'services/ai-engine/app/__pycache__/main.pyc',
  'services/ai-engine/.venv/marker',
  'apps/web/.next/build.json',
  'packages/example.egg-info/PKG-INFO',
  'private/server.key',
]) {
  const result = runFixture(['src/index.js', forbidden]);
  if (result.status === 0 || !result.stderr.includes(forbidden)) {
    throw new Error(`Forbidden fixture was not rejected: ${forbidden}`);
  }
}

console.log('Tracked-artifact hygiene tests passed.');

