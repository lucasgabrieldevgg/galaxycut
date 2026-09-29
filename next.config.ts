import type { NextConfig } from "next";

// BASE_PATH: vazio por padrão (raiz — é assim que o site roda na Vercel,
// em https://galaxycut.vercel.app). Só preencha se for hospedar em subpasta.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
