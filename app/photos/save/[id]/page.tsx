import type { Metadata } from "next";
import { PhotoSaveScreen } from "../../PhotoSaveScreen";
import "../../photos.css";

export const metadata: Metadata = {
  title: "写真 | Masato & Haruka",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PhotoSavePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PhotoSaveScreen id={id} />;
}
