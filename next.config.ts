import type { NextConfig } from "next";

// BASE_PATH: vazio por padrão (raiz). O deploy do GitHub Pages builda com
// BASE_PATH=/galaxycut (a URL lá é lucasgabrieldevgg.github.io/galaxycut/).
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
