import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function encodeBase32(input: Buffer): string {
  let bits = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');

  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return output;
}

export function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  if (!normalized || !/^[A-Z2-7]+$/u.test(normalized)) {
    throw new Error('Invalid base32 secret');
  }

  let bits = '';
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateBase32Secret(bytes = 20): string {
  return encodeBase32(randomBytes(bytes));
}

export function generateTotp(
  secret: string,
  timestampMs = Date.now(),
  digits = 6,
  periodSeconds = 30,
): string {
  const counter = Math.floor(timestampMs / 1000 / periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const modulus = 10 ** digits;
  return String(binary % modulus).padStart(digits, '0');
}

export function verifyTotp(
  secret: string,
  candidate: string,
  timestampMs = Date.now(),
  window = 1,
): boolean {
  if (!/^\d{6}$/u.test(candidate)) return false;

  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotp(secret, timestampMs + offset * 30_000, 6, 30);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const candidateBuffer = Buffer.from(candidate, 'utf8');
    if (
      expectedBuffer.length === candidateBuffer.length &&
      timingSafeEqual(expectedBuffer, candidateBuffer)
    ) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri(params: {
  secret: string;
  accountLabel: string;
  issuer?: string;
}): string {
  const issuer = params.issuer ?? 'iRexPro';
  const label = `${issuer}:${params.accountLabel}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}
