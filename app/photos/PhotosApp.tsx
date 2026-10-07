"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";

import { PhotoLocaleContext, usePhotoText, categoryLabel, photoErrorMessage, type PhotoLocale } from "./photo-i18n";

import { runUploadQueue, sendPhoto, PhotoUploadError, type UploadItem, type UploadDetails } from "./photo-uploads";

import { PhotoSaveButton } from "./PhotoSaveButton";
import { PhotoImage } from "./PhotoImage";
import { photoImageCache, PHOTO_AUTH_EXPIRED } from "./photo-image-cache";

interface Category {
  id: string;
  label: string;
}

export interface Photo {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  category: string;
  uploaderName: string | null;
  comment: string | null;
  createdAt: string;
  thumbnailUrl: string;
  viewUrl: string;
  downloadUrl: string;
  originalUrl: string;
}

export interface SessionInfo {
  configured: boolean;
  authenticated: boolean;
  admin: boolean;
  csrfToken: string | null;
  categories: Category[];
  limits: {
    maxFileBytes: number;
    maxFilesPerBatch: number;
  };
  supportedTypes: string[];
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const locale = (): PhotoLocale => typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ja";
  try {
    const response = await fetch(url, { credentials: "same-origin", signal: controller.signal, ...init });
    const payload = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && (!init?.method || init.method === "GET") && url !== "/api/photos/session") {
        photoImageCache.clear(); window.dispatchEvent(new Event(PHOTO_AUTH_EXPIRED));
      }
      throw new Error(photoErrorMessage(payload.error?.code, payload.error?.message, locale()));
    }
    return payload;
  } catch (caught) {
    if (controller.signal.aborted || caught instanceof TypeError) {
      throw new Error(locale() === "en" ? "Connection interrupted. Please try again." : "通信が途切れました。もう一度お試しください。");
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

function startBrowserDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  document.body.append(link);
  link.click();
  link.remove();
}

export function formatDate(value: string, locale: PhotoLocale = "ja") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatFileSize(bytes: number) {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1_000))}KB`;
}

function makePhotoAlt(photo: Photo, categories: Category[], locale: PhotoLocale) {
  const item = categories.find((item) => item.id === photo.category);
  const category = categoryLabel(photo.category, item?.label ?? "結婚式", locale);
  if (locale === "en") return `${category} photo${photo.uploaderName ? ` by ${photo.uploaderName}` : ""}`;
  return photo.uploaderName ? `${category}の写真（${photo.uploaderName}さんより）` : `${category}の写真`;
}

export function AccessPanel({
  configured,
  onAuthenticated,
  actionLabel,
}: {
  configured: boolean;
  onAuthenticated: (csrfToken: string) => void;
  actionLabel?: string;
}) {
  const { t } = usePhotoText();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const result = await apiJson<{ csrfToken: string }>("/api/photos/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.normalize("NFKC").trim() }),
      });
      onAuthenticated(result.csrfToken);
      setCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("共有コードを確認してください。", "Please check the password."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="photos-access-card" aria-labelledby="photos-access-title">
      <div>
        <p className="photos-eyebrow">For Our Guests</p>
        <h2 id="photos-access-title">
          {configured ? t("パスワードを入力", "Enter the password") : t("アルバムは準備中です", "The album will be ready soon")}
        </h2>
        <p>
          {configured
            ? t("新郎新婦からお知らせしたパスワードを入力してください。", "Enter the password shared by Masato and Haruka.")
            : t("準備中です。時間をおいてもう一度お試しください。", "Please try again later or contact the hosts.")}
        </p>
      </div>

      {configured ? (
        <form className="photos-access-form" onSubmit={submit}>
          <label htmlFor="photo-access-code">{t("パスワード", "Password")}</label>
          <div className="photos-access-form__row">
            <input
              id="photo-access-code"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={16}
              aria-describedby="photo-password-help"
              required
            />
            <button type="submit" disabled={submitting || !code}>
              {submitting ? t("確認中…", "Checking…") : actionLabel ?? t("アルバムを開く", "Open album")}
            </button>
          </div>
          <p id="photo-password-help" className="photos-help">{t("新郎新婦からお知らせした4桁のパスワードです。", "Use the four-digit password shared by the hosts.")}</p>
          {error ? (
            <p className="photos-form-error" role="alert">
              <span aria-hidden="true">!</span> {error}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="photos-setup-note" role="status">
          {t("準備ができていない場合は、新郎新婦へお知らせください。", "Please contact the hosts if the album is unavailable.")}
        </p>
      )}
    </section>
  );
}

function UploadDialog({
  open,
  session,
  onClose,
  onStart,
}: {
  open: boolean;
  session: SessionInfo;
  onClose: () => void;
  onStart: (items: UploadItem[], details: UploadDetails) => void;
}) {
  const { locale, t } = usePhotoText();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const [items, setItems] = useState<UploadItem[]>([]);
  const [category, setCategory] = useState("other");
  const [uploaderName, setUploaderName] = useState("");
  const [comment, setComment] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const reset = useCallback(() => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
    setItems([]);
    setUploaderName("");
    setComment("");
  }, []);

  function requestClose() {
    reset();
    onClose();
  }

  function validateFile(file: File) {
    const lowerName = file.name.toLowerCase();
    if (/\.(heic|heif)$/.test(lowerName) || /heic|heif/.test(file.type)) {
      return t("HEIC／HEIFには現在対応していません。JPEGへ変換してください。", "Please choose a JPEG, PNG or WebP photo. HEIC / HEIF is not supported.");
    }
    if (
      file.type &&
      file.type !== "application/octet-stream" &&
      !session.supportedTypes.includes(file.type)
    ) {
      return t("JPEG、PNG、WebPの画像を選んでください。", "Please choose a JPEG, PNG or WebP photo.");
    }
    if (file.size > session.limits.maxFileBytes) {
      return t(`1枚あたり${Math.floor(session.limits.maxFileBytes / 1_000_000)}MBまでです。`, `Please choose a photo under ${Math.floor(session.limits.maxFileBytes / 1_000_000)}MB.`);
    }
    if (file.size < 1) {
      return t("空のファイルは追加できません。", "This file is empty. Please choose another photo.");
    }
    return "";
  }

  function addFiles(files: File[]) {
    setItems((current) => {
      const next = files.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        previewUrls.current.add(previewUrl);
        const message = validateFile(file);
        return {
          id: crypto.randomUUID(),
          file,
          previewUrl,
          progress: 0,
          status: message ? ("error" as const) : ("queued" as const),
          message,
        };
      });
      return [...current, ...next];
    });
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrls.current.delete(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function startUpload() {
    const valid = items.filter((item) => !validateFile(item.file));
    if (!valid.length) return;
    // Transfer URL ownership to the album before closing the selection dialog.
    for (const item of valid) previewUrls.current.delete(item.previewUrl);
    onStart(valid, { category, uploaderName, comment });
    reset();
    onClose();
  }

  const validCount = items.filter((item) => !validateFile(item.file)).length;
  const errorCount = items.length - validCount;

  return (
    <dialog
      ref={dialogRef}
      className="photos-upload-dialog"
      aria-labelledby="upload-dialog-title"
      onCancel={requestClose}
      onClose={() => {
        if (open) requestClose();
      }}
    >
      <div className="photos-dialog-header">
        <div>
          <p className="photos-eyebrow">Add Photos</p>
          <h2 id="upload-dialog-title">{t("写真を追加する", "Add photos")}</h2>
        </div>
        <button
          className="photos-icon-button"
          type="button"
          onClick={requestClose}
          aria-label={t("写真追加画面を閉じる", "Close photo upload")}
        >
          ×
        </button>
      </div>

      <div className="photos-upload-dialog__body">
        <div
          className={`photos-drop-zone${dragging ? " is-dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragging(false);
            }
          }}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
              onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <span className="photos-drop-zone__mark" aria-hidden="true">＋</span>
          <strong>{t("写真を選ぶ", "Choose photos")}</strong>
          <p>{t("スマートフォンの写真から選べます。", "Choose from your phone. On a computer, you can also drag photos here.")}</p>
          <small>
            {t(`JPEG・PNG・WebP ／ 1枚${Math.floor(session.limits.maxFileBytes / 1_000_000)}MBまで ／ 枚数制限なし`, `JPEG, PNG or WebP · Up to ${Math.floor(session.limits.maxFileBytes / 1_000_000)}MB each · No photo count limit`)}
          </small>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            >
            {t("写真を選ぶ", "Choose photos")}
          </button>
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {items.length > 0
              ? t(`${items.length}枚を選択中。エラー${errorCount}枚。`, `${items.length} selected. ${errorCount} could not be added.`)
              : t("写真は選択されていません。", "No photos selected.")}
          </p>

        {items.length > 0 ? (
          <div
            className="photos-upload-preview"
            aria-label={t("選択した写真", "Selected photos")}
          >
            {items.map((item) => (
              <article className={`photos-upload-item is-${item.status}`} key={item.id}>
                <div className="photos-upload-item__image">
                  {/* Browser previews are local-only and are never treated as saved data. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" src={item.previewUrl} alt={t(`${item.file.name}のプレビュー`, `Preview of ${item.file.name}`)} />
                </div>
                <div className="photos-upload-item__body">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <small>{formatFileSize(item.file.size)}</small>
                  <span className="photos-upload-item__status">
                    {item.status === "success" ? "✓ " : item.status === "error" ? "! " : ""}
                    {item.message || t("待機中", "Ready to send")}
                  </span>
                </div>
                {item.status !== "success" ? (
                  <button type="button" onClick={() => removeItem(item.id)} aria-label={t(`${item.file.name}を選択から外す`, `Remove ${item.file.name}`)}>
                    ×
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        <details className="photos-upload-details">
          <summary>{t("場面・名前・コメントをつける（任意）", "Add a category, name or message (optional)")}</summary>
        <div className="photos-upload-fields">
          <label>
            <span>{t("場面", "Category")}</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {session.categories.map((item) => (
                <option key={item.id} value={item.id}>{categoryLabel(item.id, item.label, locale)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("投稿者名", "Your name")} <small>{t("任意", "Optional")}</small></span>
            <input
              type="text"
              value={uploaderName}
              onChange={(event) => setUploaderName(event.target.value)}
              maxLength={60}
                  placeholder={t("例：はるかの友人", "e.g. Haruka’s friend")}
            />
          </label>
          <label className="photos-upload-fields__comment">
            <span>{t("コメント", "Comment")} <small>{t("任意", "Optional")}</small></span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={300}
              rows={3}
                  placeholder={t("写真にまつわるひとこと", "A message about these photos")}
            />
          </label>
        </div>

        </details>


      </div>

      <div className="photos-dialog-footer">
        <button type="button" className="photos-secondary-button" onClick={requestClose}>
          {t("キャンセル", "Cancel")}
        </button>
        <button type="button" onClick={startUpload} disabled={validCount < 1}>
          {t(`${validCount}枚を追加する`, `Add ${validCount} photos`)}
        </button>
      </div>
    </dialog>
  );
}

function UploadPhotoCard({ item, onView, onSelect, selectionMode, selected, keepAlbumOpen }: {
  item: UploadItem;
  onView: (photo: Photo) => void;
  keepAlbumOpen: boolean;
  onSelect: (id: string) => void;
  selectionMode: boolean;
  selected: boolean;
}) {
  const { t } = usePhotoText();
  const ready = item.status === "success" || item.status === "duplicate";
  const status = item.status === "queued" ? t("順番を待っています", "Waiting to send")
    : item.status === "saving" ? t("保存しています…", "Saving…")
    : item.status === "uploading" ? t("アップロード中", "Uploading")
    : item.status === "error" ? t("もう一度お試しください", "Please retry")
    : item.status === "duplicate" ? t("登録済み", "Already shared") : t("追加しました", "Added");
  return (
    <article className={`photos-card photos-pending-card is-${item.status}${selected ? " is-selected" : ""}`}>
      <button className="photos-card__image-button" type="button" disabled={!ready || !item.photo}
        onClick={() => item.photo && (selectionMode ? onSelect(item.photo.id) : onView(item.photo))}
        aria-label={ready && item.photo ? t(`${item.file.name}を${selectionMode ? "選択" : "拡大表示"}`, `${selectionMode ? "Select" : "View"} ${item.file.name}`) : `${item.file.name} · ${status}`}
        aria-pressed={selectionMode && ready ? selected : undefined}>
        {/* Keep the local preview until the queue is dismissed: this avoids a
            flash while the saved thumbnail is being loaded. */}
        <img src={item.previewUrl} alt={item.file.name} loading="lazy" decoding="async" />
        <span className="photos-upload-overlay" aria-hidden={ready || undefined}>
            {item.status === "error" ? <span className="photos-upload-failed" aria-hidden="true">!</span> : (
              <span className="photos-upload-circle" role={ready ? undefined : "progressbar"} aria-label={t(`${item.file.name}のアップロード`, `Uploading ${item.file.name}`)}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress} aria-valuetext={`${item.progress}% · ${status}`}>
                <svg viewBox="0 0 100 100" aria-hidden="true"><circle className="photos-upload-circle__track" cx="50" cy="50" r="42" /><circle className="photos-upload-circle__fill" cx="50" cy="50" r="42" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - item.progress} /></svg>
                <strong>{item.progress}%</strong>
              </span>
            )}
            <span className="photos-upload-overlay__label">{status}</span>
          </span>
        {ready && selectionMode && item.photo ? <span className="photos-card__check" aria-hidden="true">{selected ? "✓" : ""}</span> : ready ? <span className="photos-card__zoom" aria-hidden="true">＋</span> : null}
      </button>
      <div className="photos-card__meta">
        <strong className="photos-pending-card__status">{ready ? "✓ " : ""}{status}</strong>
        <span title={item.file.name}>{item.file.name}</span>
        {ready && item.photo ? <PhotoSaveButton photo={item.photo} keepAlbumOpen={keepAlbumOpen} /> : item.status === "error" ? <p className="photos-pending-card__error">{item.message}</p> : <span className="photos-pending-card__hint">{t("完了したら開けます", "View when ready")}</span>}
      </div>
    </article>
  );
}

function PhotoLightbox({
  photo,
  photos,
  categories,
  onChange,
  onClose,
  keepAlbumOpen,
}: {
  photo: Photo | null;
  photos: Photo[];
  categories: Category[];
  onChange: (photo: Photo) => void;
  onClose: () => void;
  keepAlbumOpen: boolean;
}) {
  const { locale, t } = usePhotoText();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const index = photo ? photos.findIndex((item) => item.id === photo.id) : -1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (photo && dialog && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => closeRef.current?.focus());
    } else if (!photo && dialog?.open) {
      dialog.close();
    }
  }, [photo]);

  useEffect(() => {
    if (!photo) return;
    function keydown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" && photos.length > 1) {
        event.preventDefault();
        onChange(photos[(index - 1 + photos.length) % photos.length]);
      } else if (event.key === "ArrowRight" && photos.length > 1) {
        event.preventDefault();
        onChange(photos[(index + 1) % photos.length]);
      } else if (event.key === "Home") {
        event.preventDefault();
        onChange(photos[0]);
      } else if (event.key === "End") {
        event.preventDefault();
        onChange(photos[photos.length - 1]);
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [index, onChange, photo, photos]);

  return (
    <dialog
      ref={dialogRef}
      className="photos-lightbox"
      aria-label={t("写真の拡大表示", "Photo viewer")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (photo) onClose();
      }}
    >
      {photo ? (
        <div className="photos-lightbox__layout">
          <button ref={closeRef} className="photos-lightbox__close" type="button" onClick={onClose} aria-label={t("拡大表示を閉じる", "Close photo viewer")}>×</button>
          <div className="photos-lightbox__image-wrap">
            <PhotoImage key={photo.id} thumbnailUrl={photo.thumbnailUrl} viewUrl={photo.viewUrl} alt={makePhotoAlt(photo, categories, locale)} />
            {photos.length > 1 ? (
              <>
                <button
                  className="photos-lightbox__nav photos-lightbox__nav--previous"
                  type="button"
                  onClick={() => onChange(photos[(index - 1 + photos.length) % photos.length])}
                  aria-label={t("前の写真を表示", "Previous photo")}
                >←</button>
                <button
                  className="photos-lightbox__nav photos-lightbox__nav--next"
                  type="button"
                  onClick={() => onChange(photos[(index + 1) % photos.length])}
                  aria-label={t("次の写真を表示", "Next photo")}
                >→</button>
              </>
            ) : null}
          </div>
          <aside className="photos-lightbox__meta">
            <div>
              <span>{index + 1} / {photos.length}</span>
              <strong>{categoryLabel(photo.category, categories.find((item) => item.id === photo.category)?.label ?? "", locale)}</strong>
            </div>
            {photo.uploaderName ? <p>{t(`${photo.uploaderName}さんより`, `Shared by ${photo.uploaderName}`)}</p> : null}
            {photo.comment ? <p className="photos-lightbox__comment">{photo.comment}</p> : null}
            <small>{formatDate(photo.createdAt, locale)} · {formatFileSize(photo.fileSize)}</small>
            <PhotoSaveButton key={photo.id} photo={photo} className="photos-primary-button" keepAlbumOpen={keepAlbumOpen} />
          </aside>
        </div>
      ) : null}
    </dialog>
  );
}

function PhotosAlbum() {
  const [locale, setLocale] = useState<PhotoLocale>("ja");
  const t = (ja: string, en: string) => locale === "en" ? en : ja;

  function changeLocale(next: PhotoLocale) {
    setLocale(next);
    document.documentElement.lang = next;
    document.title = next === "en" ? "Guest photo album | Masato & Haruka" : "みんなの写真 | Masato & Haruka";
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(window.history.state, "", url);
    try { localStorage.setItem("wedding-photo-language", next); } catch {}
  }

  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get("lang");
    let stored: string | null = null;
    try { stored = localStorage.getItem("wedding-photo-language"); } catch {}
    const initial = requested ?? stored ?? (navigator.language.startsWith("ja") ? "ja" : "en");
    const frame = requestAnimationFrame(() => changeLocale(initial === "en" ? "en" : "ja"));
    return () => cancelAnimationFrame(frame);
  }, []);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [galleryError, setGalleryError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadGuard = useRef(false);
  const uploadItemsRef = useRef<UploadItem[]>([]);
  const uploadDetails = useRef<UploadDetails>({ category: "other", uploaderName: "", comment: "" });
  const [uploadCategory, setUploadCategory] = useState("other");
  const uploadController = useRef<AbortController | null>(null);
  const uploadPreviewUrls = useRef(new Set<string>());
  const galleryRef = useRef<HTMLElement>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [imageRetries, setImageRetries] = useState<Record<string, number>>({});
  const [galleryRevision, setGalleryRevision] = useState(0);

  useEffect(() => {
    const expired = () => {
      setSession((current) => current ? { ...current, authenticated: false, csrfToken: null } : current);
      setPhotos([]); setLightboxPhoto(null); setSelected(new Set());
      uploadController.current?.abort();
    };
    window.addEventListener(PHOTO_AUTH_EXPIRED, expired);
    return () => { window.removeEventListener(PHOTO_AUTH_EXPIRED, expired); photoImageCache.clear(); };
  }, []);

  const loadPhotos = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingPhotos(true);
    setGalleryError("");
    try {
      const result = await apiJson<{ photos: Photo[] }>("/api/photos");
      setPhotos(result.photos);
      setBrokenImages(new Set());
      setGalleryRevision((current) => current + 1);
      setSelected((current) => {
        const available = new Set(result.photos.map((photo) => photo.id));
        return new Set([...current].filter((id) => available.has(id)));
      });
    } catch (caught) {
      setGalleryError(caught instanceof Error ? caught.message : t("写真を読み込めませんでした。", "Photos could not be loaded. Please try again."));
    } finally {
      if (!quiet) setLoadingPhotos(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void apiJson<SessionInfo>("/api/photos/session")
      .then((result) => {
        if (!cancelled) {
          setSession(result);
          if (result.authenticated) void loadPhotos();
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setSessionError(caught instanceof Error ? caught.message : t("ページを準備できませんでした。", "The album could not be loaded. Please try again."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadPhotos]);

  const filteredPhotos = useMemo(
    () =>
      activeCategory === "all"
        ? photos
        : photos.filter((photo) => photo.category === activeCategory),
    [activeCategory, photos],
  );

  function addUploadedPhoto(photo: Photo) {
    setPhotos((current) => [photo, ...current.filter((item) => item.id !== photo.id)]);
  }

  useEffect(() => {
    const urls = uploadPreviewUrls.current;
    return () => {
      uploadController.current?.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (!uploading) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [uploading]);

  function updateUploadItem(id: string, patch: Partial<UploadItem>) {
    const next = uploadItemsRef.current.map((item) => item.id === id ? { ...item, ...patch } : item);
    uploadItemsRef.current = next;
    setUploadItems(next);
  }

  function clearUploadQueue() {
    if (uploadGuard.current) return;
    for (const url of uploadPreviewUrls.current) URL.revokeObjectURL(url);
    uploadPreviewUrls.current.clear();
    uploadItemsRef.current = [];
    setUploadItems([]);
    setUploadError("");
  }

  async function sendUploadQueue(items: UploadItem[]) {
    if (!session?.csrfToken || uploadGuard.current) return;
    uploadGuard.current = true;
    setUploading(true);
    setUploadError("");
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      await runUploadQueue({
        items, batchSize: session.limits.maxFilesPerBatch, signal: controller.signal,
        createBatch: async (count) => {
          const result = await apiJson<{ batchId: string }>("/api/photos/batches", {
            method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken! },
            body: JSON.stringify({ count, ...uploadDetails.current }),
          });
          return result.batchId;
        },
        send: (item, onProgress) => sendPhoto(item, session.csrfToken!, onProgress, controller.signal),
        update: updateUploadItem, onPhoto: addUploadedPhoto,
        errorMessage: (error) => error instanceof PhotoUploadError && error.code !== "connection_lost"
          ? photoErrorMessage(error.code, error.message, locale)
          : t("通信が途切れました。下の「再送する」でやり直せます。", "Connection interrupted. Use Retry below to try again."),
      });
    } catch (error) {
      if (!controller.signal.aborted) setUploadError(error instanceof Error ? error.message : t("追加を開始できませんでした。再送をお試しください。", "Could not start sending. Please retry."));
    } finally {
      if (!controller.signal.aborted) {
        uploadGuard.current = false;
        setUploading(false);
        void loadPhotos(true);
      }
    }
  }

  function beginUpload(items: UploadItem[], details: UploadDetails) {
    if (uploadGuard.current) return;
    clearUploadQueue();
    uploadDetails.current = details;
    setUploadCategory(details.category);
    for (const item of items) uploadPreviewUrls.current.add(item.previewUrl);
    uploadItemsRef.current = items;
    setUploadItems(items);
    setActiveCategory("all");
    setSelectionMode(false);
    void sendUploadQueue(items);
    requestAnimationFrame(() => galleryRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start",
    }));
  }

  function openPhoto(photo: Photo) { setLightboxPhoto(photo); }

  const completedUploads = uploadItems.filter((item) => item.status === "success" || item.status === "duplicate").length;
  const unfinishedUploads = uploadItems.length - completedUploads;
  const visibleUploads = uploadItems.filter((item) => activeCategory === "all" || (item.photo?.category ?? uploadCategory) === activeCategory);
  const queuePhotoIds = new Set(visibleUploads.flatMap((item) => item.photo ? [item.photo.id] : []));
  const otherPhotos = filteredPhotos.filter((photo) => !queuePhotoIds.has(photo.id));
  const visibleCount = visibleUploads.length + otherPhotos.length;

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadSelected() {
    if (!session?.csrfToken || selected.size < 1 || downloading) return;
    setDownloading(true);
    setGalleryError("");
    try {
      const result = await apiJson<{ downloadUrl: string }>("/api/photos/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({ ids: [...selected] }),
      });
      startBrowserDownload(result.downloadUrl);
      await new Promise((resolve) => window.setTimeout(resolve, 3_000));
    } catch (caught) {
      setGalleryError(caught instanceof Error ? caught.message : t("ダウンロードできませんでした。", "Photos could not be saved. Please try again."));
    } finally {
      setDownloading(false);
    }
  }

  async function downloadAll() {
    if (!session?.csrfToken || photos.length < 1 || downloading) return;
    setDownloading(true);
    setGalleryError("");
    try {
      const result = await apiJson<{ downloadUrl: string }>(
        "/api/photos/download-all",
        {
          method: "POST",
          headers: { "X-CSRF-Token": session.csrfToken },
        },
      );
      startBrowserDownload(result.downloadUrl);
      await new Promise((resolve) => window.setTimeout(resolve, 3_000));
    } catch (caught) {
      setGalleryError(caught instanceof Error ? caught.message : t("ダウンロードできませんでした。", "Photos could not be saved. Please try again."));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PhotoLocaleContext.Provider value={locale}>
    <main className="photos-page" lang={locale}>
      <header className="photos-header">
        {/* vinext serves the existing invitation as raw HTML; a plain document
            navigation preserves its opening/return-state behavior. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="photos-brand" href={`https://masato-haruka-wedding.com/?lang=${locale}`} aria-label="Masato and Haruka Wedding Top">
          Masato <i>&amp;</i> Haruka
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="photos-back" href={`https://masato-haruka-wedding.com/?lang=${locale}&from=photos#ceremony`}>
          <span aria-hidden="true">←</span> {t("招待状へ戻る", "Back to invitation")}
        </a>
        <div className="photos-language-switch" role="group" aria-label="言語 / Language">
          <button type="button" aria-pressed={locale === "ja"} onClick={() => changeLocale("ja")}>日本語</button>
          <button type="button" aria-pressed={locale === "en"} onClick={() => changeLocale("en")}>English</button>
        </div>
      </header>

      <section className="photos-intro" aria-labelledby="photos-title">
        <p className="photos-eyebrow">Guest Album</p>
        <h1 id="photos-title">{t("みんなの写真", "Guest photo album")}</h1>
        <p className="photos-lead">
          {t("みんなで撮った、大切な一日。", "Our day, through everyone’s eyes.")}
        </p>
      </section>

      {sessionError ? (
        <section className="photos-message-card" role="alert">
          <strong>{t("ページを準備できませんでした", "The album could not be loaded")}</strong><p>{sessionError}</p>
          <button type="button" onClick={() => window.location.reload()}>{t("再読み込み", "Reload")}</button>
        </section>
      ) : !session ? (
        <section className="photos-message-card" aria-live="polite">
          <span className="photos-spinner" aria-hidden="true" /><p>{t("アルバムを準備しています…", "Opening your album…")}</p>
        </section>
      ) : !session.authenticated ? (
        <AccessPanel
          configured={session.configured}
          onAuthenticated={(csrfToken) => {
            setSession({ ...session, authenticated: true, csrfToken });
            void loadPhotos();
          }}
        />
      ) : (
        <>
          <section className="photos-toolbar" aria-label={t("写真アルバムの操作", "Album actions")}>
            <div className="photos-toolbar__primary">
              <button className="photos-primary-button" type="button" disabled={uploading} onClick={() => setUploadOpen(true)}>
                <span aria-hidden="true">＋</span> {uploading ? t("アップロード中…", "Uploading…") : t("写真を追加する", "Add photos")}
              </button>
            </div>

            <details className="photos-filter-options">
              <summary>{t("場面", "Moment")}：{activeCategory === "all" ? t("すべて", "All") : categoryLabel(activeCategory, session.categories.find((category) => category.id === activeCategory)?.label ?? "", locale)}</summary>
              <div className="photos-filters" role="group" aria-label={t("場面で絞り込む", "Filter photos")}>
              {[{ id: "all", label: t("すべて", "All") }, ...session.categories].map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={activeCategory === category.id ? "is-active" : ""}
                  aria-pressed={activeCategory === category.id}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {categoryLabel(category.id, category.label, locale)}
                  <span>{category.id === "all" ? photos.length : photos.filter((photo) => photo.category === category.id).length}</span>
                </button>
              ))}
              </div>
            </details>

            <details className="photos-download-options" onToggle={(event) => { if (!event.currentTarget.open) setSelectionMode(false); }}>
              <summary>{t("まとめて保存", "Download multiple photos")}</summary>
              <div className="photos-selection-bar">
                <button
                  type="button"
                  className="photos-secondary-button"
                  onClick={() => setSelectionMode((current) => !current)}
                  aria-pressed={selectionMode}
                  disabled={photos.length < 1}
                >
                  {selectionMode ? t("選択を終える", "Finish selecting") : t("選択する", "Choose photos to save")}
                </button>
                {selectionMode ? (
                  <>
                    <p className="photos-selection-help">{t("保存したい写真をタップして選んでください。", "Tap the photos you want to save.")}</p>
                    <strong aria-live="polite">{t(`${selected.size}枚選択中`, `${selected.size} selected`)}</strong>
                    <button type="button" className="photos-text-button" onClick={() => setSelected(new Set())} disabled={selected.size < 1}>
                      {t("選択を解除", "Clear selection")}
                    </button>
                    <button type="button" className="photos-primary-button" onClick={downloadSelected} disabled={selected.size < 1 || downloading}>
                      {downloading ? t("準備中…", "Preparing…") : t("選んだ写真をZIPで保存", "Download selected as ZIP")}
                    </button>
                  </>
                ) : (
                  <button type="button" className="photos-secondary-button" onClick={downloadAll} disabled={photos.length < 1 || downloading}>
                    {downloading ? t("準備中…", "Preparing…") : t("すべてZIPで保存", "Download all as ZIP")}
                  </button>
                )}
              </div>
            </details>
          </section>

          <div className="photos-help-row">
            <p>{t("写真をタップで拡大。保存先はファイル／ダウンロードです。", "Tap a photo to view it. Downloads go to Files or Downloads.")}</p>
          </div>

          {galleryError ? (
            <p className="photos-gallery-error" role="alert"><span aria-hidden="true">!</span> {galleryError}</p>
          ) : null}

          <section ref={galleryRef} className="photos-gallery-section" aria-labelledby="photo-list-title">
            <div className="photos-gallery-heading">
              <h2 id="photo-list-title">{t("写真一覧", "Photos")}</h2>
              <span>{t(`${visibleCount}枚`, `${visibleCount} photos`)}</span>
              <button className="photos-text-button" type="button" onClick={() => void loadPhotos()} disabled={loadingPhotos}>{t("更新", "Refresh")}</button>
            </div>

            {uploadItems.length > 0 ? (
              <div className="photos-upload-summary">
                <div role="status" aria-live="polite" aria-atomic="true">
                  <strong>{uploading ? t(`写真を追加しています · ${completedUploads} / ${uploadItems.length}枚完了`, `Adding photos · ${completedUploads} / ${uploadItems.length} ready`)
                    : unfinishedUploads > 0 ? t(`${completedUploads}枚完了 · ${unfinishedUploads}枚を再送できます`, `${completedUploads} ready · ${unfinishedUploads} to retry`)
                    : t(`${completedUploads}枚の追加が完了しました`, `All ${completedUploads} photos are ready`)}</strong>
                  <p>{uploading ? t("一覧を見ながらお待ちいただけます。このページを開いたままにしてください。", "You can browse while waiting. Keep this page open until sending finishes.")
                    : unfinishedUploads > 0 ? t("完了した写真はそのままです。残りの写真だけやり直せます。", "Your completed photos are safe. Retry sends only the remaining photos.")
                    : t("写真をタップしてご覧いただけます。", "Tap a photo to view it.")}</p>
                </div>
                {!uploading && unfinishedUploads > 0 ? <button type="button" className="photos-primary-button" onClick={() => void sendUploadQueue(uploadItemsRef.current)}>{t(`${unfinishedUploads}枚を再送する`, `Retry ${unfinishedUploads} photos`)}</button> : null}
                {!uploading ? <button type="button" className="photos-text-button" onClick={clearUploadQueue}>{unfinishedUploads > 0 ? t("残りの追加をやめる", "Dismiss remaining photos") : t("閉じる", "Dismiss")}</button> : null}
                {uploadError ? <p className="photos-form-error" role="alert">{uploadError}</p> : null}
              </div>
            ) : null}

            {loadingPhotos && visibleCount < 1 ? (
              <div className="photos-empty-state" aria-live="polite"><span className="photos-spinner" aria-hidden="true" /><p>{t("写真を読み込んでいます…", "Loading photos…")}</p></div>
            ) : visibleCount < 1 && galleryError ? (
              <div className="photos-empty-state"><p>{t("通信を確認して、もう一度お試しください。", "Check your connection and try again.")}</p>
                <button className="photos-secondary-button" type="button" onClick={() => void loadPhotos()}>{t("もう一度読み込む", "Retry")}</button></div>
            ) : visibleCount < 1 ? (
              <div className="photos-empty-state">
                <span className="photos-empty-state__mark" aria-hidden="true">◇</span>
                <h3>{photos.length < 1 ? t("最初の一枚をお待ちしています", "No photos yet") : t("この場面の写真はまだありません", "No photos in this category yet")}</h3>
                <p>{t("撮影した写真を、ぜひ追加してください。", "Share a photo from the wedding to start the album.")}</p>
                <button className="photos-primary-button" type="button" disabled={uploading} onClick={() => setUploadOpen(true)}>{t("写真を追加する", "Add photos")}</button>
              </div>
            ) : (
              <div className="photos-grid">
                {visibleUploads.map((item) => (
                  <UploadPhotoCard key={item.id} item={item} onView={openPhoto} onSelect={toggleSelected} keepAlbumOpen={uploading}
                    selectionMode={selectionMode} selected={selectionMode && Boolean(item.photo && selected.has(item.photo.id))} />
                ))}
                {otherPhotos.map((photo) => {
                  const isSelected = selectionMode && selected.has(photo.id);
                  const label = makePhotoAlt(photo, session.categories, locale);
                  return (
                    <article className={`photos-card${isSelected ? " is-selected" : ""}`} key={photo.id}>
                      <button
                        className="photos-card__image-button"
                        type="button"
                        onClick={() => selectionMode ? toggleSelected(photo.id) : openPhoto(photo)}
                        aria-label={selectionMode ? t(`${label}を${isSelected ? "選択解除" : "選択"}`, `${isSelected ? "Deselect" : "Select"} ${label}`) : t(`${label}を拡大表示`, `View ${label}`)}
                        aria-pressed={selectionMode ? isSelected : undefined}
                      >
                        <PhotoImage compact thumbnailUrl={photo.thumbnailUrl} alt={label} retryKey={galleryRevision + (imageRetries[photo.id] ?? 0)}
                          onState={(failed) => setBrokenImages((current) => {
                            if (current.has(photo.id) === failed) return current;
                            const next = new Set(current); if (failed) next.add(photo.id); else next.delete(photo.id); return next;
                          })} />
                        {selectionMode ? <span className="photos-card__check" aria-hidden="true">{isSelected ? "✓" : ""}</span> : <span className="photos-card__zoom" aria-hidden="true">＋</span>}
                      </button>
                      <div className="photos-card__meta">
                        <strong>{categoryLabel(photo.category, session.categories.find((item) => item.id === photo.category)?.label ?? "", locale)}</strong>
                        <span>{photo.uploaderName ? t(`${photo.uploaderName}さん`, photo.uploaderName) : formatDate(photo.createdAt, locale)}</span>
                        {brokenImages.has(photo.id) ? <button className="photos-text-button" type="button" onClick={() => setImageRetries((current) => ({ ...current, [photo.id]: (current[photo.id] ?? 0) + 1 }))}>{t("もう一度読み込む", "Retry photo")}</button> : null}
                        <PhotoSaveButton photo={photo} keepAlbumOpen={uploading} />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <footer className="photos-footer">
            <p>Thank you for sharing our day.</p>
            <a href={`/photos/admin?lang=${locale}`}>{t("管理者の方はこちら", "For the hosts")}</a>
          </footer>

          <UploadDialog
            open={uploadOpen}
            session={session}
            onClose={() => setUploadOpen(false)}
            onStart={beginUpload}
          />
          <PhotoLightbox
            photo={lightboxPhoto}
            photos={filteredPhotos}
            categories={session.categories}
            onChange={openPhoto}
            onClose={() => setLightboxPhoto(null)}
            keepAlbumOpen={uploading}
          />
        </>
      )}
    </main>
    </PhotoLocaleContext.Provider>
  );
}

export function PhotosApp() {
  return <PhotosAlbum />;
}
