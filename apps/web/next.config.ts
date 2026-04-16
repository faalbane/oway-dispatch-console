import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // StrictMode disabled because react-leaflet v4 holds Leaflet state on the
  // DOM node — StrictMode's intentional double-mount in dev triggers
  // "Map container is already initialized." Production builds aren't affected.
  // Re-enable once react-leaflet v5 (React 19 native) ships.
  reactStrictMode: false,
  // Transpile our shared workspace package (TS source, no build step)
  transpilePackages: ['@oway/shared'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
