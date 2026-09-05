const TRUSTED_LOOPBACK_PROXY_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Express `trust proxy` predicate for the verified single-VPS topology.
 *
 * The public API is reverse-proxied by same-host Nginx to the NestJS listener.
 * Only an immediate loopback socket peer may supply client-IP forwarding
 * metadata. Direct/public/private-network peers remain untrusted, so arbitrary
 * X-Forwarded-For headers from those peers are ignored by Express.
 */
export function isTrustedReverseProxy(ip: string): boolean {
  return TRUSTED_LOOPBACK_PROXY_ADDRESSES.has(ip);
}
