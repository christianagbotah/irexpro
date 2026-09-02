import { execFileSync } from 'node:child_process';
import { closeSync, fstatSync, openSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const binaryExtensions = new Set([
  '.7z',
  '.avi',
  '.bin',
  '.bmp',
  '.bz2',
  '.db',
  '.doc',
  '.docx',
  '.eot',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.sqlite',
  '.tar',
  '.tgz',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.xls',
  '.xlsx',
  '.zip',
]);

const patterns = [
  {
    name: 'private key material',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: 'AWS access key id',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: 'GitHub fine-grained token',
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/,
  },
  {
    name: 'GitHub token',
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/,
  },
  {
    name: 'Google API key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    name: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  },
  {
    name: 'Stripe live secret',
    regex: /\bsk_live_[A-Za-z0-9]{20,}\b/,
  },
  {
    name: 'Paystack live secret',
    regex: /\bsk_live_[A-Za-z0-9]{30,}\b/,
  },
];

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

const findings = [];

for (const file of trackedFiles) {
  if (binaryExtensions.has(extname(file).toLowerCase())) {
    continue;
  }

  let descriptor;
  let content;

  try {
    descriptor = openSync(file, 'r');

    // Inspect and read the same opened object so a path replacement cannot
    // create a check/use race between the size check and the content scan.
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size > MAX_TEXT_FILE_BYTES) {
      continue;
    }

    content = readFileSync(descriptor, 'utf8');
  } catch {
    continue;
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }

  for (const pattern of patterns) {
    if (pattern.regex.test(content)) {
      findings.push({ file, type: pattern.name });
    }
  }
}

if (findings.length > 0) {
  console.error('Potential committed secret material detected.');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.type}`);
  }
  console.error('No secret value is printed. Remove or rotate the credential before release.');
  process.exit(1);
}

console.log(`Tracked-source secret scan passed (${trackedFiles.length} files inspected).`);
