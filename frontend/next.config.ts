import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    return [
      {
        // El navegador usa el mismo origen de la plataforma. Next reenvía la
        // solicitud al backend local sin depender de que la red permita 3001.
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3001/:path*',
      },
    ];
  },
  devIndicators: {
    position: 'bottom-right',
  },
};

export default nextConfig;
