import { Readable } from 'node:stream';

import { StorageProvider } from '@logto/schemas';

import SystemContext from '#src/tenants/SystemContext.js';
import { buildUploadFile } from '#src/utils/storage/index.js';
import { getTenantId } from '#src/utils/tenant.js';

import type { AnonymousRouter, RouterInitArgs } from './types.js';

const SAFE_FILENAME = /^[\w.-]+$/;

export default function appAssetsServeRoutes<T extends AnonymousRouter>(
  ...[router]: RouterInitArgs<T>
) {
  router.get('/app-assets/:filename', async (ctx, next) => {
    const { filename } = ctx.params;

    if (
      !filename ||
      filename.startsWith('.') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      !SAFE_FILENAME.test(filename)
    ) {
      ctx.status = 400;
      return next();
    }

    const [tenantId] = await getTenantId(ctx.URL);
    if (!tenantId) {
      ctx.status = 400;
      return next();
    }

    const { storageProviderConfig } = SystemContext.shared;
    if (!storageProviderConfig || storageProviderConfig.provider !== StorageProvider.S3Storage) {
      ctx.status = 404;
      return next();
    }

    const storage = buildUploadFile(storageProviderConfig);
    if (!storage.downloadFile) {
      ctx.status = 500;
      return next();
    }

    const objectKey = `${tenantId}/app-assets/${filename}`;

    try {
      const result = await storage.downloadFile(objectKey);

      ctx.set('Content-Type', result.contentType ?? 'application/octet-stream');
      if (result.contentLength) {
        ctx.set('Content-Length', String(result.contentLength));
      }
      ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
      ctx.set('Cross-Origin-Resource-Policy', 'cross-origin');
      ctx.set('X-Content-Type-Options', 'nosniff');
      ctx.status = 200;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      ctx.body = Readable.fromWeb(result.body as any);
    } catch (error: unknown) {
      const error_ = error as { name?: string };
      ctx.status = error_.name === 'NotFound' || error_.name === 'NoSuchKey' ? 404 : 500;
    }

    return next();
  });
}
