import { UserScope } from '@logto/core-kit';
import { AccountCenterControlValue } from '@logto/schemas';

import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import { assertFirstPartyClient } from '#src/utils/assert-first-party-client.js';
import assertThat from '#src/utils/assert-that.js';

import { type UserRouter, type RouterInitArgs } from '../types.js';

import { accountApiPrefix } from './constants.js';

export default function heartbeatRoutes<T extends UserRouter>(
  ...[router, { queries }]: RouterInitArgs<T>
) {
  const { oidcSessionExtensions } = queries;

  router.post(
    `${accountApiPrefix}/sessions/heartbeat`,
    koaGuard({ status: [204, 400, 401, 403] }),
    async (ctx, next) => {
      const { id: userId, scopes, sessionUid, clientId } = ctx.auth;
      const { fields } = ctx.accountCenter;

      assertThat(
        fields.session === AccountCenterControlValue.Edit ||
          fields.session === AccountCenterControlValue.ReadOnly,
        'account_center.field_not_enabled'
      );

      assertThat(
        scopes.has(UserScope.Sessions),
        new RequestError({ code: 'auth.unauthorized', status: 401 })
      );

      assertThat(sessionUid, new RequestError({ code: 'auth.unauthorized', status: 401 }));

      await assertFirstPartyClient(queries, clientId);

      await oidcSessionExtensions.updateLastActiveAt(sessionUid, userId);

      ctx.status = 204;

      return next();
    }
  );
}
