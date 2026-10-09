import { UserScope } from '@logto/core-kit';
import { AccountCenterControlValue, uploadFileGuard, userAssetsGuard } from '@logto/schemas';
import { object } from 'zod';

import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import SystemContext from '#src/tenants/SystemContext.js';
import { assertFirstPartyClient } from '#src/utils/assert-first-party-client.js';
import assertThat from '#src/utils/assert-that.js';
import { getConsoleLogFromContext } from '#src/utils/console.js';

import { uploadAvatar } from '../avatar-upload.js';
import type { UserRouter, RouterInitArgs } from '../types.js';

import { accountApiPrefix } from './constants.js';

export default function accountUserAssetsRoutes<T extends UserRouter>(
  ...[router, { queries, envSet }]: RouterInitArgs<T>
) {
  const {
    users: { updateUserById },
  } = queries;

  router.post(
    `${accountApiPrefix}/user-assets/avatar`,
    koaGuard({
      files: object({
        file: uploadFileGuard.array().min(1),
      }),
      response: userAssetsGuard,
      status: [200, 400, 401, 403, 500],
    }),
    async (ctx, next) => {
      const { id: userId, scopes, clientId } = ctx.auth;
      const { fields } = ctx.accountCenter;

      assertThat(
        scopes.has(UserScope.Profile),
        new RequestError({ code: 'auth.unauthorized', status: 401 })
      );
      await assertFirstPartyClient(queries, clientId);
      assertThat(
        fields.avatar === AccountCenterControlValue.Edit,
        'account_center.field_not_editable'
      );

      const [file] = ctx.guard.files.file;

      assertThat(file, 'guard.invalid_input');

      const { storageProviderConfig } = SystemContext.shared;

      const consoleLog = getConsoleLogFromContext(ctx);

      // Blacktop: persist the URL of the object that was actually stored (magic bytes decide the
      // `you.{ext}` key), so `users.avatar` can never point at a filename the bucket no longer
      // holds. A failed upload throws before this line and leaves the previous row untouched.
      const { url } = await uploadAvatar({
        file,
        storageProviderConfig,
        userId,
        endpointOrigin: envSet.endpoint.origin,
        logError: (error) => {
          consoleLog.error(error);
        },
      });

      const updatedUser = await updateUserById(userId, { avatar: url });
      ctx.appendDataHookContext('User.Data.Updated', { user: updatedUser });

      ctx.body = { url };

      return next();
    }
  );
}
