import { isTrustedReverseProxy } from './proxy-trust';

describe('isTrustedReverseProxy', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'trusts the verified loopback proxy representation %s',
    (ip) => {
      expect(isTrustedReverseProxy(ip)).toBe(true);
    },
  );

  it.each([
    '127.0.0.2',
    '10.0.0.1',
    '172.17.0.1',
    '192.168.1.10',
    '203.0.113.10',
    '2001:db8::10',
    '',
  ])('rejects non-proxy peer %s', (ip) => {
    expect(isTrustedReverseProxy(ip)).toBe(false);
  });
});
