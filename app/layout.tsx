import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Masato & Haruka | Wedding Invitation";
const description =
  "挙式と会食をはじめ各日のご案内をまとめた Masato と Haruka のウェディング招待状です";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol ?? (host?.startsWith("localhost") ? "http" : "https");
  const imageUrl = host ? `${protocol}://${host}/og.png` : undefined;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      locale: "ja_JP",
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1734,
              height: 907,
              alt: "Masato and Haruka wedding invitation framed by burgundy curtains",
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

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
        <link rel="stylesheet" href="/assets/styles/main.css" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
