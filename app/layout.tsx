import { Be_Vietnam_Pro, Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { getLocale } from "next-intl/server";
import { siteUrl, serializeJsonLd } from "@/lib/seo";
import { ThemeProvider } from "@/components/theme-provider";
import GoogleAnalyticsConsentAware from "@/components/analytics/google-analytics-consent-aware";
import { X_HANDLE } from "@/lib/constants/socials";
import { siteGraphJsonLd } from "@/lib/structured-data";
import "./globals.css";
import "./constellation-shell.css";
import "./constellation-components.css";

// Every family ships the `vietnamese` subset so VI diacritics render in the brand faces.
const display = Cormorant_Garamond({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const DESCRIPTION =
  "Next Level Builders is a community of 500+ builders who ship real products: weekly build videos, a hand-reviewed product Directory with a Trust Passport, and a private Discord.";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06070d" },
    { media: "(prefers-color-scheme: light)", color: "#efe7d6" },
  ],
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Next Level Builders — Every product starts as a single point of light",
    template: "%s | Next Level Builders",
  },
  description: DESCRIPTION,
  keywords: ["micro saas", "indie hacker", "solo founder", "builder community", "discord", "ai automation", "product directory", "build in public"],
  authors: [{ name: "Next Level Builders", url: "https://nextlevelbuilder.io" }],
  creator: "Next Level Builders",
  publisher: "Next Level Builders",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: {
    // The SVG follows prefers-color-scheme (gold star at night, vermillion on paper); the ICO covers 16/32/48.
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["vi_VN"],
    url: "https://nextlevelbuilder.io",
    siteName: "Next Level Builders",
    title: "Next Level Builders — Find your constellation",
    description: DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 673, alt: "Next Level Builders", type: "image/png" }],
  },
  twitter: {
    card: "summary_large_image",
    site: `@${X_HANDLE}`,
    creator: `@${X_HANDLE}`,
    title: "Next Level Builders — Find your constellation",
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
  category: "technology",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    // suppressHydrationWarning: next-themes sets data-theme on <html> before hydration.
    // The font variables live on <html> so the :root design tokens (--f-display …) can resolve them.
    <html lang={locale} className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="AI index" />
        <link rel="alternate" type="text/plain" href="/llms-full.txt" title="AI full context" />
        <link rel="service-desc" type="application/vnd.oai.openapi+json" href="/api/openapi.json" title="NLB REST API (OpenAPI)" />
        <link rel="alternate" type="application/json" href="/.well-known/mcp.json" title="MCP server discovery" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteGraphJsonLd(locale)) }} />
      </head>
      <body className="font-sans">
        <ThemeProvider>{children}</ThemeProvider>
        <GoogleAnalyticsConsentAware />
      </body>
    </html>
  );
}
