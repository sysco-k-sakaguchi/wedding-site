import type { Metadata } from "next";
import { PhotosAdminApp } from "./PhotosAdminApp";
import "../photos.css";

export const metadata: Metadata = {
  title: "写真管理 | Masato & Haruka",
  description: "みんなの写真 管理ページ",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PhotosAdminPage() {
  return <PhotosAdminApp />;
}

