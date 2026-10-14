import { PredefinedScope } from '@logto/schemas';
import { assert } from '@silverhand/essentials';
import type { MiddlewareType } from 'koa';
import type { IRouterParamContext } from 'koa-router';

import RequestError from '#src/errors/RequestError/index.js';
import assertThat from '#src/utils/assert-that.js';

import type { WithAuthContext } from './types.js';

export const requireManagementScopes = <
  StateT,
  ContextT extends IRouterParamContext,
  ResponseBodyT,
>(
  ...names: string[]
): MiddlewareType<StateT, WithAuthContext<ContextT>, ResponseBodyT> => {
  // `names.every(...)` on an empty list authorizes any token; fail loudly at route
  // registration so a zero-argument call can never silently create an authorization gap.
  assert(names.length > 0, new Error('requireManagementScopes requires at least one scope.'));

  return async (ctx, next) => {
    assertThat(
      ctx.auth.scopes.has(PredefinedScope.All) || names.every((name) => ctx.auth.scopes.has(name)),
      new RequestError({ code: 'auth.forbidden', status: 403 })
    );

    return next();
  };
};
