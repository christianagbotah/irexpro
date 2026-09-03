import { execFileSync } from 'node:child_process';
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
    regex:
      /(?:-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|-----BEGIN PGP PRIVATE KEY B(?:LOCK)-----)/,
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

const trackedEntries = execFileSync('git', ['ls-files', '--stage', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)
  .map((entry) => {
    const match = /^(\d+) ([0-9a-f]+) \d+\t([\s\S]+)$/.exec(entry);
    if (!match) {
      throw new Error('Unable to parse tracked Git index entry safely.');
    }
    return { mode: match[1], objectId: match[2], file: match[3] };
  });

const findings = [];
let inspectedFiles = 0;
let skippedBinaryFiles = 0;
let skippedOversizedFiles = 0;

for (const { objectId, file } of trackedEntries) {
  if (binaryExtensions.has(extname(file).toLowerCase())) {
    skippedBinaryFiles += 1;
    continue;
  }

  try {
    const size = Number(
      execFileSync('git', ['cat-file', '-s', objectId], { encoding: 'utf8' }).trim(),
    );
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('Git reported an invalid blob size.');
    }
    if (size > MAX_TEXT_FILE_BYTES) {
      skippedOversizedFiles += 1;
      continue;
    }

    // Read the immutable staged Git blob, not the working-tree path. This
    // neither follows symbolic links nor permits a path replacement race.
    const content = execFileSync('git', ['cat-file', 'blob', objectId], {
      encoding: 'utf8',
      maxBuffer: MAX_TEXT_FILE_BYTES + 1,
    });
    inspectedFiles += 1;

    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        findings.push({ file, type: pattern.name });
      }
    }
  } catch {
    console.error(`Unable to inspect tracked Git blob safely: ${file}`);
    process.exit(2);
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

console.log(
  `Tracked-source secret scan passed (${inspectedFiles} blobs inspected; ` +
    `${skippedBinaryFiles} binary and ${skippedOversizedFiles} oversized blobs skipped).`,
);
