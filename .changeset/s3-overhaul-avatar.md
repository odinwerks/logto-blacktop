---
"@logto/core": minor
"@logto/schemas": minor
---

S3 storage overhaul: added deleteFile, isFileExisted, listFiles (with pagination), downloadFile, and copyFile to the S3 storage provider. The storage factory now returns the full provider interface. Upload routes use deterministic paths instead of date-stamped random keys.

Account API now supports `POST /api/my-account/avatar` for single-step avatar upload with magic-byte MIME validation, deterministic storage paths, old-file cleanup, and cache-busted URLs. A public proxy route `GET /api/assets/:userId/:filename` serves stored files with proper caching and cross-origin headers.

Avatar uploads validate images via magic bytes rather than trusting the browser's claimed Content-Type. Accepted formats: JPEG, PNG, GIF, WebP, BMP (max 20 MB).
