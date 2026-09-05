import { parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins', () => {
  it('uses the localhost development origin when the environment value is absent', () => {
    expect(parseCorsOrigins()).toEqual(['http://localhost:3001']);
  });

  it('canonicalizes whitespace and harmless trailing slashes across multiple origins', () => {
    expect(
      parseCorsOrigins(
        ' https://irexpro.lightworldtech.com/ , https://admin.irexpro.lightworldtech.com ',
      ),
    ).toEqual(['https://irexpro.lightworldtech.com', 'https://admin.irexpro.lightworldtech.com']);
  });

  it('deduplicates equivalent canonical origins while preserving order', () => {
    expect(
      parseCorsOrigins(
        'https://example.com,https://example.com/,https://example.com:443,http://localhost:3001',
      ),
    ).toEqual(['https://example.com', 'http://localhost:3001']);
  });

  it('preserves explicit non-default ports in the canonical origin', () => {
    expect(parseCorsOrigins('https://example.com:8443')).toEqual(['https://example.com:8443']);
  });

  it.each([
    '',
    '   ',
    'https://example.com,',
    ',https://example.com',
    'https://example.com,,https://admin.example.com',
    'not a url',
    'null',
    'ftp://example.com',
    'https://example.com/path',
    'https://example.com?query=1',
    'https://example.com/#fragment',
    'https://user:password@example.com',
    'https://*.example.com',
  ])('fails closed for invalid CORS origin configuration: %j', (value) => {
    expect(() => parseCorsOrigins(value)).toThrow(/^Invalid CORS_ORIGINS entry at position \d+$/);
  });

  it('does not copy a rejected configured value into the error message', () => {
    const secretLikeCredential = 'https://user:sensitive-value@example.com';

    try {
      parseCorsOrigins(secretLikeCredential);
      throw new Error('Expected parser to reject credential-bearing origin');
    } catch (error) {
      expect((error as Error).message).not.toContain('sensitive-value');
      expect((error as Error).message).toBe('Invalid CORS_ORIGINS entry at position 1');
    }
  });
});
