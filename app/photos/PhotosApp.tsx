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

type UploadStatus = "queued" | "uploading" | "success" | "duplicate" | "error";

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: UploadStatus;
  message: string;
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const locale = (): PhotoLocale => typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ja";
  try {
    const response = await fetch(url, { credentials: "same-origin", signal: controller.signal, ...init });
    const payload = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
    if (!response.ok) throw new Error(photoErrorMessage(payload.error?.code, payload.error?.message, locale()));
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

function AccessPanel({
  configured,
  onAuthenticated,
}: {
  configured: boolean;
  onAuthenticated: (csrfToken: string) => void;
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
              {submitting ? t("確認中…", "Checking…") : t("アルバムを開く", "Open album")}
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
  onPhoto,
}: {
  open: boolean;
  session: SessionInfo;
  onClose: () => void;
  onPhoto: (photo: Photo) => void;
}) {
  const { locale, t } = usePhotoText();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadGuard = useRef(false);
  const previewUrls = useRef(new Set<string>());
  const [items, setItems] = useState<UploadItem[]>([]);
  const [category, setCategory] = useState("other");
  const [uploaderName, setUploaderName] = useState("");
  const [comment, setComment] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [complete, setComplete] = useState(false);

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
    setBatchError("");
    setComplete(false);
  }, []);

  function requestClose() {
    if (uploading) return;
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
    setBatchError("");
    setComplete(false);
    setItems((current) => {
      const available = Math.max(0, session.limits.maxFilesPerBatch - current.length);
      const accepted = files.slice(0, available);
      if (files.length > available) {
        setBatchError(t(`写真は1回につき${session.limits.maxFilesPerBatch}枚まで選べます。`, `You can choose up to ${session.limits.maxFilesPerBatch} photos at a time.`));
      }

      const next = accepted.map((file) => {
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
    if (!uploading) addFiles(Array.from(event.dataTransfer.files));
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function uploadOne(item: UploadItem, batchId: string, fileIndex: number): Promise<void> {
    return new Promise((resolve) => {
      const request = new XMLHttpRequest();
      const query = new URLSearchParams({
        batchId,
        fileIndex: String(fileIndex),
      });

      request.open("POST", `/api/photos?${query}`);
      request.withCredentials = true;
      request.timeout = 120_000;
      request.setRequestHeader("X-CSRF-Token", session.csrfToken ?? "");
      request.setRequestHeader(
        "Content-Type",
        item.file.type || "application/octet-stream",
      );
      request.setRequestHeader("X-Photo-Filename", encodeURIComponent(item.file.name));
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          updateItem(item.id, {
            status: "uploading",
            progress: Math.round((event.loaded / event.total) * 100),
            message: t("アップロード中", "Sending…"),
          });
        }
      });
      request.addEventListener("load", () => {
        const payload = (() => {
          try {
            return JSON.parse(request.responseText) as {
              photo?: Photo;
              duplicate?: boolean;
              error?: { code?: string; message?: string };
            };
          } catch {
            return {};
          }
        })();

        if (request.status >= 200 && request.status < 300 && payload.photo) {
          updateItem(item.id, {
            status: payload.duplicate ? "duplicate" : "success",
            progress: 100,
            message: payload.duplicate ? t("登録済み", "Already shared") : t("追加しました", "Added"),
          });
          onPhoto(payload.photo);
        } else if (request.status === 409 && payload.error?.code === "duplicate_photo") {
          updateItem(item.id, {
            status: "duplicate",
            progress: 100,
            message: t("同じ写真は登録済みです", "This photo is already shared."),
          });
        } else {
          updateItem(item.id, {
            status: "error",
            progress: 100,
            message: photoErrorMessage(payload.error?.code, payload.error?.message, locale),
          });
        }
        resolve();
      });
      request.addEventListener("error", () => {
        updateItem(item.id, {
          status: "error",
          progress: 100,
          message: t("通信できませんでした。もう一度お試しください。", "Connection lost. Please try again."),
        });
        resolve();
      });
      for (const event of ["timeout", "abort"]) {
        request.addEventListener(event, () => {
          updateItem(item.id, { status: "error", progress: 0, message: t("通信が途切れました。「もう一度追加する」で再送できます。", "Connection interrupted. Use Retry to send this photo again.") });
          resolve();
        });
      }
      updateItem(item.id, { status: "uploading", progress: 0, message: t("追加しています…", "Sending…") });
      request.send(item.file);
    });
  }

  async function startUpload() {
    if (uploadGuard.current || uploading) return;
    const uploadable = items.filter((item) => item.status === "queued" || (item.status === "error" && !validateFile(item.file)));
    if (uploadable.length < 1) {
      setBatchError(t("アップロードできる写真を選んでください。", "Please choose photos to add."));
      return;
    }

    uploadGuard.current = true;
    setUploading(true);
    setBatchError("");
    setComplete(false);

    try {
      const batch = await apiJson<{ batchId: string }>("/api/photos/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken ?? "",
        },
        body: JSON.stringify({
          count: uploadable.length,
          category,
          uploaderName,
          comment,
        }),
      });

      let cursor = 0;
      async function worker() {
        while (cursor < uploadable.length) {
          const index = cursor;
          cursor += 1;
          await uploadOne(uploadable[index], batch.batchId, index);
        }
      }
      await Promise.all([worker(), worker()]);
      setComplete(true);
    } catch (caught) {
      setBatchError(
        caught instanceof Error ? caught.message : t("アップロードを開始できませんでした。", "Photos could not be sent. Please try again."),
      );
    } finally {
      uploadGuard.current = false;
      setUploading(false);
    }
  }

  const overallProgress = complete
    ? 100
    : items.length > 0
      ? Math.round(items.reduce((total, item) => total + item.progress, 0) / items.length)
      : 0;
  const retryableCount = items.filter((item) => item.status === "error" && !validateFile(item.file)).length;
  const successCount = items.filter((item) => item.status === "success").length;
  const duplicateCount = items.filter((item) => item.status === "duplicate").length;
  const errorCount = items.filter((item) => item.status === "error").length;

  return (
    <dialog
      ref={dialogRef}
      className="photos-upload-dialog"
      aria-labelledby="upload-dialog-title"
      onCancel={(event) => {
        if (uploading) event.preventDefault();
        else requestClose();
      }}
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
          disabled={uploading}
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
            disabled={uploading || items.length >= session.limits.maxFilesPerBatch}
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <span className="photos-drop-zone__mark" aria-hidden="true">＋</span>
          <strong>{t("写真を選ぶ", "Choose photos")}</strong>
          <p>{t("スマートフォンの写真から選べます。", "Choose from your phone. On a computer, you can also drag photos here.")}</p>
          <small>
            {t(`JPEG・PNG・WebP ／ 1枚${Math.floor(session.limits.maxFileBytes / 1_000_000)}MBまで ／ 1回${session.limits.maxFilesPerBatch}枚まで`, `JPEG, PNG or WebP · Up to ${Math.floor(session.limits.maxFileBytes / 1_000_000)}MB each · ${session.limits.maxFilesPerBatch} photos at a time`)}
          </small>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || items.length >= session.limits.maxFilesPerBatch}
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
            aria-busy={uploading}
          >
            {items.map((item) => (
              <article className={`photos-upload-item is-${item.status}`} key={item.id}>
                <div className="photos-upload-item__image">
                  {/* Browser previews are local-only and are never treated as saved data. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl} alt={t(`${item.file.name}のプレビュー`, `Preview of ${item.file.name}`)} />
                </div>
                <div className="photos-upload-item__body">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <small>{formatFileSize(item.file.size)}</small>
                  {item.status === "uploading" ? (
                    <progress value={item.progress} max="100" aria-label={t(`${item.file.name}の進捗`, `Progress for ${item.file.name}`)} />
                  ) : null}
                  <span className="photos-upload-item__status">
                    {item.status === "success" ? "✓ " : item.status === "error" ? "! " : ""}
                    {item.message || t("待機中", "Ready to send")}
                  </span>
                </div>
                {!uploading && item.status !== "success" ? (
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
            <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={uploading}>
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
              disabled={uploading}
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
              disabled={uploading}
              placeholder={t("写真にまつわるひとこと", "A message about these photos")}
            />
          </label>
        </div>

        </details>

        {uploading || complete ? (
          <div className="photos-overall-progress" aria-live="polite">
            <div>
              <strong>{uploading ? t("アップロードしています", "Sending your photos…") : errorCount > 0 ? t("追加できなかった写真があります", "Some photos could not be added") : t("アップロードが完了しました", "Your photos have been added")}</strong>
              <span>{overallProgress}%</span>
            </div>
            <progress value={overallProgress} max="100" aria-label={t("アップロード全体の進捗", "Overall upload progress")} />
            {complete ? (
              <p>{t(`${successCount}枚追加 ／ ${duplicateCount}枚は登録済み ／ ${errorCount}枚は追加できませんでした`, `${successCount} added · ${duplicateCount} already shared · ${errorCount} could not be added`)}</p>
            ) : null}
          </div>
        ) : null}

        {batchError ? (
          <p className="photos-form-error" role="alert"><span aria-hidden="true">!</span> {batchError}</p>
        ) : null}
      </div>

      <div className="photos-dialog-footer">
        <button type="button" className="photos-secondary-button" onClick={requestClose} disabled={uploading}>
          {complete ? t("完了", "Done") : t("キャンセル", "Cancel")}
        </button>
        {!complete || retryableCount > 0 ? (
          <button
            type="button"
            className="photos-primary-button"
            onClick={startUpload}
            disabled={uploading || (items.every((item) => item.status !== "queued") && retryableCount < 1)}
          >
            {uploading ? t("追加しています…", "Sending…") : complete ? t("失敗した写真をもう一度追加する", "Retry failed photos") : t(`${items.filter((item) => item.status === "queued").length}枚を追加する`, `Add ${items.filter((item) => item.status === "queued").length} photos`)}
          </button>
        ) : null}
      </div>
    </dialog>
  );
}

function PhotoLightbox({
  photo,
  photos,
  categories,
  onChange,
  onClose,
}: {
  photo: Photo | null;
  photos: Photo[];
  categories: Category[];
  onChange: (photo: Photo) => void;
  onClose: () => void;
}) {
  const { locale, t } = usePhotoText();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [failedPhotoId, setFailedPhotoId] = useState<string | null>(null);
  const index = photo ? photos.findIndex((item) => item.id === photo.id) : -1;
  const imageFailed = Boolean(photo && failedPhotoId === photo.id);

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
            {imageFailed ? (
              <p role="alert">{t("画像を読み込めませんでした。", "This photo could not be loaded.")}</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.viewUrl}
                alt={makePhotoAlt(photo, categories, locale)}
                onError={() => setFailedPhotoId(photo.id)}
              />
            )}
          </div>
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
          <aside className="photos-lightbox__meta">
            <div>
              <span>{index + 1} / {photos.length}</span>
              <strong>{categoryLabel(photo.category, categories.find((item) => item.id === photo.category)?.label ?? "", locale)}</strong>
            </div>
            {photo.uploaderName ? <p>{t(`${photo.uploaderName}さんより`, `Shared by ${photo.uploaderName}`)}</p> : null}
            {photo.comment ? <p className="photos-lightbox__comment">{photo.comment}</p> : null}
            <small>{formatDate(photo.createdAt, locale)} · {formatFileSize(photo.fileSize)}</small>
            <a className="photos-primary-button" href={photo.downloadUrl} download>
              {t("この写真を保存", "Save this photo")}
            </a>
          </aside>
        </div>
      ) : null}
    </dialog>
  );
}

export function PhotosApp() {
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
    changeLocale(initial === "en" ? "en" : "ja");
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
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  const loadPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    setGalleryError("");
    try {
      const result = await apiJson<{ photos: Photo[] }>("/api/photos");
      setPhotos(result.photos);
      setBrokenImages(new Set());
      setSelected((current) => {
        const available = new Set(result.photos.map((photo) => photo.id));
        return new Set([...current].filter((id) => available.has(id)));
      });
    } catch (caught) {
      setGalleryError(caught instanceof Error ? caught.message : t("写真を読み込めませんでした。", "Photos could not be loaded. Please try again."));
    } finally {
      setLoadingPhotos(false);
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
          {t("撮った写真を追加。気に入った写真を保存。みんなで思い出を共有しましょう。", "Add your photos. Save your favorites. Share memories of our day.")}
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
              <button className="photos-primary-button" type="button" onClick={() => setUploadOpen(true)}>
                <span aria-hidden="true">＋</span> {t("写真を追加する", "Add photos")}
              </button>
              <div>
                <strong>{t(`${photos.length}枚の写真`, `${photos.length} photos`)}</strong>
                <span>{t("新しい写真から表示しています", "Newest photos first")}</span>
              </div>
            </div>

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
                    {downloading ? t("準備中…", "Preparing…") : t("選んだ写真をまとめて保存", "Save selected photos")}
                  </button>
                </>
              ) : (
                <button type="button" className="photos-secondary-button" onClick={downloadAll} disabled={photos.length < 1 || downloading}>
                  {downloading ? t("準備中…", "Preparing…") : t("すべてまとめて保存", "Save all photos")}
                </button>
              )}
            </div>
          </section>

          <div className="photos-help-row">
            <p>{t("写真をタップすると大きく見られます。「保存」で1枚ずつ保存できます。", "Tap a photo to view it. Use Save to download one photo at a time.")}</p>
            <button className="photos-secondary-button" type="button" onClick={() => void loadPhotos()} disabled={loadingPhotos}>{t("最新の写真を表示", "Refresh photos")}</button>
          </div>
          <details className="photos-save-help">
            <summary>{t("保存した写真はどこにある？", "Where are my saved photos?")}</summary>
            <p>{t("スマートフォンでは「ファイル」や「ダウンロード」に保存されます。写真アプリに入れるときは、保存した写真の共有メニューから「画像を保存」を選んでください。まとめて保存したZIPは開いて展開できます。", "On your phone, look in Files or Downloads. To add a photo to your Photos app, open the downloaded photo and choose Save Image from its share menu. Open a ZIP file to extract photos saved together.")}</p>
          </details>

          {galleryError ? (
            <p className="photos-gallery-error" role="alert"><span aria-hidden="true">!</span> {galleryError}</p>
          ) : null}

          <section className="photos-gallery-section" aria-labelledby="photo-list-title">
            <div className="photos-gallery-heading">
              <div><p className="photos-eyebrow">Shared Memories</p><h2 id="photo-list-title">{t("写真一覧", "Photos")}</h2></div>
              <span>{t(`${filteredPhotos.length}枚`, `${filteredPhotos.length} photos`)}</span>
            </div>

            {loadingPhotos ? (
              <div className="photos-empty-state" aria-live="polite"><span className="photos-spinner" aria-hidden="true" /><p>{t("写真を読み込んでいます…", "Loading photos…")}</p></div>
            ) : filteredPhotos.length < 1 ? (
              <div className="photos-empty-state">
                <span className="photos-empty-state__mark" aria-hidden="true">◇</span>
                <h3>{photos.length < 1 ? t("最初の一枚をお待ちしています", "No photos yet") : t("この場面の写真はまだありません", "No photos in this category yet")}</h3>
                <p>{t("撮影した写真を、ぜひ追加してください。", "Share a photo from the wedding to start the album.")}</p>
                <button className="photos-primary-button" type="button" onClick={() => setUploadOpen(true)}>{t("写真を追加する", "Add photos")}</button>
              </div>
            ) : (
              <div className="photos-grid">
                {filteredPhotos.map((photo) => {
                  const isSelected = selected.has(photo.id);
                  const label = makePhotoAlt(photo, session.categories, locale);
                  return (
                    <article className={`photos-card${isSelected ? " is-selected" : ""}`} key={photo.id}>
                      <button
                        className="photos-card__image-button"
                        type="button"
                        onClick={() => selectionMode ? toggleSelected(photo.id) : setLightboxPhoto(photo)}
                        aria-label={selectionMode ? t(`${label}を${isSelected ? "選択解除" : "選択"}`, `${isSelected ? "Deselect" : "Select"} ${label}`) : t(`${label}を拡大表示`, `View ${label}`)}
                        aria-pressed={selectionMode ? isSelected : undefined}
                      >
                        {brokenImages.has(photo.id) ? (
                          <span className="photos-card__broken">{t("画像を読み込めません", "Photo unavailable")}</span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo.thumbnailUrl}
                            alt={label}
                            width={photo.width}
                            height={photo.height}
                            loading="lazy"
                            decoding="async"
                            onError={() => setBrokenImages((current) => new Set(current).add(photo.id))}
                          />
                        )}
                        {selectionMode ? <span className="photos-card__check" aria-hidden="true">{isSelected ? "✓" : ""}</span> : <span className="photos-card__zoom" aria-hidden="true">＋</span>}
                      </button>
                      <div className="photos-card__meta">
                        <strong>{categoryLabel(photo.category, session.categories.find((item) => item.id === photo.category)?.label ?? "", locale)}</strong>
                        <span>{photo.uploaderName ? t(`${photo.uploaderName}さん`, photo.uploaderName) : formatDate(photo.createdAt, locale)}</span>
                        <a href={photo.downloadUrl} download aria-label={t(`${label}を保存`, `Save ${label}`)}>{t("保存", "Save")}</a>
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
            onPhoto={addUploadedPhoto}
          />
          <PhotoLightbox
            photo={lightboxPhoto}
            photos={filteredPhotos}
            categories={session.categories}
            onChange={setLightboxPhoto}
            onClose={() => setLightboxPhoto(null)}
          />
        </>
      )}
    </main>
    </PhotoLocaleContext.Provider>
  );
}
