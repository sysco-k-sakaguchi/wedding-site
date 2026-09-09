import { cp, mkdir, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = process.cwd();
const publicDirectory = resolve(root, "public");
const excludedFileNames = new Set([
  ".DS_Store",
  "README.txt",
  "photos.json",
  "スクリーンショット 2026-04-21 21.01.18（2）.png",
  "スクリーンショット 2026-04-21 21.01.23（2）.png"
]);

await mkdir(publicDirectory, { recursive: true });
await rm(resolve(publicDirectory, ".DS_Store"), { force: true });
await cp(resolve(root, "index.html"), resolve(publicDirectory, "index.html"), {
  force: true
});
await cp(resolve(root, "gallery.html"), resolve(publicDirectory, "gallery.html"), {
  force: true
});

for (const directory of ["assets", "images"]) {
  const destination = resolve(publicDirectory, directory);

  await rm(destination, { recursive: true, force: true });
  await cp(resolve(root, directory), destination, {
    recursive: true,
    force: true,
    filter(source) {
      return !excludedFileNames.has(basename(source));
    }
  });
}
