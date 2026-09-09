"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  apiJson,
  formatDate,
  formatFileSize,
  type Photo,
  type SessionInfo,
} from "../PhotosApp";

interface AdminPhoto extends Photo {
  isVisible: boolean;
}

export function PhotosAdminApp() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiJson<{ photos: AdminPhoto[] }>("/api/admin/photos");
      setPhotos(result.photos);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "写真一覧を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void apiJson<SessionInfo>("/api/photos/session")
      .then((result) => {
        if (!cancelled) {
          setSession(result);
          setLoading(false);
          if (result.admin) void loadPhotos();
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "管理ページを準備できませんでした。");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadPhotos]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code || submitting || !session) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await apiJson<{ csrfToken: string }>("/api/photos/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      setSession({
        ...session,
        authenticated: true,
        admin: true,
        csrfToken: result.csrfToken,
      });
      setCode("");
      await loadPhotos();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "管理者コードを確認してください。");
    } finally {
      setSubmitting(false);
    }
  }

  async function setVisibility(photo: AdminPhoto) {
    if (!session?.csrfToken || busyId) return;
    setBusyId(photo.id);
    setError("");
    try {
      const result = await apiJson<{ photo: AdminPhoto }>(`/api/admin/photos/${photo.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({ visible: !photo.isVisible }),
      });
      setPhotos((current) =>
        current.map((item) => (item.id === photo.id ? result.photo : item)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "表示状態を変更できませんでした。");
    } finally {
      setBusyId(null);
    }
  }

  async function deletePhoto(photo: AdminPhoto) {
    if (!session?.csrfToken || busyId) return;
    const confirmed = window.confirm(
      `「${photo.originalName}」を原本・サムネイルごと完全に削除します。元に戻せません。続けますか？`,
    );
    if (!confirmed) return;

    setBusyId(photo.id);
    setError("");
    try {
      await apiJson<{ deleted: boolean }>(`/api/admin/photos/${photo.id}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": session.csrfToken },
      });
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "写真を削除できませんでした。");
      await loadPhotos();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="photos-page photos-admin-page">
      <header className="photos-header">
        <a className="photos-brand" href="/photos">Masato <i>&amp;</i> Haruka</a>
        <a className="photos-back" href="/photos"><span aria-hidden="true">←</span> みんなの写真へ戻る</a>
      </header>

      <section className="photos-intro photos-intro--admin" aria-labelledby="admin-title">
        <p className="photos-eyebrow">Photo Administration</p>
        <h1 id="admin-title">写真管理</h1>
        <p className="photos-lead">投稿内容の確認、非表示、完全削除を行います。</p>
      </section>

      {error && session ? <p className="photos-gallery-error" role="alert"><span aria-hidden="true">!</span> {error}</p> : null}

      {!session && !loading && error ? (
        <section className="photos-message-card" role="alert">
          <strong>管理ページを準備できませんでした</strong>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>再読み込み</button>
        </section>
      ) : !session || loading && !session.admin ? (
        <section className="photos-message-card" aria-live="polite"><span className="photos-spinner" aria-hidden="true" /><p>管理ページを準備しています…</p></section>
      ) : !session.configured ? (
        <section className="photos-access-card"><div><p className="photos-eyebrow">Setup Required</p><h2>管理設定が必要です</h2><p>環境変数を設定してからご利用ください。</p></div></section>
      ) : !session.admin ? (
        <section className="photos-access-card" aria-labelledby="admin-access-title">
          <div><p className="photos-eyebrow">Administrator Only</p><h2 id="admin-access-title">管理者コードを入力</h2><p>このページの操作は管理者のみ行えます。</p></div>
          <form className="photos-access-form" onSubmit={authenticate}>
            <label htmlFor="photo-admin-code">管理者コード</label>
            <div className="photos-access-form__row">
              <input id="photo-admin-code" type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="current-password" required />
              <button type="submit" disabled={submitting || !code}>{submitting ? "確認中…" : "管理画面を開く"}</button>
            </div>
          </form>
        </section>
      ) : (
        <section className="photos-admin-content" aria-labelledby="admin-list-title">
          <div className="photos-gallery-heading">
            <div><p className="photos-eyebrow">All Submissions</p><h2 id="admin-list-title">投稿写真</h2></div>
            <span>{photos.length}枚</span>
          </div>
          {loading ? (
            <div className="photos-empty-state" aria-live="polite"><span className="photos-spinner" aria-hidden="true" /><p>写真を読み込んでいます…</p></div>
          ) : photos.length < 1 ? (
            <div className="photos-empty-state"><h3>投稿写真はまだありません</h3></div>
          ) : (
            <div className="photos-admin-list">
              {photos.map((photo) => (
                <article className={`photos-admin-card${photo.isVisible ? "" : " is-hidden"}`} key={photo.id}>
                  <div className="photos-admin-card__image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbnailUrl}
                      alt={`${photo.originalName}のサムネイル`}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                        event.currentTarget.parentElement
                          ?.querySelector<HTMLElement>("[data-image-error]")
                          ?.removeAttribute("hidden");
                      }}
                    />
                    <p data-image-error hidden>画像を読み込めません</p>
                    <span>{photo.isVisible ? "公開中" : "非表示"}</span>
                  </div>
                  <div className="photos-admin-card__body">
                    <div><strong>{photo.originalName}</strong><small>{formatDate(photo.createdAt)} · {formatFileSize(photo.fileSize)}</small></div>
                    <dl>
                      <div><dt>場面</dt><dd>{session.categories.find((category) => category.id === photo.category)?.label}</dd></div>
                      <div><dt>投稿者</dt><dd>{photo.uploaderName || "未入力"}</dd></div>
                      <div><dt>コメント</dt><dd>{photo.comment || "未入力"}</dd></div>
                    </dl>
                    <div className="photos-admin-card__actions">
                      <a className="photos-secondary-button" href={photo.downloadUrl} download>原本を確認</a>
                      <button className="photos-secondary-button" type="button" onClick={() => setVisibility(photo)} disabled={busyId === photo.id}>
                        {photo.isVisible ? "非表示にする" : "再表示する"}
                      </button>
                      <button className="photos-danger-button" type="button" onClick={() => deletePhoto(photo)} disabled={busyId === photo.id}>
                        完全に削除
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
