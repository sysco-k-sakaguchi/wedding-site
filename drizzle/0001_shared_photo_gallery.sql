CREATE TABLE IF NOT EXISTS photo_upload_batches (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  uploader_name TEXT,
  comment TEXT,
  expected_count INTEGER NOT NULL CHECK (expected_count > 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  file_index INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  thumbnail_key TEXT NOT NULL UNIQUE,
  display_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  category TEXT NOT NULL,
  uploader_name TEXT,
  comment TEXT,
  created_at TEXT NOT NULL,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  sha256 TEXT NOT NULL UNIQUE,
  FOREIGN KEY (batch_id) REFERENCES photo_upload_batches(id),
  UNIQUE (batch_id, file_index)
);

CREATE INDEX IF NOT EXISTS idx_photos_visible_created
ON photos (is_visible, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_photos_category_visible_created
ON photos (category, is_visible, created_at DESC);

CREATE TABLE IF NOT EXISTS photo_rate_limits (
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE TABLE IF NOT EXISTS photo_download_jobs (
  id TEXT PRIMARY KEY,
  photo_ids TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_photo_download_jobs_expires
ON photo_download_jobs (expires_at);
