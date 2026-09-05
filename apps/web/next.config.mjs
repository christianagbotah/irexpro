/** @type {import('next').NextConfig} */
const browserSecurityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Transpile the shared workspace packages so they ship as raw TypeScript
  // source and are compiled by Next.js alongside the app.
  transpilePackages: ['@irexpro/types', '@irexpro/api-client'],
  // Keep this initial CSP deliberately narrow. Resource-loading directives
  // belong in a separately validated policy because broker, payment, realtime,
  // analytics, and future mobile/deep-link integrations may need explicit
  // origins. These directives harden document embedding/base/object behavior
  // without changing the app's current script/style/connect loading contract.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: browserSecurityHeaders,
      },
    ];
  },
  // The web app and API are served from the same domain in staging; the API is
  // at /api/v1/ proxied by Nginx to the NestJS backend on 127.0.0.1:3010.
  // The frontend never calls the AI engine (it is internal-only).
};

export default nextConfig;
