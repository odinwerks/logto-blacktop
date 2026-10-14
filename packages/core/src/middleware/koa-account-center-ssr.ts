import { type AccountCenterSsrData } from '@logto/schemas';
import { trySafe } from '@silverhand/essentials';
import type { MiddlewareType } from 'koa';

import type Libraries from '#src/tenants/Libraries.js';

import { serializeSsrData } from './koa-experience-ssr.js';
import { type WithI18nContext } from './koa-i18next.js';

/**
 * Placeholder for account center SSR data injection. The value should be kept in sync with
 * {@link file://./../../../account/index.html}.
 */
const accountCenterSsrPlaceholder = '"__LOGTO_ACCOUNT_CENTER_SSR__"';

/**
 * Create a middleware to prefetch sign-in experience color/theme data and inject it into the
 * account center HTML response for theme flash prevention.
 *
 * Conditions for injection:
 * - The response body should be a string after the middleware chain (calling `next()`).
 * - The SSR placeholder string should be present in the response body.
 */
export default function koaAccountCenterSsr<StateT, ContextT extends WithI18nContext>(
  libraries: Libraries
): MiddlewareType<StateT, ContextT> {
  return async (ctx, next) => {
    await next();

    if (typeof ctx.body !== 'string' || !ctx.body.includes(accountCenterSsrPlaceholder)) {
      return;
    }

    /**
     * The account center CSP (`koa-security-headers.ts`) drops `'unsafe-inline'` in favor of a
     * per-request nonce. Read the nonce back out of the emitted `Content-Security-Policy`
     * header and stamp it on every script tag so the SSR bootstrap and theme scripts still run.
     * Only the SSR document reaches this point (see the placeholder check above), so the
     * blanket `<script` rewrite can never touch an unrelated string body.
     */
    const cspNonce = /'nonce-([A-Za-z0-9+/=]+)'/u.exec(
      ctx.response.get('content-security-policy')
    )?.[1];
    const htmlWithNonce = cspNonce
      ? ctx.body.replaceAll('<script', `<script nonce="${cspNonce}"`)
      : ctx.body;

    const signInExperience = await trySafe(
      libraries.signInExperiences.getAccountCenterSsrSignInExperience()
    );

    if (!signInExperience) {
      ctx.body = htmlWithNonce;
      return;
    }

    // Use a replacement *function* so `$`-sequences in the serialized data stay literal, and
    // `serializeSsrData` so a `</script>` in the data cannot close the element early. Mirrors
    // `koa-experience-ssr.ts`.
    ctx.body = htmlWithNonce.replace(
      accountCenterSsrPlaceholder,
      () =>
        `Object.freeze(${serializeSsrData({
          signInExperience: { data: signInExperience },
        } satisfies AccountCenterSsrData)})`
    );
  };
}
