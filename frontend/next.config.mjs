import { readFileSync } from 'fs';
import { resolve } from 'path';

const version = readFileSync(resolve(import.meta.dirname, '..', 'VERSION'), 'utf-8').trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    APP_VERSION: version,
  },
};

export default nextConfig;
