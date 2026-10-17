import type { MetadataRoute } from "next";

/**
 * Web app manifest, served by Next as /manifest.webmanifest.
 * Colours are the Constellation night tokens (--bg #06070d, accent #e9c47e); the light theme colour is
 * set per colour scheme by `viewport.themeColor` in app/layout.tsx, which browsers prefer over this value.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Next Level Builders",
    short_name: "NLB",
    description: "A builder community and product directory for indie hackers and solo founders shipping with AI.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#06070d",
    theme_color: "#06070d",
    lang: "en",
    dir: "ltr",
    categories: ["business", "developer", "productivity", "education"],
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icon-maskable-192.png", type: "image/png", sizes: "192x192", purpose: "maskable" },
      { src: "/icon-maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Directory", url: "/build-with-us" },
      { name: "Courses", url: "/courses" },
      { name: "Blog", url: "/blog" },
    ],
  };
}
