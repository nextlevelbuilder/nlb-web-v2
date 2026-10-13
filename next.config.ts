import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// `next dev` gets the D1/KV/R2 bindings from wrangler.jsonc (local Miniflare state in .wrangler/).
if (process.env.NODE_ENV === "development") {
  void initOpenNextCloudflareForDev();
}

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    formats: ["image/webp", "image/avif"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/discord",
        destination: "https://discord.com/invite/Ht4sb7Wjnx",
        permanent: false,
      },
      {
        source: "/directory",
        destination: "/build-with-us",
        permanent: true,
      },
      {
        source: "/:locale/directory",
        destination: "/:locale/build-with-us",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
