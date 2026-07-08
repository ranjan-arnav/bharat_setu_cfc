/** @type {import('next').NextConfig} */
const defaultAllowedOrigins = [
  'localhost:3000',
  '127.0.0.1:3000',
  '*.devtunnels.ms',
  '*.app.github.dev',
  '*.github.dev',
  '*.preview.app.github.dev',
  '*.ngrok-free.app',
  '*.trycloudflare.com',
  '*.loca.lt',
];

const envAllowedOrigins = (process.env.NEXT_SERVER_ACTIONS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  ...defaultAllowedOrigins,
  ...envAllowedOrigins,
]));

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',          // Required for Azure Container Apps / Docker deployment
  experimental: {
    serverActions: {
      allowedOrigins,
    },
    serverComponentsExternalPackages: ['pdfjs-dist', 'pdf-parse'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
};

module.exports = nextConfig;
