"use client";

import type { Photo } from "./PhotosApp";
import { usePhotoText } from "./photo-i18n";

export function PhotoSaveButton({ photo, className = "", keepAlbumOpen = false }: {
  photo: Photo; className?: string; keepAlbumOpen?: boolean;
}) {
  const { t } = usePhotoText();
  return <a className={`photos-save-button ${className}`} href={photo.downloadUrl} download
    target={keepAlbumOpen ? "_blank" : undefined} rel={keepAlbumOpen ? "noopener" : undefined}
    aria-label={t(`${photo.originalName}をファイルに保存`, `Download ${photo.originalName}`)}>
    {t("ファイルに保存", "Download photo")}
  </a>;
}
