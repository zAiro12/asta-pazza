/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['drizzle-orm', '@neondatabase/serverless'],
};

export default nextConfig;
