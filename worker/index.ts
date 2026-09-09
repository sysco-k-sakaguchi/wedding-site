/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handlePhotoApi } from "./photo-api";
import type { PhotoEnv } from "./photo-runtime";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: PhotoEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const photoApiResponse = await handlePhotoApi(request, env);
    if (photoApiResponse) {
      return photoApiResponse;
    }

    if (url.pathname === "/_vinext/image") {
      const images = env.IMAGES;
      if (!images) {
        return new Response("Image optimization is unavailable.", { status: 503 });
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);

    if (url.pathname === "/photos" || url.pathname.startsWith("/photos/")) {
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("X-Frame-Options", "DENY");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; base-uri 'self'; connect-src 'self' ws: wss:; font-src 'self' https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'; img-src 'self' blob: data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      );
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};

export default worker;
