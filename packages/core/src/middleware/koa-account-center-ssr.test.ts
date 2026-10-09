import { mockSignInExperience } from '#src/__mocks__/sign-in-experience.js';
import { MockTenant } from '#src/test-utils/tenant.js';
import { createContextWithRouteParameters } from '#src/utils/test-utils.js';

import koaAccountCenterSsr from './koa-account-center-ssr.js';
import { serializeSsrData } from './koa-experience-ssr.js';

const { jest } = import.meta;

const accountCenterSsrPlaceholder = '"__LOGTO_ACCOUNT_CENTER_SSR__"';
const mockAccountCenterSsrSignInExperience = { color: mockSignInExperience.color };

describe('koaAccountCenterSsr()', () => {
  const baseCtx = Object.freeze({
    ...createContextWithRouteParameters({}),
    query: {},
  });
  const tenant = new MockTenant(undefined, undefined, undefined, {
    signInExperiences: {
      getAccountCenterSsrSignInExperience: jest
        .fn()
        .mockResolvedValue(mockAccountCenterSsrSignInExperience),
      getFullSignInExperience: jest.fn(),
    },
  });

  const next = jest.fn().mockReturnValue(Promise.resolve());

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call next() and do nothing if the response body is not a string', async () => {
    const symbol = Symbol('nothing');
    const ctx = { ...baseCtx, body: symbol };
    await koaAccountCenterSsr(tenant.libraries)(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.body).toBe(symbol);
  });

  it('should call next() and do nothing if the placeholder is not present', async () => {
    const ctx = { ...baseCtx, path: '/', body: '...' };
    await koaAccountCenterSsr(tenant.libraries)(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.body).toBe('...');
  });

  it('should prefetch sign-in experience color data and inject it into the HTML response', async () => {
    const ctx = {
      ...baseCtx,
      path: '/',
      body: `<script>
        const logtoSsr=${accountCenterSsrPlaceholder};
      </script>`,
    };
    await koaAccountCenterSsr(tenant.libraries)(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(
      tenant.libraries.signInExperiences.getAccountCenterSsrSignInExperience
    ).toHaveBeenCalledTimes(1);
    expect(tenant.libraries.signInExperiences.getFullSignInExperience).not.toHaveBeenCalled();
    expect(ctx.body).not.toContain(accountCenterSsrPlaceholder);
    expect(ctx.body).toContain(
      `const logtoSsr=Object.freeze(${JSON.stringify({
        signInExperience: { data: mockAccountCenterSsrSignInExperience },
      })});`
    );
  });

  it('should escape HTML-significant characters in the injected SSR data', async () => {
    const data = {
      color: {
        ...mockSignInExperience.color,
        primaryColor: 'x</script><script>alert(1)</script>&<',
      },
    };
    jest
      .mocked(tenant.libraries.signInExperiences.getAccountCenterSsrSignInExperience)
      .mockResolvedValueOnce(data);

    const ctx = {
      ...baseCtx,
      path: '/',
      body: `<script>
        const logtoSsr=${accountCenterSsrPlaceholder};
      </script>`,
    };
    await koaAccountCenterSsr(tenant.libraries)(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    // The only `</script>` left is the HTML's own closing tag; injected data is \uXXXX-escaped
    expect(ctx.body).toBe(`<script>
        const logtoSsr=Object.freeze(${serializeSsrData({ signInExperience: { data } })});
      </script>`);
  });

  it('should stamp the CSP nonce on script tags when the response carries one', async () => {
    const ctx = {
      ...baseCtx,
      path: '/',
      body: `<script>
        const logtoSsr=${accountCenterSsrPlaceholder};
      </script>
      <script type="module">main()</script>`,
    };
    ctx.set('Content-Security-Policy', "script-src 'self' 'nonce-aGVsbG8='");
    await koaAccountCenterSsr(tenant.libraries)(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.body).toContain('<script nonce="aGVsbG8=">');
    expect(ctx.body).toContain('<script nonce="aGVsbG8=" type="module">');
    expect(ctx.body).not.toContain('<script>');
  });

  it('should leave the body untouched when the placeholder is absent but stamp nonces', async () => {
    const ctx = {
      ...baseCtx,
      path: '/',
      body: '<script>no placeholder</script>',
    };
    ctx.set('Content-Security-Policy', "script-src 'self' 'nonce-aGVsbG8='");
    await koaAccountCenterSsr(tenant.libraries)(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.body).toBe('<script nonce="aGVsbG8=">no placeholder</script>');
  });

  it('should inject SSR data for Account Center deep links', async () => {
    const ctx = {
      ...baseCtx,
      path: '/profile',
      body: `<script>
        const logtoSsr=${accountCenterSsrPlaceholder};
      </script>`,
    };
    await koaAccountCenterSsr(tenant.libraries)(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.body).not.toContain(accountCenterSsrPlaceholder);
    expect(ctx.body).toContain(
      `const logtoSsr=Object.freeze(${JSON.stringify({
        signInExperience: { data: mockAccountCenterSsrSignInExperience },
      })});`
    );
  });
});
