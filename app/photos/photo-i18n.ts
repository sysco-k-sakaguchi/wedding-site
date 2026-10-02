"use client";

import { createContext, useContext } from "react";

export type PhotoLocale = "ja" | "en";
export const PhotoLocaleContext = createContext<PhotoLocale>("ja");
export function usePhotoText() {
  const locale = useContext(PhotoLocaleContext);
  return { locale, t: (ja: string, en: string) => locale === "en" ? en : ja };
}

export function categoryLabel(id: string, fallback: string, locale: PhotoLocale) {
  if (locale === "ja") return fallback;
  return ({ all: "All", ceremony: "Ceremony", reception: "Reception", other: "Other" } as Record<string, string>)[id] ?? fallback;
}

const englishErrors: Record<string, string> = {
  invalid_access_code: "That password is incorrect. Please try again.",
  authentication_required: "Please enter the password to open the album.",
  invalid_csrf: "Your session has expired. Please reload this page and try again.",
  invalid_origin: "Please reload this page before trying again.",
  rate_limited: "Please wait a while before trying again.",
  not_configured: "The album is not ready yet. Please contact the hosts.",
  invalid_photo: "This photo could not be read. Please choose a JPEG, PNG or WebP photo within the size limit.",
  photo_hidden: "This photo cannot currently be shared. Please contact the hosts.",
  duplicate_photo: "This photo is already in the album.",
  file_too_large: "This photo is too large. Please choose a smaller file.",
  invalid_category: "Please choose a photo category.",
  invalid_batch: "Please choose the photos again and retry.",
  invalid_batch_count: "Please choose fewer photos and retry.",
  batch_not_found: "Your upload has expired. Please choose the photos again.",
  photo_not_found: "This photo is no longer available. Please refresh the album.",
  image_not_found: "This image is no longer available.",
  download_too_large: "Please select fewer photos to save together.",
  download_job_not_found: "This download link has expired. Please prepare a new download.",
  image_processing_unavailable: "Photos cannot be processed right now. Please try again later.",
  invalid_json: "Please check your entries and try again.",
  invalid_filename: "Please rename this photo and try again.",
  internal_error: "Something went wrong. Please wait a moment and try again.",
};

export function photoErrorMessage(code: string | undefined, message: string | undefined, locale: PhotoLocale) {
  if (locale === "en") return englishErrors[code ?? ""] ?? "Something went wrong. Please try again. If it continues, contact the hosts.";
  if (code === "photo_hidden") return "この写真は現在追加できません。新郎新婦へお知らせください。";
  return message || "処理を完了できませんでした。もう一度お試しください。";
}
