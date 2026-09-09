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
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorBody;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "処理を完了できませんでした。もう一度お試しください。",
    );
  }

  return payload;
}

function startBrowserDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  document.body.append(link);
  link.click();
  link.remove();
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
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

function makePhotoAlt(photo: Photo, categories: Category[]) {
  const category = categories.find((item) => item.id === photo.category)?.label ?? "結婚式";
  return photo.uploaderName
    ? `${category}の写真（${photo.uploaderName}さんより）`
    : `${category}の写真`;
}

function AccessPanel({
  configured,
  onAuthenticated,
}: {
  configured: boolean;
  onAuthenticated: (csrfToken: string) => void;
}) {
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
        body: JSON.stringify({ code }),
      });
      onAuthenticated(result.csrfToken);
      setCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "共有コードを確認してください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="photos-access-card" aria-labelledby="photos-access-title">
      <div>
        <p className="photos-eyebrow">For Our Guests</p>
        <h2 id="photos-access-title">
          {configured ? "共有コードを入力" : "アクセス設定が必要です"}
        </h2>
        <p>
          {configured
            ? "招待状と一緒にお知らせした共有コードを入力してください。"
            : "環境変数の設定後に、写真の追加と閲覧をご利用いただけます。"}
        </p>
      </div>

      {configured ? (
        <form className="photos-access-form" onSubmit={submit}>
          <label htmlFor="photo-access-code">共有コード</label>
          <div className="photos-access-form__row">
            <input
              id="photo-access-code"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              required
            />
            <button type="submit" disabled={submitting || !code}>
              {submitting ? "確認中…" : "アルバムを開く"}
            </button>
          </div>
          {error ? (
            <p className="photos-form-error" role="alert">
              <span aria-hidden="true">!</span> {error}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="photos-setup-note" role="status">
          管理者向けの設定手順はリポジトリの README に記載しています。
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadGuard = useRef(false);
  const previewUrls = useRef(new Set<string>());
  const [items, setItems] = useState<UploadItem[]>([]);
  const [category, setCategory] = useState(session.categories[0]?.id ?? "other");
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
      return "HEIC／HEIFには現在対応していません。JPEGへ変換してください。";
    }
    if (
      file.type &&
      file.type !== "application/octet-stream" &&
      !session.supportedTypes.includes(file.type)
    ) {
      return "JPEG、PNG、WebPの画像を選んでください。";
    }
    if (file.size > session.limits.maxFileBytes) {
      return `1枚あたり${Math.floor(session.limits.maxFileBytes / 1_000_000)}MBまでです。`;
    }
    if (file.size < 1) {
      return "空のファイルは追加できません。";
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
        setBatchError(`写真は1回につき${session.limits.maxFilesPerBatch}枚まで選べます。`);
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
            message: "アップロード中",
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
            message: payload.duplicate ? "登録済み" : "追加しました",
          });
          onPhoto(payload.photo);
        } else if (request.status === 409 && payload.error?.code === "duplicate_photo") {
          updateItem(item.id, {
            status: "duplicate",
            progress: 100,
            message: payload.error.message ?? "同じ写真は登録済みです",
          });
        } else {
          updateItem(item.id, {
            status: "error",
            progress: 100,
            message: payload.error?.message ?? "アップロードできませんでした。",
          });
        }
        resolve();
      });
      request.addEventListener("error", () => {
        updateItem(item.id, {
          status: "error",
          progress: 100,
          message: "通信できませんでした。もう一度お試しください。",
        });
        resolve();
      });
      request.send(item.file);
    });
  }

  async function startUpload() {
    if (uploadGuard.current || uploading) return;
    const uploadable = items.filter((item) => item.status === "queued");
    if (uploadable.length < 1) {
      setBatchError("アップロードできる写真を選んでください。");
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
        caught instanceof Error ? caught.message : "アップロードを開始できませんでした。",
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
          <h2 id="upload-dialog-title">写真を追加する</h2>
        </div>
        <button
          className="photos-icon-button"
          type="button"
          onClick={requestClose}
          disabled={uploading}
          aria-label="写真追加画面を閉じる"
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
            accept="image/*"
            multiple
            disabled={uploading || items.length >= session.limits.maxFilesPerBatch}
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <span className="photos-drop-zone__mark" aria-hidden="true">＋</span>
          <strong>写真を選ぶ</strong>
          <p>スマートフォンから選択、またはPCからドラッグ＆ドロップ</p>
          <small>
            JPEG・PNG・WebP / 1枚{Math.floor(session.limits.maxFileBytes / 1_000_000)}MBまで / 最大
            {session.limits.maxFilesPerBatch}枚
          </small>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || items.length >= session.limits.maxFilesPerBatch}
          >
            ファイルを選択
          </button>
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {items.length > 0
              ? `${items.length}枚を選択中。エラー${errorCount}枚。`
              : "写真は選択されていません。"}
          </p>

        {items.length > 0 ? (
          <div
            className="photos-upload-preview"
            aria-label="選択した写真"
            aria-busy={uploading}
          >
            {items.map((item) => (
              <article className={`photos-upload-item is-${item.status}`} key={item.id}>
                <div className="photos-upload-item__image">
                  {/* Browser previews are local-only and are never treated as saved data. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl} alt={`${item.file.name}のプレビュー`} />
                </div>
                <div className="photos-upload-item__body">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <small>{formatFileSize(item.file.size)}</small>
                  {item.status === "uploading" ? (
                    <progress value={item.progress} max="100" aria-label={`${item.file.name}の進捗`} />
                  ) : null}
                  <span className="photos-upload-item__status">
                    {item.status === "success" ? "✓ " : item.status === "error" ? "! " : ""}
                    {item.message || "待機中"}
                  </span>
                </div>
                {!uploading && item.status !== "success" ? (
                  <button type="button" onClick={() => removeItem(item.id)} aria-label={`${item.file.name}を選択から外す`}>
                    ×
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        <div className="photos-upload-fields">
          <label>
            <span>場面</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={uploading}>
              {session.categories.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>投稿者名 <small>任意</small></span>
            <input
              type="text"
              value={uploaderName}
              onChange={(event) => setUploaderName(event.target.value)}
              maxLength={60}
              disabled={uploading}
              placeholder="例：はるかの友人"
            />
          </label>
          <label className="photos-upload-fields__comment">
            <span>コメント <small>任意</small></span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={300}
              rows={3}
              disabled={uploading}
              placeholder="写真にまつわるひとこと"
            />
          </label>
        </div>

        {uploading || complete ? (
          <div className="photos-overall-progress" aria-live="polite">
            <div>
              <strong>{uploading ? "アップロードしています" : "アップロードが完了しました"}</strong>
              <span>{overallProgress}%</span>
            </div>
            <progress value={overallProgress} max="100" aria-label="アップロード全体の進捗" />
            {complete ? (
              <p>成功 {successCount}枚 / 登録済み {duplicateCount}枚 / エラー {errorCount}枚</p>
            ) : null}
          </div>
        ) : null}

        {batchError ? (
          <p className="photos-form-error" role="alert"><span aria-hidden="true">!</span> {batchError}</p>
        ) : null}
      </div>

      <div className="photos-dialog-footer">
        <button type="button" className="photos-secondary-button" onClick={requestClose} disabled={uploading}>
          {complete ? "完了" : "キャンセル"}
        </button>
        {!complete ? (
          <button
            type="button"
            className="photos-primary-button"
            onClick={startUpload}
            disabled={uploading || items.every((item) => item.status !== "queued")}
          >
            {uploading ? "追加しています…" : `${items.filter((item) => item.status === "queued").length}枚を追加する`}
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
      aria-label="写真の拡大表示"
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
          <button ref={closeRef} className="photos-lightbox__close" type="button" onClick={onClose} aria-label="拡大表示を閉じる">×</button>
          <div className="photos-lightbox__image-wrap">
            {imageFailed ? (
              <p role="alert">画像を読み込めませんでした。</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.viewUrl}
                alt={makePhotoAlt(photo, categories)}
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
                aria-label="前の写真を表示"
              >←</button>
              <button
                className="photos-lightbox__nav photos-lightbox__nav--next"
                type="button"
                onClick={() => onChange(photos[(index + 1) % photos.length])}
                aria-label="次の写真を表示"
              >→</button>
            </>
          ) : null}
          <aside className="photos-lightbox__meta">
            <div>
              <span>{index + 1} / {photos.length}</span>
              <strong>{categories.find((item) => item.id === photo.category)?.label}</strong>
            </div>
            {photo.uploaderName ? <p>{photo.uploaderName}さんより</p> : null}
            {photo.comment ? <p className="photos-lightbox__comment">{photo.comment}</p> : null}
            <small>{formatDate(photo.createdAt)} · {formatFileSize(photo.fileSize)}</small>
            <a className="photos-primary-button" href={photo.downloadUrl} download>
              原本をダウンロード
            </a>
          </aside>
        </div>
      ) : null}
    </dialog>
  );
}

export function PhotosApp() {
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
      setSelected((current) => {
        const available = new Set(result.photos.map((photo) => photo.id));
        return new Set([...current].filter((id) => available.has(id)));
      });
    } catch (caught) {
      setGalleryError(caught instanceof Error ? caught.message : "写真を読み込めませんでした。");
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
          setSessionError(caught instanceof Error ? caught.message : "ページを準備できませんでした。");
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
      setGalleryError(caught instanceof Error ? caught.message : "ダウンロードできませんでした。");
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
      setGalleryError(caught instanceof Error ? caught.message : "ダウンロードできませんでした。");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="photos-page">
      <header className="photos-header">
        {/* vinext serves the existing invitation as raw HTML; a plain document
            navigation preserves its opening/return-state behavior. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="photos-brand" href="/" aria-label="Masato and Haruka Wedding Top">
          Masato <i>&amp;</i> Haruka
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="photos-back" href="/?from=photos#ceremony">
          <span aria-hidden="true">←</span> Wedding Topへ戻る
        </a>
      </header>

      <section className="photos-intro" aria-labelledby="photos-title">
        <p className="photos-eyebrow">Guest Album</p>
        <h1 id="photos-title">みんなの写真</h1>
        <p className="photos-lead">
          結婚式当日の思い出を、みんなで集めるアルバムです。<br />
          撮影した写真を、ぜひこちらに追加してください。
        </p>
      </section>

      {sessionError ? (
        <section className="photos-message-card" role="alert">
          <strong>ページを準備できませんでした</strong><p>{sessionError}</p>
          <button type="button" onClick={() => window.location.reload()}>再読み込み</button>
        </section>
      ) : !session ? (
        <section className="photos-message-card" aria-live="polite">
          <span className="photos-spinner" aria-hidden="true" /><p>アルバムを準備しています…</p>
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
          <section className="photos-toolbar" aria-label="写真アルバムの操作">
            <div className="photos-toolbar__primary">
              <button className="photos-primary-button" type="button" onClick={() => setUploadOpen(true)}>
                <span aria-hidden="true">＋</span> 写真を追加する
              </button>
              <div>
                <strong>{photos.length}枚の思い出</strong>
                <span>新しい写真から表示しています</span>
              </div>
            </div>

            <div className="photos-filters" role="group" aria-label="場面で絞り込む">
              {[{ id: "all", label: "すべて" }, ...session.categories].map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={activeCategory === category.id ? "is-active" : ""}
                  aria-pressed={activeCategory === category.id}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {category.label}
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
                {selectionMode ? "選択を終える" : "選択する"}
              </button>
              {selectionMode ? (
                <>
                  <strong aria-live="polite">{selected.size}枚選択中</strong>
                  <button type="button" className="photos-text-button" onClick={() => setSelected(new Set())} disabled={selected.size < 1}>
                    選択を解除
                  </button>
                  <button type="button" className="photos-primary-button" onClick={downloadSelected} disabled={selected.size < 1 || downloading}>
                    {downloading ? "準備中…" : "選択した写真をダウンロード"}
                  </button>
                </>
              ) : (
                <button type="button" className="photos-secondary-button" onClick={downloadAll} disabled={photos.length < 1 || downloading}>
                  {downloading ? "準備中…" : "すべてダウンロード"}
                </button>
              )}
            </div>
          </section>

          {galleryError ? (
            <p className="photos-gallery-error" role="alert"><span aria-hidden="true">!</span> {galleryError}</p>
          ) : null}

          <section className="photos-gallery-section" aria-labelledby="photo-list-title">
            <div className="photos-gallery-heading">
              <div><p className="photos-eyebrow">Shared Memories</p><h2 id="photo-list-title">写真一覧</h2></div>
              <span>{filteredPhotos.length}枚</span>
            </div>

            {loadingPhotos ? (
              <div className="photos-empty-state" aria-live="polite"><span className="photos-spinner" aria-hidden="true" /><p>写真を読み込んでいます…</p></div>
            ) : filteredPhotos.length < 1 ? (
              <div className="photos-empty-state">
                <span className="photos-empty-state__mark" aria-hidden="true">◇</span>
                <h3>{photos.length < 1 ? "最初の一枚をお待ちしています" : "この場面の写真はまだありません"}</h3>
                <p>撮影した写真を追加して、みんなで思い出を集めましょう。</p>
                <button className="photos-primary-button" type="button" onClick={() => setUploadOpen(true)}>写真を追加する</button>
              </div>
            ) : (
              <div className="photos-grid">
                {filteredPhotos.map((photo) => {
                  const isSelected = selected.has(photo.id);
                  const label = makePhotoAlt(photo, session.categories);
                  return (
                    <article className={`photos-card${isSelected ? " is-selected" : ""}`} key={photo.id}>
                      <button
                        className="photos-card__image-button"
                        type="button"
                        onClick={() => selectionMode ? toggleSelected(photo.id) : setLightboxPhoto(photo)}
                        aria-label={selectionMode ? `${label}を${isSelected ? "選択解除" : "選択"}` : `${label}を拡大表示`}
                        aria-pressed={selectionMode ? isSelected : undefined}
                      >
                        {brokenImages.has(photo.id) ? (
                          <span className="photos-card__broken">画像を読み込めません</span>
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
                        <strong>{session.categories.find((item) => item.id === photo.category)?.label}</strong>
                        <span>{photo.uploaderName ? `${photo.uploaderName}さん` : formatDate(photo.createdAt)}</span>
                        <a href={photo.downloadUrl} download aria-label={`${label}の原本をダウンロード`}>↓</a>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <footer className="photos-footer">
            <p>Thank you for sharing our day.</p>
            <a href="/photos/admin">管理者の方はこちら</a>
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
  );
}
