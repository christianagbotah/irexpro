/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the shared workspace packages so they ship as raw TypeScript
  // source and are compiled by Next.js alongside the app.
  transpilePackages: ['@irexpro/types', '@irexpro/api-client'],
  // The web app and API are served from the same domain in staging; the API is
  // at /api/v1/ proxied by Nginx to the NestJS backend on 127.0.0.1:3010.
  // The frontend never calls the AI engine (it is internal-only).
};

export default nextConfig;
