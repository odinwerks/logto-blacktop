import { readFile } from 'node:fs/promises';

import {
  userAssetsServiceStatusGuard,
  maxUploadFileSize,
  type UserAssets,
  userAssetsGuard,
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
import { storeUserAvatar } from '#src/utils/storage/assets.js';
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
            allowUploadMimeTypes: allowAvatarMimeTypes,
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
      assertThat(avatarMimeTypes.includes(file.mimetype), 'guard.mime_type_not_allowed');

      const { storageProviderConfig } = SystemContext.shared;
      assertThat(storageProviderConfig, 'storage.not_configured');

      // Blacktop: this route only accepts avatar images. The magic bytes, not the claimed MIME
      // type, decide the `user-assets/{userId}/you.{ext}` key it replaces; anything else
      // (zip, svg, ico, spoofed types) is rejected instead of hosted.
      const data = await readFile(file.filepath);
      const detected = detectImageType(data);
      assertThat(
        detected && avatarMimeTypes.includes(detected.mime),
        'guard.mime_type_not_allowed'
      );

      const consoleLog = getConsoleLogFromContext(ctx);

      try {
        const url = await storeUserAvatar({
          storage: buildStorage(storageProviderConfig),
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
