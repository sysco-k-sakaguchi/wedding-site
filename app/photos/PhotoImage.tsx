"use client";

import { useEffect, useRef, useState } from "react";
import { photoImageCache } from "./photo-image-cache";
import { usePhotoText } from "./photo-i18n";

export function PhotoImage({ thumbnailUrl, viewUrl, alt, compact = false, retryKey = 0, onState }: {
  thumbnailUrl: string; viewUrl?: string; alt: string; compact?: boolean; retryKey?: number;
  onState?: (failed: boolean) => void;
}) {
  const { t } = usePhotoText();
  const frame = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(!compact);
  const [revision, setRevision] = useState(0);
  const [image, setImage] = useState<{ key: string; preview: string; full: string; failed: boolean } | null>(null);
  const stateCallback = useRef(onState);
  stateCallback.current = onState;
  const key = `${thumbnailUrl}|${viewUrl ?? ""}|${retryKey}|${revision}`;
  const current = image?.key === key ? image : null;

  useEffect(() => {
    if (!compact || !frame.current) return;
    if (typeof IntersectionObserver === "undefined") {
      const fallback = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(fallback);
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "180px" });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [compact]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let preview = "", full = "", failed = false;
    const update = () => { if (!cancelled) setImage({ key, preview, full, failed }); };
    const thumb = photoImageCache.acquire(thumbnailUrl, compact ? 0 : 2);
    void thumb.promise.then((url) => { preview = url; update(); if (!viewUrl && !cancelled) stateCallback.current?.(false); })
      .catch(() => { if (!viewUrl) { failed = true; update(); if (!cancelled) stateCallback.current?.(true); } });
    const display = viewUrl ? photoImageCache.acquire(viewUrl, 1) : null;
    if (display) void display.promise.then((url) => { full = url; failed = false; update(); if (!cancelled) stateCallback.current?.(false); })
      .catch(() => { failed = true; update(); if (!cancelled) stateCallback.current?.(true); });
    return () => { cancelled = true; thumb.release(); display?.release(); };
  }, [visible, thumbnailUrl, viewUrl, key, compact]);

  useEffect(() => {
    if (!current?.failed || !visible) return;
    const retryOnline = () => setRevision((value) => value + 1);
    window.addEventListener("online", retryOnline, { once: true });
    return () => window.removeEventListener("online", retryOnline);
  }, [current?.failed, visible]);

  const src = visible ? (current?.full || current?.preview) : "";
  const ready = Boolean(viewUrl ? current?.full : current?.preview);
  return <span ref={frame} className={`photos-image${compact ? " photos-image--compact" : ""}`} aria-busy={!ready && !current?.failed}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {src ? <img src={src} alt={alt} decoding="async" /> : <span className="photos-image__placeholder" aria-label={alt} />}
    {!ready && visible ? <span className={`photos-image__status${current?.failed ? " is-failed" : ""}`} role={compact ? undefined : "status"}>
      {current?.failed ? <>
        <span>{t("画像を読み込めませんでした", "Photo could not load")}</span>
        {!compact ? <button type="button" onClick={() => setRevision((value) => value + 1)}>{t("もう一度読み込む", "Retry")}</button> : null}
      </> : <><span className="photos-spinner" aria-hidden="true" /><span>{t("読み込み中…", "Loading…")}</span></>}
    </span> : null}
  </span>;
}
