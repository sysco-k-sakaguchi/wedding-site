"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Photo } from "./PhotosApp";
import { usePhotoText } from "./photo-i18n";
import { createPhotoFileCache, fetchPhotoFile, openPhotoSaveMenu, photoDevice, type PhotoDevice } from "./photo-save";

const SaveContext = createContext<{ device: PhotoDevice; nativeShare: boolean; cache: ReturnType<typeof createPhotoFileCache>; sharing: { current: boolean } } | null>(null);
const subscribePlatform = () => () => {};
const serverPlatform = () => "desktop:false";
function browserPlatform() {
  const device = photoDevice(navigator.userAgent, navigator.maxTouchPoints);
  return `${device}:${device !== "desktop" && typeof navigator.share === "function" && typeof navigator.canShare === "function"}`;
}

export function PhotoSaveProvider({ children }: { children: ReactNode }) {
  const platform = useSyncExternalStore(subscribePlatform, browserPlatform, serverPlatform);
  const [deviceValue, shareValue] = platform.split(":");
  const device = deviceValue as PhotoDevice;
  const nativeShare = shareValue === "true";
  const cache = useMemo(() => createPhotoFileCache(fetchPhotoFile), []);
  const sharing = useRef(false);
  useEffect(() => {
    cache.resume();
    return () => cache.dispose();
  }, [cache]);
  return <SaveContext.Provider value={{ device, nativeShare, cache, sharing }}>{children}</SaveContext.Provider>;
}

export function usePhotoSaveDevice() { return useContext(SaveContext)?.device ?? "desktop"; }

export function PhotoSaveButton({ photo, onFallback, className = "", expanded = false }: {
  photo: Photo; onFallback: (photo: Photo) => void; className?: string; expanded?: boolean;
}) {
  const { t } = usePhotoText();
  const context = useContext(SaveContext)!;
  const { cache, nativeShare } = context;
  const control = useRef<HTMLButtonElement>(null);
  const retry = useRef<ReturnType<typeof cache.prepare> | null>(null);
  const generation = useRef(0);
  const [ready, setReady] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    const currentGeneration = ++generation.current;
    if (!nativeShare) return;
    let interested = false;
    let cancelled = false;
    let ticket: ReturnType<typeof cache.prepare> | undefined;
    function prepare() {
      if (interested) return;
      interested = true;
      setPreparing(true);
      ticket = cache.prepare(photo);
      void ticket.promise.then(() => { if (!cancelled && interested) setReady(true); })
        .catch(() => { if (!cancelled && interested) setReady(false); })
        .finally(() => { if (!cancelled && interested) setPreparing(false); });
    }
    const observer = expanded || typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) prepare();
        else { interested = false; ticket?.release(); ticket = undefined; setPreparing(false); }
      }
    }, { rootMargin: "40px" });
    let frame: number | undefined;
    if (observer && control.current) observer.observe(control.current);
    else frame = requestAnimationFrame(prepare);
    return () => { cancelled = true; if (frame !== undefined) cancelAnimationFrame(frame); observer?.disconnect(); ticket?.release(); retry.current?.release(); retry.current = null; if (generation.current === currentGeneration) generation.current++; };
  }, [nativeShare, cache, photo, expanded]);

  function save() {
    if (context.sharing.current) return;
    const file = context.cache.peek(photo.id);
    if (!context.nativeShare) { onFallback(photo); return; }
    if (!file) {
      const currentGeneration = generation.current;
      setReady(false); setPreparing(true);
      retry.current?.release();
      const ticket = cache.prepare(photo);
      retry.current = ticket;
      void ticket.promise.then(() => { if (generation.current === currentGeneration) setReady(true); })
        .catch(() => { if (generation.current === currentGeneration) onFallback(photo); })
        .finally(() => { ticket.release(); if (generation.current === currentGeneration) { retry.current = null; setPreparing(false); } });
      return;
    }
    setSharing(true);
    // Call share directly in the click event. Fetching here would consume the
    // short user-activation window on a slow connection.
    void openPhotoSaveMenu(file, navigator, context.sharing, () => onFallback(photo)).finally(() => setSharing(false));
  }

  if (context.device === "desktop") return <a className={className} href={photo.downloadUrl} download>{expanded ? t("この写真を保存", "Save this photo") : t("保存", "Save")}</a>;
  return <button ref={control} className={`photos-save-button ${className}`} type="button" onClick={save}
    disabled={sharing || (preparing && !ready)} aria-label={t(`${photo.originalName}を写真に保存`, `Save ${photo.originalName}`)}>
    {sharing ? t("スマホのメニューを開いています…", "Opening your phone’s menu…") : preparing && !ready ? t("写真を準備中…", "Preparing photo…") : t("写真に保存", "Save photo")}
  </button>;
}
