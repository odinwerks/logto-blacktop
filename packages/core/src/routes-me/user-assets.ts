import { readFile } from 'node:fs/promises';

import {
  userAssetsServiceStatusGuard,
  allowUploadMimeTypes,
  maxUploadFileSize,
  type UserAssets,
  userAssetsGuard,
  adminTenantId,
  uploadFileGuard,
  allowAvatarMimeTypes,
} from '@logto/schemas';
import { object } from 'zod';

import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import type { RouterInitArgs } from '#src/routes/types.js';
import SystemContext from '#src/tenants/SystemContext.js';
import assertThat from '#src/utils/assert-that.js';
import { getConsoleLogFromContext } from '#src/utils/console.js';
import { detectImageType } from '#src/utils/file.js';
import {
  getBrandingAssetKey,
  isPublicAsset,
  sanitizeAssetFilename,
  storeUserAvatar,
} from '#src/utils/storage/assets.js';
import { buildStorage } from '#src/utils/storage/index.js';

import type { AuthedMeRouter } from './types.js';

const avatarMimeTypes: readonly string[] = allowAvatarMimeTypes;

/**
 * Duplicated from `/user-assets` management API and used specifically for admin tenant.
 * E.g. Profile avatar upload.
 *
 * @todo: Refactor to reuse as much code as possible. @Charles
 */
export default function userAssetsRoutes<T extends AuthedMeRouter>(
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

      const { storageProviderConfig } = SystemContext.shared;
      assertThat(storageProviderConfig, 'storage.not_configured');

      // Blacktop: deterministic keys. An avatar image (by its magic bytes, not the claimed type)
      // replaces the user's `user-assets/{userId}/you.{ext}`; anything else (zip, svg, ico, ...) is
      // stored like a branding asset, which `/api/app-assets/:filename` proxies.
      const data = await readFile(file.filepath);
      const detected = detectImageType(data);
      const storage = buildStorage(storageProviderConfig);
      const { publicUrl } = storageProviderConfig;
      const consoleLog = getConsoleLogFromContext(ctx);

      try {
        if (detected && avatarMimeTypes.includes(detected.mime)) {
          const url = await storeUserAvatar({
            storage,
            storageProviderConfig,
            userId: ctx.auth.id,
            data,
            contentType: detected.mime,
            extension: detected.extension,
            endpointOrigin: tenant.envSet.endpoint.origin,
            logError: (message, error) => {
              consoleLog.error(message, error);
            },
          });
          ctx.body = { url } satisfies UserAssets;
        } else {
          const filename = sanitizeAssetFilename(file.originalFilename);
          const uploaded = await storage.uploadFile(
            data,
            getBrandingAssetKey(adminTenantId, filename),
            {
              contentType: file.mimetype,
              publicUrl,
              isPublic: isPublicAsset(storageProviderConfig),
            }
          );
          ctx.body = {
            url: `${
              publicUrl
                ? uploaded.url
                : `${tenant.envSet.endpoint.origin}/api/app-assets/${filename}`
            }?v=${Date.now()}`,
          } satisfies UserAssets;
        }
      } catch (error: unknown) {
        consoleLog.error(error);
        throw new RequestError({
          code: 'storage.upload_error',
          status: 500,
        });
      }

      return next();
    }
  );
}
