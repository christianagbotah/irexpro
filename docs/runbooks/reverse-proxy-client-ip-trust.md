# Reverse-proxy client IP trust

This runbook defines the client-IP identity boundary for the iRexPro public API.
It applies to the verified single-VPS deployment where public HTTPS terminates at
same-host Nginx and Nginx proxies `/api/v1/` to NestJS over loopback.

## Security invariant

NestJS must trust forwarded client-IP metadata **only** when the immediate TCP
peer is the same-host loopback reverse proxy. The API bootstrap therefore uses
a strict Express `trust proxy` predicate that accepts only:

- `127.0.0.1`
- `::1`
- `::ffff:127.0.0.1`

Public addresses, RFC1918/private addresses, Docker bridge addresses, and all
other peers are untrusted. If such a peer supplies `X-Forwarded-For`, Express
must ignore it when resolving `req.ip`.

This is intentionally stricter than `trust proxy = true`, a numeric hop count,
or trusting all private networks. Those broader settings would make the
security boundary depend on deployment topology and could turn caller-provided
forwarding headers into authentication-throttling or audit identities.

## Nginx contract

For the NestJS API location, Nginx must replace forwarding headers with the
address it observed for the connection:

```nginx
location ^~ /api/v1/ {
    proxy_pass http://irexpro_api;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Do **not** use `$proxy_add_x_forwarded_for` for the API identity boundary. That
variable preserves an incoming `X-Forwarded-For` chain before appending
`$remote_addr`. The verified topology has one application reverse-proxy hop, so
there is no reason for NestJS to receive caller-supplied entries.

The combination is deliberate:

1. Nginx overwrites `X-Forwarded-For` with its server-observed `$remote_addr`.
2. Nginx connects to NestJS from loopback.
3. Express trusts the forwarding header only because the immediate socket peer
   is the loopback Nginx process.
4. Direct/non-proxied requests from other peers cannot make Express honor a
   forged forwarding header.

## Cloudflare deployments

When the public hostname is proxied through Cloudflare, Nginx normally sees a
Cloudflare edge address as `$remote_addr`. In that state, NestJS will correctly
receive the edge address rather than an unverified `CF-Connecting-IP` value.
That is fail-safe against header spoofing, but multiple users can share the
same edge identity for IP-based throttling and audit attribution.

To recover the real end-user address, configure Nginx's real-IP module **only**
with a verified Cloudflare source boundary:

```nginx
# Example shape only — use the current official Cloudflare IPv4/IPv6 networks.
# set_real_ip_from <official Cloudflare CIDR>;
# set_real_ip_from <official Cloudflare CIDR>;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

Operational requirements:

- Populate `set_real_ip_from` only from Cloudflare's current official IP range
  list and keep it maintained as those ranges change.
- Do not enable `real_ip_header CF-Connecting-IP` without the trusted
  `set_real_ip_from` boundary. A directly reachable origin could otherwise
  accept a forged header as the client identity.
- Prefer restricting public origin ingress to Cloudflare networks when the
  deployment is intentionally Cloudflare-only, while preserving the access
  needed for certificate issuance and operations.
- After trusted real-IP processing, Nginx rewrites `$remote_addr` to the
  verified visitor address, and the API proxy's
  `X-Forwarded-For $remote_addr` line passes that single verified address to
  NestJS.

Do not hard-code Cloudflare CIDRs from an old deployment note into application
source. The operator must source and maintain the current official network
list at the Nginx/firewall layer.

## Verification

After changing Nginx configuration:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Verify the API is still reachable only through the intended public proxy and
that the direct NestJS listener remains loopback/private as documented in
`production-deployment-vps-webuzo.md`.

For request attribution, use a non-sensitive test endpoint or controlled test
request and confirm the application-observed IP matches the expected Nginx
`$remote_addr`. Also send a synthetic `X-Forwarded-For` header through the
public Nginx endpoint and confirm it does not replace the server-observed
identity.

## Do not weaken this boundary

Do not change Express to any of the following without a separately reviewed
network-topology change:

- `trust proxy = true`
- a numeric hop count
- all private/RFC1918 networks
- a broad CIDR that includes non-proxy workloads

Do not make application code trust `CF-Connecting-IP`, `X-Real-IP`, or
`X-Forwarded-For` directly. The reverse proxy is responsible for validating and
normalizing upstream network identity before NestJS consumes it.
