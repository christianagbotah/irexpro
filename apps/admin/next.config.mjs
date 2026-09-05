/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@irexpro/types', '@irexpro/api-client'],
};

export default nextConfig;
