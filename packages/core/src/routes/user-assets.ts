import { readFile } from 'node:fs/promises';

import type { UserAssets } from '@logto/schemas';
import {
  userAssetsGuard,
  userAssetsServiceStatusGuard,
  allowUploadMimeTypes,
  maxUploadFileSize,
  uploadFileGuard,
} from '@logto/schemas';
import { object } from 'zod';

import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import SystemContext from '#src/tenants/SystemContext.js';
import assertThat from '#src/utils/assert-that.js';
import { getConsoleLogFromContext } from '#src/utils/console.js';
import { getBrandingAssetKey, sanitizeAssetFilename } from '#src/utils/storage/assets.js';
import { buildStorage } from '#src/utils/storage/index.js';
import { getTenantId } from '#src/utils/tenant.js';

import type { ManagementApiRouter, RouterInitArgs } from './types.js';

export default function userAssetsRoutes<T extends ManagementApiRouter>(
  ...[router, tenant]: RouterInitArgs<T>
) {
  router.get(
    '/user-assets/service-status',
    koaGuard({
      response: userAssetsServiceStatusGuard,
    }),
    async (ctx, next) => {
      const { storageProviderConfig } = SystemContext.shared;
      const isExperienceAvatarUploadEnabled = true;
      const status = storageProviderConfig
        ? {
            status: 'ready',
            allowUploadMimeTypes,
            maxUploadFileSize,
            isExperienceAvatarUploadEnabled,
          }
        : {
            status: 'not_configured',
            isExperienceAvatarUploadEnabled,
          };

      ctx.body = status;

      return next();
    }
  );

  router.post(
    '/user-assets',
    koaGuard({
      files: object({
        file: uploadFileGuard.array().min(1),
      }),
      response: userAssetsGuard,
    }),
    async (ctx, next) => {
      const { file: bodyFiles } = ctx.guard.files;

      const file = bodyFiles[0];
      assertThat(file, 'guard.invalid_input');
      assertThat(file.size <= maxUploadFileSize, 'guard.file_size_exceeded');
      assertThat(
        allowUploadMimeTypes.map(String).includes(file.mimetype),
        'guard.mime_type_not_allowed'
      );

      const [tenantId] = await getTenantId(ctx.URL);
      assertThat(tenantId, 'guard.can_not_get_tenant_id');

      const { storageProviderConfig } = SystemContext.shared;
      assertThat(storageProviderConfig, 'storage.not_configured');

      const storage = buildStorage(storageProviderConfig);
      // Blacktop: deterministic branding key (same name replaces the object) — `app-assets-serve.ts`
      // proxies `GET /api/app-assets/:filename` from this prefix.
      const filename = sanitizeAssetFilename(file.originalFilename);
      const objectKey = getBrandingAssetKey(tenantId, filename);
      const cacheBust = Date.now();

      try {
        if (storageProviderConfig.publicUrl) {
          const { url } = await storage.uploadFile(await readFile(file.filepath), objectKey, {
            contentType: file.mimetype,
            publicUrl: storageProviderConfig.publicUrl,
            isPublic: true,
          });
          ctx.body = { url: `${url}?v=${cacheBust}` } satisfies UserAssets;
        } else {
          // Only the proxy route reads it, so the object stays private
          await storage.uploadFile(await readFile(file.filepath), objectKey, {
            contentType: file.mimetype,
            isPublic: false,
          });
          ctx.body = {
            url: `${tenant.envSet.endpoint.origin}/api/app-assets/${filename}?v=${cacheBust}`,
          } satisfies UserAssets;
        }
      } catch (error: unknown) {
        getConsoleLogFromContext(ctx).error(error);
        throw new RequestError({
          code: 'storage.upload_error',
          status: 500,
        });
      }

      return next();
    }
  );
}
