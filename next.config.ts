import type { NextConfig } from "next";

const isPages = process.env.DEPLOY_TARGET === "github-pages";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: isPages && repoName ? `/${repoName}` : undefined,
  trailingSlash: true,
};

export default nextConfig;
