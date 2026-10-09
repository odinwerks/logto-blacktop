import { buildBuiltInApplicationDataForTenant, isBuiltInApplicationId } from '@logto/schemas';
import { type MiddlewareType } from 'koa';
import { type IRouterParamContext } from 'koa-router';
import type { Provider } from 'oidc-provider';
import { errors } from 'oidc-provider';

import RequestError from '#src/errors/RequestError/index.js';
import { consent, getMissingScopes } from '#src/libraries/session/index.js';
import type Libraries from '#src/tenants/Libraries.js';
import type Queries from '#src/tenants/Queries.js';
import assertThat from '#src/utils/assert-that.js';

/**
 * Automatically consent for the first party apps.
 */

const isApplicationAccessDeniedError = (error: unknown) =>
  error instanceof RequestError && error.code === 'oidc.access_denied';

export default function koaAutoConsent<StateT, ContextT extends IRouterParamContext, ResponseBodyT>(
  provider: Provider,
  query: Queries,
  libraries: Libraries
): MiddlewareType<StateT, ContextT, ResponseBodyT> {
  return async (ctx, next) => {
    const interactionDetails = await provider.interactionDetails(ctx.req, ctx.res);
    const {
      params: { client_id: clientId },
      prompt,
      session,
    } = interactionDetails;

    const {
      applications: { findApplicationById },
    } = query;

    assertThat(session, new RequestError({ code: 'session.not_found' }));
    assertThat(
      clientId && typeof clientId === 'string',
      new errors.InvalidClient('client must be available')
    );

    const application = isBuiltInApplicationId(clientId)
      ? buildBuiltInApplicationDataForTenant('', clientId)
      : await findApplicationById(clientId);

    const shouldAutoConsent = !application.isThirdParty;

    if (shouldAutoConsent) {
      try {
        await libraries.applicationAccessControl.assertUserHasApplicationAccess(
          clientId,
          session.accountId
        );
      } catch (error: unknown) {
        if (isApplicationAccessDeniedError(error)) {
          return next();
        }

        throw error;
      }

      const { missingOIDCScope: missingOIDCScopes, missingResourceScopes: resourceScopesToGrant } =
        getMissingScopes(prompt);

      const redirectTo = await consent({
        ctx,
        provider,
        queries: query,
        interactionDetails,
        missingOIDCScopes,
        resourceScopesToGrant,
        markAppLevelAccessControlChecked: true,
      });

      ctx.redirect(redirectTo);
      return;
    }

    return next();
  };
}
