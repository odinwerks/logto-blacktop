import { Readable } from 'node:stream';

import { isFileAssetPath } from '@logto/core-kit';
import type { MiddlewareType } from 'koa';

import SystemContext from '#src/tenants/SystemContext.js';
import assertThat from '#src/utils/assert-that.js';
import { buildUploadFile } from '#src/utils/storage/index.js';
import { getTenantId } from '#src/utils/tenant.js';

const noCache = 'no-cache, no-store, must-revalidate';
const maxAgeSevenDays = 'max-age=604800';

/**
 * Middleware that serves custom UI assets uploaded via the sign-in experience settings.
 * Requests with a file extension are served directly; all other paths serve `index.html`
 * to support SPA client-side routing.
 */
export default function koaServeCustomUiAssets(customUiAssetId: string) {
  const serve: MiddlewareType = async (ctx, next) => {
    const [tenantId] = await getTenantId(ctx.URL);
    assertThat(tenantId, 'session.not_found', 404);

    const { storageProviderConfig } = SystemContext.shared;
    assertThat(storageProviderConfig, 'storage.not_configured');

    const storage = buildUploadFile(storageProviderConfig);
    assertThat(storage.downloadFile && storage.isFileExisted, 'storage.not_configured');

    const requestPath = ctx.request.path;
    const isFileAssetRequest = isFileAssetPath(requestPath);
    const filePath = isFileAssetRequest ? requestPath : '/index.html';
    const objectKey = `${tenantId}/${customUiAssetId}${filePath}`;

    const exists = await storage.isFileExisted(objectKey);
    assertThat(exists, 'entity.not_found', 404);

    const result = await storage.downloadFile(objectKey);

    // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    ctx.body = result.body instanceof Readable ? result.body : Readable.fromWeb(result.body as any);
    ctx.type = result.contentType ?? 'application/octet-stream';
    ctx.status = 200;
    ctx.set('Cache-Control', isFileAssetRequest ? maxAgeSevenDays : noCache);

    if (result.contentLength) {
      ctx.set('Content-Length', String(result.contentLength));
    }

    return next();
  };

  return serve;
}
