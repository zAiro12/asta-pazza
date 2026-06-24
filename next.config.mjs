import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');
const projectRoot = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  serverExternalPackages: ['drizzle-orm', '@neondatabase/serverless'],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
