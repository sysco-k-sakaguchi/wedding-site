import type { Metadata } from "next";
import { PhotosApp } from "./PhotosApp";
import "./photos.css";

export const metadata: Metadata = {
  title: "みんなの写真 | Masato & Haruka",
  description: "結婚式当日の思い出を、ゲストのみなさまで共有するアルバムです。",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PhotosPage() {
  return <PhotosApp />;
}
