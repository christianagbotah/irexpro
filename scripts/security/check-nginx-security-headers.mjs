import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const nginxPath = fileURLToPath(
  new URL('../../infrastructure/nginx/irexpro-staging.example.conf', import.meta.url),
);
const source = readFileSync(nginxPath, 'utf8');
const activeDirectives = source.replace(/#.*$/gm, '');

const HSTS = 'add_header Strict-Transport-Security "max-age=31536000" always;';
const REQUIRED_STATIC_HEADERS = [
  HSTS,
  'add_header X-Content-Type-Options "nosniff" always;',
  'add_header X-Frame-Options "SAMEORIGIN" always;',
  'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
  'add_header Cache-Control "public, immutable";',
];

function fail(message) {
  console.error(`Nginx security policy failed: ${message}`);
  process.exitCode = 1;
}

function extractBlocks(text, opening) {
  const blocks = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(opening, cursor);
    if (start === -1) break;

    const braceStart = text.indexOf('{', start);
    if (braceStart === -1) {
      fail(`malformed block opening: ${opening}`);
      return blocks;
    }

    let depth = 0;
    let end = -1;
    for (let index = braceStart; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      if (text[index] === '}') depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }

    if (end === -1) {
      fail(`unterminated block opening: ${opening}`);
      return blocks;
    }

    blocks.push(text.slice(start, end));
    cursor = end;
  }

  return blocks;
}

if (/\bincludeSubDomains\b/i.test(activeDirectives)) {
  fail('includeSubDomains must not be enabled without separate operational validation');
}
if (/\bpreload\b/i.test(activeDirectives)) {
  fail('HSTS preload must not be enabled without separate operational validation');
}

const httpsServers = extractBlocks(source, 'server {').filter((block) =>
  block.includes('listen 443 ssl http2;'),
);

if (httpsServers.length !== 2) {
  fail(`expected exactly 2 HTTPS server blocks, found ${httpsServers.length}`);
}

for (const block of httpsServers) {
  if (!block.includes(HSTS)) {
    fail('every HTTPS server block must emit the hostname-scoped HSTS policy');
  }
}

const apiLocations = extractBlocks(activeDirectives, 'location ^~ /api/v1/ {');
if (apiLocations.length !== 1) {
  fail(`expected exactly 1 public API location, found ${apiLocations.length}`);
} else {
  const bodyLimitDirectives = [
    ...apiLocations[0].matchAll(/\bclient_max_body_size\s+([^;]+);/g),
  ];

  if (bodyLimitDirectives.length !== 1) {
    fail(`expected exactly 1 API client_max_body_size directive, found ${bodyLimitDirectives.length}`);
  } else if (bodyLimitDirectives[0][1].trim() !== '100k') {
    fail(`public API client_max_body_size must remain 100k, found ${bodyLimitDirectives[0][1].trim()}`);
  }
}

const staticLocations = extractBlocks(source, 'location ^~ /_next/static/ {');
if (staticLocations.length !== 2) {
  fail(`expected exactly 2 Next.js static locations, found ${staticLocations.length}`);
}

for (const block of staticLocations) {
  for (const header of REQUIRED_STATIC_HEADERS) {
    if (!block.includes(header)) {
      fail(`static location is missing required header: ${header}`);
    }
  }
}

if (!process.exitCode) {
  console.log('Nginx transport-security and API boundary policy passed.');
}
