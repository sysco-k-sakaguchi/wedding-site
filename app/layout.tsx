import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Masato & Haruka | Wedding Invitation";
const description =
  "2026年10月12日の挙式・会食、送迎バス、みんなの写真をご案内するウェディングサイトです";
const siteUrl = new URL("https://masato-haruka-wedding-2026.keiwansaka.chatgpt.site/");
const socialImageUrl = new URL("/og.png", siteUrl);

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title,
  description,
  openGraph: {
    type: "website",
    url: siteUrl,
    title,
    description,
    locale: "ja_JP",
    images: [
      {
        url: socialImageUrl,
        width: 1734,
        height: 907,
        alt: "Masato and Haruka wedding invitation framed by burgundy curtains",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [socialImageUrl],
  },
};

export const viewport: Viewport = {
  themeColor: "#ece3d6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/webp" href="/images/wedding/01_beach_smile-640.webp" />
        <link rel="stylesheet" href="/assets/styles/main.css" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
