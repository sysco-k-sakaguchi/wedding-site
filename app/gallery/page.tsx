import type { Metadata } from "next";
import Script from "next/script";
import galleryDocument from "../../gallery.html?raw";
import "../../assets/styles/gallery.css";

function extractGalleryMarkup(documentSource: string) {
  const body = documentSource.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body.replace(
    /<script\s+type="module"\s+src="assets\/scripts\/gallery-page\.js(?:\?[^\"]*)?"><\/script>/i,
    ""
  );
}

const galleryMarkup = extractGalleryMarkup(galleryDocument);

export const metadata: Metadata = {
  title: "Photo Gallery | Masato & Haruka",
  description: "MasatoとHarukaのウェディングフォトギャラリーです。",
};

export default function GalleryPage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: galleryMarkup }} />
      <Script
        src="/assets/scripts/gallery-page.js?v=20260814-5"
        type="module"
        strategy="afterInteractive"
      />
    </>
  );
}
