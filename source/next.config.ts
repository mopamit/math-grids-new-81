import type { NextConfig } from "next";

const repositoryName = "math-grids-81";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Keep the same build configuration as the last package confirmed to work
  // on the real GitHub Pages repository. The release step converts this path
  // to the proven relative `assets/static` layout.
  basePath: `/${repositoryName}`,
};

export default nextConfig;
