import { buildOtpAuthUri, decodeBase32, encodeBase32, generateTotp, verifyTotp } from './totp.util';

describe('TOTP utilities', () => {
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it.each([
    [59_000, '94287082'],
    [1_111_111_109_000, '07081804'],
    [1_111_111_111_000, '14050471'],
    [1_234_567_890_000, '89005924'],
    [2_000_000_000_000, '69279037'],
    [20_000_000_000_000, '65353130'],
  ])('matches RFC 6238 SHA-1 vector at %i ms', (timestampMs, expected) => {
    expect(generateTotp(rfcSecret, timestampMs, 8, 30)).toBe(expected);
  });

  it('accepts a valid 6-digit challenge only inside the configured time window', () => {
    const timestamp = 1_700_000_000_000;
    const code = generateTotp(rfcSecret, timestamp);

    expect(verifyTotp(rfcSecret, code, timestamp)).toBe(true);
    expect(verifyTotp(rfcSecret, code, timestamp + 30_000)).toBe(true);
    expect(verifyTotp(rfcSecret, code, timestamp - 30_000)).toBe(true);
    expect(verifyTotp(rfcSecret, code, timestamp + 60_000)).toBe(false);
    expect(verifyTotp(rfcSecret, '12345', timestamp)).toBe(false);
    expect(verifyTotp(rfcSecret, 'abcdef', timestamp)).toBe(false);
  });

  it('round-trips base32 without exposing padding requirements', () => {
    const source = Buffer.from('12345678901234567890', 'utf8');
    const encoded = encodeBase32(source);
    expect(encoded).toBe(rfcSecret);
    expect(decodeBase32(encoded)).toEqual(source);
  });

  it('builds a standards-compatible otpauth URI without unrelated parameters', () => {
    const uri = buildOtpAuthUri({
      secret: rfcSecret,
      accountLabel: 'user@example.com',
      issuer: 'iRexPro',
    });
    const parsed = new URL(uri);

    expect(parsed.protocol).toBe('otpauth:');
    expect(parsed.hostname).toBe('totp');
    expect(parsed.searchParams.get('secret')).toBe(rfcSecret);
    expect(parsed.searchParams.get('issuer')).toBe('iRexPro');
    expect(parsed.searchParams.get('digits')).toBe('6');
    expect(parsed.searchParams.get('period')).toBe('30');
  });
});
