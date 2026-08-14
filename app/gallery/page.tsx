/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- vinext routing and art-directed picture/srcset are handled explicitly here. */
import type { Metadata } from "next";
import Script from "next/script";
import galleryManifest from "../../images/photos.json";
import "./gallery.css";

type Photo = {
  stem: string;
  width: number;
  height: number;
  variants: number[];
  kind: "wide" | "standard" | "portrait";
  altJa: string;
  altEn: string;
};

const widePhotoIds = new Set([1, 6, 15, 17]);

const photos: Photo[] = galleryManifest.photos.map((photo) => {
  const isPortrait = photo.height > photo.width;
  const variants = isPortrait
    ? photo.width >= 1440 ? [480, 960, 1440] : [480, 960]
    : photo.width >= 1920 ? [640, 1280, 1920] : [640, 1280];

  return {
    stem: photo.file.replace(/\.jpeg$/i, ""),
    width: photo.width,
    height: photo.height,
    variants,
    kind: widePhotoIds.has(photo.id) ? "wide" : isPortrait ? "portrait" : "standard",
    altJa: photo.altJa,
    altEn: photo.altEn,
  };
});

export const metadata: Metadata = {
  title: "Photo Gallery | Masato & Haruka",
  description: "MasatoとHarukaのウェディングフォトギャラリーです。",
};

export default function GalleryPage() {
  return (
    <>
      <main className="gallery-page">
        <header className="gallery-header">
          <a className="gallery-brand" href="/?from=gallery" data-gallery-back aria-label="Masato and Haruka Wedding Top">Masato <i>&amp;</i> Haruka</a>
          <a className="gallery-back" href="/?from=gallery" data-gallery-back>
            <span aria-hidden="true">←</span>
            <span data-gallery-copy-ja>Wedding Topへ戻る</span>
            <span data-gallery-copy-en hidden>Back to Wedding Top</span>
          </a>
        </header>

        <section className="gallery-intro" aria-labelledby="gallery-title">
          <p>Our Wedding Story</p>
          <h1 id="gallery-title">Photo Gallery</h1>
          <small data-gallery-copy-ja>写真をタップすると大きくご覧いただけます</small>
          <small data-gallery-copy-en hidden>Tap a photo to view it full screen</small>
        </section>

        <section className="gallery-grid" aria-label="ウェディング写真17枚" data-gallery-grid>
          {photos.map((photo, index) => {
            const number = String(index + 1).padStart(2, "0");
            const srcSet = photo.variants.map((w) => `/images/wedding/${photo.stem}-${w}.webp ${w}w`).join(", ");
            const largest = photo.variants.at(-1)!;
            const sizes = photo.kind === "wide"
              ? "(max-width: 719px) calc(100vw - 2rem), (max-width: 959px) calc(100vw - 3rem), min(100vw - 4rem, 1152px)"
              : photo.kind === "portrait"
                ? "(max-width: 719px) calc(100vw - 2rem), (max-width: 959px) 46vw, min(42vw, 480px)"
                : "(max-width: 719px) calc(100vw - 2rem), (max-width: 959px) 46vw, min(66vw, 760px)";
            return (
              <figure className={`gallery-photo gallery-photo--${number} gallery-photo--${photo.kind}`} key={photo.stem}>
                <button
                  className="gallery-photo__button"
                  type="button"
                  aria-label={`写真 ${number} を拡大表示：${photo.altJa}`}
                  data-photo-expand
                  data-photo-index={index}
                  data-photo-full-src={`/images/wedding/${photo.stem}-${largest}.webp`}
                  data-photo-full-srcset={srcSet}
                >
                  <picture>
                    <source type="image/webp" srcSet={srcSet} sizes={sizes} />
                    <img src={`/images/${photo.stem}.jpeg`} alt={photo.altJa} data-photo-image data-photo-alt-ja={photo.altJa} data-photo-alt-en={photo.altEn} width={photo.width} height={photo.height} loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" />
                  </picture>
                  <span className="gallery-photo__number" aria-hidden="true">{number}</span>
                  <span className="gallery-photo__zoom" aria-hidden="true">+</span>
                </button>
              </figure>
            );
          })}
        </section>

        <footer className="gallery-footer">
          <p>Masato &amp; Haruka</p>
          <a className="gallery-back" href="/?from=gallery" data-gallery-back>
            <span aria-hidden="true">←</span>
            <span data-gallery-copy-ja>Wedding Topへ戻る</span>
            <span data-gallery-copy-en hidden>Back to Wedding Top</span>
          </a>
        </footer>
      </main>

      <dialog className="photo-lightbox gallery-lightbox" data-photo-lightbox aria-label="写真の拡大表示">
        <div className="photo-lightbox__content gallery-lightbox__content">
          <button className="photo-lightbox__close" type="button" data-photo-lightbox-close aria-label="拡大表示を閉じる"><span aria-hidden="true">×</span></button>
          <button className="gallery-lightbox__nav gallery-lightbox__nav--previous" type="button" data-photo-lightbox-previous aria-label="前の写真"><span aria-hidden="true">←</span></button>
          <figure className="photo-lightbox__figure gallery-lightbox__figure">
            <img data-photo-lightbox-image alt="" />
            <figcaption className="gallery-lightbox__meta">
              <span aria-hidden="true"><span data-photo-lightbox-current>01</span> / <span data-photo-lightbox-total>17</span></span>
              <span className="sr-only" data-photo-lightbox-status aria-live="polite" aria-atomic="true" />
            </figcaption>
          </figure>
          <button className="gallery-lightbox__nav gallery-lightbox__nav--next" type="button" data-photo-lightbox-next aria-label="次の写真"><span aria-hidden="true">→</span></button>
        </div>
      </dialog>

      <Script src="/assets/scripts/gallery-page.js" type="module" strategy="afterInteractive" />
    </>
  );
}
