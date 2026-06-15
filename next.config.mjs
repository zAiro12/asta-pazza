/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['drizzle-orm', '@neondatabase/serverless'],
  },
};

export default nextConfig;
