"use client";

import { useEffect, useState } from "react";
import { AccessPanel, apiJson, type Photo, type SessionInfo } from "./PhotosApp";
import { PhotoLocaleContext, usePhotoText, type PhotoLocale } from "./photo-i18n";
import { PhotoSaveProvider, PhotoSaveButton, usePhotoShareAvailable } from "./PhotoSaveButton";

type SaveResult = { id: string; session: SessionInfo | null; photo: Photo | null; error: string };

function SaveContents({ id, changeLocale }: { id: string; changeLocale: (locale: PhotoLocale) => void }) {
  const { locale, t } = usePhotoText();
  const nativeShare = usePhotoShareAvailable();
  const [result, setResult] = useState<SaveResult | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadedId, setLoadedId] = useState("");
  const [failedId, setFailedId] = useState("");
  const [shareFallback, setShareFallback] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const current = result?.id === id ? result : null;

  useEffect(() => {
    let cancelled = false;
    let session: SessionInfo | null = null;
    void (async () => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("写真が見つかりませんでした。 / Photo not found.");
      session = await apiJson<SessionInfo>("/api/photos/session");
      const photo = session.authenticated ? (await apiJson<{ photo: Photo }>(`/api/photos/${encodeURIComponent(id)}`)).photo : null;
      if (!cancelled) setResult({ id, session, photo, error: "" });
    })().catch((error: unknown) => {
      if (!cancelled) setResult({ id, session, photo: null, error: error instanceof Error ? error.message : "写真を読み込めませんでした。 / Could not load photo." });
    });
    return () => { cancelled = true; };
  }, [id, revision, locale]);

  function retry() { setResult(null); setFailedId(""); setRevision((value) => value + 1); }
  const photo = current?.photo;

  return <main className="photos-page photos-save-page">
    <header className="photos-save-header">
      <a className="photos-back" href={`/photos?lang=${locale}`}>← {t("一覧に戻る", "Back to album")}</a>
      <div className="photos-language-switch" aria-label="言語 / Language">
        <button type="button" aria-pressed={locale === "ja"} onClick={() => changeLocale("ja")}>日本語</button>
        <button type="button" aria-pressed={locale === "en"} onClick={() => changeLocale("en")}>English</button>
      </div>
    </header>
    <section className="photos-save-content" aria-labelledby="photo-save-title">
      <p className="photos-eyebrow">Masato & Haruka</p>
      <h1 id="photo-save-title">{t("写真アプリに保存", "Save to your photo app")}</h1>
      {!current ? <p role="status">{t("写真を準備しています…", "Preparing your photo…")}</p> : current.error ? <div role="alert" className="photos-gallery-error">
        <p>{current.error}</p><button className="photos-secondary-button" type="button" onClick={retry}>{t("もう一度読み込む", "Try again")}</button>
      </div> : !current.session?.authenticated ? <AccessPanel configured={Boolean(current.session?.configured)} onAuthenticated={retry} actionLabel={t("写真を開く", "Open photo")} /> : photo ? <>
        <ol className="photos-save-steps">
          <li><span>1</span><strong>{t("下の写真を長押し", "Touch and hold the photo below")}</strong></li>
          <li><span>2</span><strong>{t("「写真に保存」を選ぶ", "Choose Save to Photos")}</strong></li>
        </ol>
        <p className="photos-save-caption">{t("「画像を保存」「写真に追加」と表示されることもあります。", "The option may also be called Save Image or Add to Photos.")}</p>
        {failedId === photo.id ? <p className="photos-gallery-error" role="alert">{t("画像を読み込めませんでした。下の「写真だけを開く」をお試しください。", "The image could not load. Try Open image only below.")}</p> : <>
          {loadedId !== photo.id ? <p role="status">{t("画像を読み込んでいます…", "Loading image…")}</p> : null}
          {/* The actual original image has no links, controls or overlays over it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="photos-save-image" src={photo.originalUrl} alt={t("長押しして保存する写真", "Photo to touch and hold to save")}
            onLoad={() => setLoadedId(photo.id)} onError={() => setFailedId(photo.id)} />
        </>}
        <a className="photos-secondary-button photos-save-image-link" href={photo.originalUrl}>{t("写真だけを開く", "Open image only")}</a>
        <p className="photos-help">{t("保存メニューが出ない場合は、写真だけを開いてから長押ししてください。", "If the save menu is missing, open the image alone and touch and hold it.")}</p>
        <div className="photos-save-location">
          <h2>{t("保存した写真が見つからないとき", "If you cannot find your saved photo")}</h2>
          <p>{t("iPhoneの写真アプリで「最近保存した項目」を開くか、ライブラリを「最近追加した項目」で並べ替えてください。", "On iPhone, open Recently Saved in Photos, or sort your library by Recently Added.")}</p>
          <p>{t("撮影日順では、元の撮影日へ入ることがあります。", "When sorted by capture date, the photo may appear at its original date.")}</p>
        </div>
        {nativeShare ? <details className="photos-save-other-methods" onToggle={(event) => setShareOpen(event.currentTarget.open)}>
          <summary>{t("共有メニューを使う", "Use the share menu")}</summary>
          <p>{t("端末のメニューから保存する方法も使えます。見当たらない場合は、上の写真を長押ししてください。", "You can also try your phone’s share menu. If saving does not work, touch and hold the image above.")}</p>
          {shareOpen ? <PhotoSaveButton photo={photo} expanded shareOnly className="photos-secondary-button" onFallback={() => setShareFallback(true)} /> : null}
          {shareFallback ? <p role="status">{t("共有メニューを使えませんでした。上の写真を長押しして保存してください。", "The share menu was unavailable. Touch and hold the image above to save it.")}</p> : null}
        </details> : null}
        <a className="photos-primary-button photos-save-return" href={`/photos?lang=${locale}`}>{t("写真一覧に戻る", "Back to photos")}</a>
      </> : null}
    </section>
  </main>;
}

export function PhotoSaveScreen({ id }: { id: string }) {
  const [locale, setLocale] = useState<PhotoLocale>("ja");
  function changeLocale(next: PhotoLocale) {
    setLocale(next); document.documentElement.lang = next;
    document.title = next === "en" ? "Save photo | Masato & Haruka" : "写真を保存 | Masato & Haruka";
    const url = new URL(window.location.href); url.searchParams.set("lang", next); window.history.replaceState(window.history.state, "", url);
  }
  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get("lang");
    const frame = requestAnimationFrame(() => changeLocale(requested === "en" ? "en" : "ja"));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <PhotoLocaleContext.Provider value={locale}><PhotoSaveProvider><SaveContents id={id} changeLocale={changeLocale} /></PhotoSaveProvider></PhotoLocaleContext.Provider>;
}
