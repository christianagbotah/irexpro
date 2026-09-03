import { execFileSync } from 'node:child_process';
import { basename, extname } from 'node:path';

const forbiddenDirectoryNames = new Set([
  '.cache',
  '.next',
  '.turbo',
  '.venv',
  '__pycache__',
  'coverage',
  'dist',
  'node_modules',
  'venv',
]);

const forbiddenExtensions = new Set(['.key', '.log', '.p12', '.pfx', '.pyc', '.pyo']);

function classifyForbiddenArtifact(file) {
  const normalized = file.replaceAll('\\', '/');
  const segments = normalized.split('/');
  const name = basename(normalized);
  const lowerName = name.toLowerCase();

  if (lowerName === '.env' || (lowerName.startsWith('.env.') && lowerName !== '.env.example')) {
    return 'runtime environment file';
  }

  const forbiddenDirectory = segments.find(
    (segment) => forbiddenDirectoryNames.has(segment) || segment.endsWith('.egg-info'),
  );
  if (forbiddenDirectory) {
    return `generated directory (${forbiddenDirectory})`;
  }

  const extension = extname(lowerName);
  if (forbiddenExtensions.has(extension)) {
    return `forbidden generated or secret-bearing extension (${extension})`;
  }

  return null;
}

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const findings = trackedFiles
  .map((file) => ({ file, type: classifyForbiddenArtifact(file) }))
  .filter((finding) => finding.type !== null);

if (findings.length > 0) {
  console.error('Forbidden generated or secret-bearing artifacts are tracked.');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.type}`);
  }
  console.error('Remove these paths from Git tracking before release.');
  process.exit(1);
}

console.log(`Tracked-artifact hygiene check passed (${trackedFiles.length} paths inspected).`);

