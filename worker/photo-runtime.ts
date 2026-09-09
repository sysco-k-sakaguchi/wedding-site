export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: {
    changes?: number;
  };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
}

export interface R2ObjectBody {
  key: string;
  size: number;
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: {
    contentType?: string;
  };
}

export interface R2Bucket {
  put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | Blob | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
}

export interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: Record<string, unknown>): {
      output(options: {
        format: string;
        quality: number;
      }): Promise<{ response(): Response }>;
    };
  };
}

export interface PhotoEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  DB: D1Database;
  PHOTOS: R2Bucket;
  IMAGES?: ImagesBinding;
  PHOTO_ACCESS_CODE?: string;
  PHOTO_ADMIN_CODE?: string;
  PHOTO_SESSION_SECRET?: string;
  PHOTO_MAX_FILE_BYTES?: string;
  PHOTO_MAX_FILES_PER_BATCH?: string;
  PHOTO_MAX_PIXELS?: string;
  PHOTO_UPLOADS_PER_HOUR?: string;
  PHOTO_VARIANT_MODE?: string;
}
