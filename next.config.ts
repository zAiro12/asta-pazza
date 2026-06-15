import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Socket.io richiede un custom server in produzione
  // Per ora le API routes gestiscono la logica di gioco
  experimental: {
    serverComponentsExternalPackages: ['drizzle-orm', '@neondatabase/serverless'],
  },
};

export default nextConfig;
