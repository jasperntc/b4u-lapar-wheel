import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML in out/, served by Cloudflare Workers static assets.
  output: "export",
  // Mounted at built4you.jasperntc.dev/lapar-wheel by a Worker route.
  basePath: "/lapar-wheel",
  // No image optimizer without a server.
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
