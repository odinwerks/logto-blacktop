import { readFile } from 'node:fs/promises';

import { UserScope } from '@logto/core-kit';
import {
  AccountCenterControlValue,
  maxUploadFileSize,
  StorageProvider,
  uploadFileGuard,
  userProfileResponseGuard,
} from '@logto/schemas';
import { z } from 'zod';

import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import SystemContext from '#src/tenants/SystemContext.js';
import { assertFirstPartyClient } from '#src/utils/assert-first-party-client.js';
import assertThat from '#src/utils/assert-that.js';
import { getConsoleLogFromContext } from '#src/utils/console.js';
import { storeUserAvatar } from '#src/utils/storage/assets.js';
import { buildStorage } from '#src/utils/storage/index.js';

import { detectAvatarImage } from '../avatar-upload.js';
import { type RouterInitArgs, type UserRouter } from '../types.js';

import { accountApiPrefix } from './constants.js';
import { getAccountCenterFilteredProfile, getScopedProfile } from './utils/get-scoped-profile.js';

export default function avatarRoutes<T extends UserRouter>(
  ...[router, { queries, libraries, envSet }]: RouterInitArgs<T>
) {
  const {
    users: { updateUserById },
  } = queries;

  router.post(
    `${accountApiPrefix}/avatar`,
    koaGuard({
      files: z.object({
        file: uploadFileGuard.array().min(1),
      }),
      response: userProfileResponseGuard.partial(),
      status: [200, 400, 401, 403, 500],
    }),
    async (ctx, next) => {
      const { id: userId, scopes, clientId } = ctx.auth;
      const { fields } = ctx.accountCenter;

      // Validate file is present
      const { file: bodyFiles } = ctx.guard.files;
      const file = bodyFiles[0];
      assertThat(file, 'guard.invalid_input');
      assertThat(file.size <= maxUploadFileSize, 'guard.file_size_exceeded');

      // Check account center visibility
      assertThat(
        fields.avatar === AccountCenterControlValue.Edit,
        'account_center.field_not_editable'
      );
      // Require profile scope for DB update
      assertThat(
        scopes.has(UserScope.Profile),
        new RequestError({ code: 'auth.unauthorized', status: 401 })
      );
      await assertFirstPartyClient(queries, clientId);

      // Read file into buffer
      const fileBuffer = await readFile(file.filepath);

      // Detect the real image type via the shared avatar sniff: magic bytes pick the type and
      // the end marker proves the payload is really that image (spoofs/truncations rejected).
      const detected = detectAvatarImage(fileBuffer);
      assertThat(detected, 'guard.mime_type_not_allowed');

      // Get storage provider
      const { storageProviderConfig } = SystemContext.shared;
      assertThat(storageProviderConfig, 'storage.not_configured', 500);
      assertThat(
        storageProviderConfig.provider === StorageProvider.S3Storage,
        'storage.not_configured',
        500
      );
      // Overwrite `you.{ext}`, then drop the user's other avatar objects
      const consoleLog = getConsoleLogFromContext(ctx);
      const avatarUrl = await storeUserAvatar({
        storage: buildStorage(storageProviderConfig),
        storageProviderConfig,
        userId,
        data: fileBuffer,
        contentType: detected.mimeType,
        extension: detected.extension,
        endpointOrigin: envSet.endpoint.origin,
        logError: (message, error) => {
          consoleLog.error(message, error);
        },
      }).catch((error: unknown) => {
        consoleLog.error(error);
        throw new RequestError({ code: 'storage.upload_error', status: 500 });
      });

      // Update user record
      const updatedUser = await updateUserById(userId, {
        avatar: avatarUrl,
      });

      ctx.appendDataHookContext('User.Data.Updated', { user: updatedUser });

      // Return updated profile
      const { profile, user } = await getScopedProfile(queries, libraries, scopes, userId);
      ctx.body = getAccountCenterFilteredProfile(profile, ctx.accountCenter, user);

      return next();
    }
  );
}
