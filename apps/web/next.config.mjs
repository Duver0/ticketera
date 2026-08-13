import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ticketera/types'],
  // El lint se ejecuta aparte; no queremos que reglas de lint bloqueen el build
  // de producción (el type-check de TS sí corre y debe estar en verde).
  eslint: {ignoreDuringBuilds: true},
  // Se eligen DOS proyectos Vercel (ver docs/architecture.md). El API no vive
  // bajo /api de Next; el Web lo consume vía NEXT_PUBLIC_API_URL a través del
  // proxy same-origin en src/app/api/proxy.
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

export default nextConfig;
