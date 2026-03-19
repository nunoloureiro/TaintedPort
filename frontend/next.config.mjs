import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const version = readFileSync(resolve(__dirname, '..', 'VERSION'), 'utf-8').trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    APP_VERSION: version,
  },
};

export default nextConfig;
