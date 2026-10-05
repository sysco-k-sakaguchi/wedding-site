"use client";

import { useEffect, useState } from "react";
import { AccessPanel, apiJson, type Photo, type SessionInfo } from "./PhotosApp";
import { PhotoLocaleContext, usePhotoText, type PhotoLocale } from "./photo-i18n";
import { PhotoSaveButton } from "./PhotoSaveButton";

type SaveResult = { id: string; session: SessionInfo | null; photo: Photo | null; error: string };

function SaveContents({ id, changeLocale }: { id: string; changeLocale: (locale: PhotoLocale) => void }) {
  const { locale, t } = usePhotoText();
  const [result, setResult] = useState<SaveResult | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadedId, setLoadedId] = useState("");
  const [failedId, setFailedId] = useState("");
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
      <a className="photos-back" href={`/photos?lang=${locale}`}>{t("一覧に戻る", "Back to album")}</a>
      <div className="photos-language-switch" aria-label="言語 / Language">
        <button type="button" aria-pressed={locale === "ja"} onClick={() => changeLocale("ja")}>日本語</button>
        <button type="button" aria-pressed={locale === "en"} onClick={() => changeLocale("en")}>English</button>
      </div>
    </header>
    <section className="photos-save-content" aria-labelledby="photo-save-title">
      <p className="photos-eyebrow">Masato & Haruka</p>
      <h1 id="photo-save-title">{t("写真", "Photo")}</h1>
      {!current ? <p role="status">{t("写真を準備しています…", "Preparing your photo…")}</p> : current.error ? <div role="alert" className="photos-gallery-error">
        <p>{current.error}</p><button className="photos-secondary-button" type="button" onClick={retry}>{t("もう一度読み込む", "Try again")}</button>
      </div> : !current.session?.authenticated ? <AccessPanel configured={Boolean(current.session?.configured)} onAuthenticated={retry} actionLabel={t("写真を開く", "Open photo")} /> : photo ? <>
        {failedId === photo.id ? <div className="photos-gallery-error" role="alert"><p>{t("画像を読み込めませんでした。", "The photo could not load.")}</p><button className="photos-secondary-button" type="button" onClick={retry}>{t("もう一度読み込む", "Try again")}</button></div> : <>
          {loadedId !== photo.id ? <p role="status">{t("画像を読み込んでいます…", "Loading image…")}</p> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={`${photo.id}-${revision}`} className="photos-save-image" src={photo.viewUrl} alt={t("共有された写真", "Shared photo")}
            onLoad={() => setLoadedId(photo.id)} onError={() => setFailedId(photo.id)} />
        </>}
        <PhotoSaveButton photo={photo} className="photos-primary-button photos-save-download" />
        <p className="photos-help">{t("保存先はファイル／ダウンロードです。", "Downloads go to Files or Downloads.")}</p>
      </> : null}
    </section>
  </main>;
}

export function PhotoSaveScreen({ id }: { id: string }) {
  const [locale, setLocale] = useState<PhotoLocale>("ja");
  function changeLocale(next: PhotoLocale) {
    setLocale(next); document.documentElement.lang = next;
    document.title = next === "en" ? "Photo | Masato & Haruka" : "写真 | Masato & Haruka";
    const url = new URL(window.location.href); url.searchParams.set("lang", next); window.history.replaceState(window.history.state, "", url);
  }
  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get("lang");
    const frame = requestAnimationFrame(() => changeLocale(requested === "en" ? "en" : "ja"));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <PhotoLocaleContext.Provider value={locale}><SaveContents id={id} changeLocale={changeLocale} /></PhotoLocaleContext.Provider>;
}
