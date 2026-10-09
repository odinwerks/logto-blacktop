import { adminTenantId, StorageProvider } from '@logto/schemas';
import type { Context } from 'koa';

import SystemContext from '#src/tenants/SystemContext.js';
import { getConsoleLogFromContext } from '#src/utils/console.js';
import { getBrandingAssetKey, getUserAssetsPrefix } from '#src/utils/storage/assets.js';
import { buildStorage } from '#src/utils/storage/index.js';
import { getTenantId } from '#src/utils/tenant.js';

import type { AnonymousRouter, RouterInitArgs } from './types.js';

const SAFE_NAME = /^[\w.-]+$/;

const isSafeName = (name?: string): name is string =>
  Boolean(name && !name.startsWith('.') && SAFE_NAME.test(name));

/** Upload URLs carry `?v={timestamp}` and keys never change, so a stored object is immutable per URL. */
const cacheControlStored = 'public, max-age=31536000, immutable';
const cacheControlNone = 'no-store';

/**
 * The served files are user uploads (branding can be SVG). Opened directly on the auth origin, an
 * SVG would run its scripts, so sandbox it; `<img>` embedding is unaffected.
 */
const assetContentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const isObjectNotFound = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  // eslint-disable-next-line no-restricted-syntax -- duck-typed S3 `$metadata` to stay SDK-agnostic
  const { $metadata } = error as { $metadata?: { httpStatusCode?: number } };

  return (
    error.name === 'NoSuchKey' || error.name === 'NotFound' || $metadata?.httpStatusCode === 404
  );
};

/**
 * Blacktop: stream one object of the private bucket through Logto. Every response is `no-store`
 * unless the object was found and is being sent with a 200 (or a 304 for it), so a CDN never keeps an
 * error response for a year.
 */
const serveStoredObject = async (ctx: Context, objectKey: string) => {
  ctx.set('Cache-Control', cacheControlNone);

  const { storageProviderConfig } = SystemContext.shared;
  if (storageProviderConfig?.provider !== StorageProvider.S3Storage) {
    ctx.status = 404;
    return;
  }

  const result = await buildStorage(storageProviderConfig)
    .downloadFile(objectKey)
    .catch((error: unknown) => {
      if (isObjectNotFound(error)) {
        ctx.status = 404;
        return;
      }

      getConsoleLogFromContext(ctx).error(`Failed to read storage object ${objectKey}:`, error);
      ctx.status = 500;
    });

  if (!result) {
    return;
  }

  if (!result.readableStreamBody) {
    ctx.status = 500;
    return;
  }

  const { readableStreamBody, contentType, contentLength, etag, lastModified } = result;

  ctx.status = 200;
  // Koa destroys the S3 response stream when the response ends, whether it was sent, aborted, or
  // dropped for a 304/HEAD.
  ctx.body = readableStreamBody;
  ctx.set('Content-Type', contentType ?? 'application/octet-stream');
  if (contentLength !== undefined) {
    ctx.length = contentLength;
  }
  // The object's own validators: the body is a stream, which `koaBodyEtag` leaves alone.
  if (etag) {
    ctx.response.etag = etag;
  }
  if (lastModified) {
    ctx.response.lastModified = lastModified;
  }
  ctx.set('Cache-Control', cacheControlStored);
  ctx.set('Cross-Origin-Resource-Policy', 'cross-origin');
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.set('Content-Security-Policy', assetContentSecurityPolicy);

  if (ctx.fresh) {
    ctx.status = 304;
  }
};

/**
 * Blacktop: public read-only proxy for the private storage bucket (S3 provider only).
 *
 * - `GET /app-assets/:filename` serves `{tenantId}/app-assets/branding/{filename}`.
 * - `GET /user-assets/:userId/:filename` serves `admin/user-assets/{userId}/{filename}`.
 */
export default function appAssetsServeRoutes<T extends AnonymousRouter>(
  ...[router]: RouterInitArgs<T>
) {
  router.get('/app-assets/:filename', async (ctx, next) => {
    const { filename } = ctx.params;

    if (!isSafeName(filename)) {
      ctx.status = 400;
      ctx.set('Cache-Control', cacheControlNone);
      return next();
    }

    const [tenantId] = await getTenantId(ctx.URL);
    if (!tenantId) {
      ctx.status = 400;
      ctx.set('Cache-Control', cacheControlNone);
      return next();
    }

    await serveStoredObject(ctx, getBrandingAssetKey(tenantId, filename));

    return next();
  });

  router.get('/user-assets/:userId/:filename', async (ctx, next) => {
    const { userId, filename } = ctx.params;

    // Validate params — no path traversal
    if (!isSafeName(userId) || !isSafeName(filename)) {
      ctx.status = 400;
      ctx.set('Cache-Control', cacheControlNone);
      return next();
    }

    const [tenantId] = await getTenantId(ctx.URL);
    if (!tenantId) {
      ctx.status = 400;
      ctx.set('Cache-Control', cacheControlNone);
      return next();
    }

    // Every avatar is stored under the admin tenant, whichever tenant the user belongs to
    await serveStoredObject(ctx, `${getUserAssetsPrefix(userId)}${filename}`);

    return next();
  });
}
