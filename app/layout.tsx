import { Inter, Bricolage_Grotesque } from "next/font/google";
import type { Metadata } from "next";
import Script from "next/script";
import { getLocale } from "next-intl/server";
import { siteUrl, serializeJsonLd } from "@/lib/seo";
import "./globals.css";
import "./headings.css";

const GA_MEASUREMENT_ID = "G-MJ62DM021G";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Next Level Builders | Premium Discord Community for Micro SaaS Builders",
    template: "%s | Next Level Builders",
  },
  description: "Join 500+ solo-founders building profitable micro-SaaS products. Get access to proven playbooks, recorded sessions, and a supportive community.",
  keywords: ["micro saas", "indie hacker", "solo founder", "community", "discord", "ai automation", "seo", "marketing", "solopreneur", "startup"],
  authors: [{ name: "Next Level Builders", url: "https://nextlevelbuilder.io" }],
  creator: "Next Level Builders",
  publisher: "Next Level Builders",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    alternateLocale: ["en_US"],
    url: "https://nextlevelbuilder.io",
    siteName: "Next Level Builders",
    title: "Next Level Builders | Premium Discord Community for Micro SaaS Builders",
    description: "Join 500+ solo-founders building profitable micro-SaaS products. Get access to proven playbooks, recorded sessions, and a supportive community.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 673,
        alt: "Next Level Builders - Premium Discord Community",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@nextlevelbuilders",
    creator: "@nextlevelbuilders",
    title: "Next Level Builders | Premium Discord Community",
    description: "Join 500+ solo-founders building profitable micro-SaaS products. Proven playbooks, recorded sessions, supportive community.",
    images: ["/og-image.png"],
  },
  category: "technology",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning className="dark">
      <head>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="AI index" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({ "@context": "https://schema.org", "@type": "Organization", name: "Next Level Builders", url: siteUrl(), logo: `${siteUrl()}/icon-512.png` }) }} />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="lazyOnload"
        />
        <Script id="google-analytics" strategy="lazyOnload">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </head>
      <body className={`${inter.variable} ${bricolage.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
