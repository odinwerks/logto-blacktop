/* eslint-disable max-lines -- Covers the console, experience and loopback/HSTS policies of one module. */
import { CaptchaType, CrossOriginOpenerPolicy } from '@logto/schemas';
import { GlobalValues } from '@logto/shared';
import { createMockUtils } from '@logto/shared/esm';
import { noop } from '@silverhand/essentials';
import type Koa from 'koa';

import type Queries from '#src/tenants/Queries.js';
import createMockContext from '#src/test-utils/jest-koa-mocks/create-mock-context.js';

const { jest } = import.meta;
const { mockEsmWithActual } = createMockUtils(jest);

// One shared instance, so a test can toggle the dev-feature flag.
const envValues = new GlobalValues();

/** Per-test overrides layered over the real `GlobalValues` (e.g. to simulate production). */
// eslint-disable-next-line @silverhand/fp/no-let
let mockEnvOverrides: Record<string, unknown> | undefined;

await mockEsmWithActual('#src/env-set/index.js', () => ({
  EnvSet: {
    get values() {
      return new Proxy(envValues, {
        get: (target, key) =>
          mockEnvOverrides && typeof key === 'string' && key in mockEnvOverrides
            ? mockEnvOverrides[key]
            : Reflect.get(target, key),
      });
    },
  },
  AdminApps: { Console: 'console', Welcome: 'welcome' },
  UserApps: { AccountCenter: 'account' },
  getTenantEndpoint: () => new URL('https://tenant.example.com'),
}));

const {
  default: koaSecurityHeaders,
  koaExperienceSecurityHeaders,
  isLoopbackOrigin,
  withoutLoopbackOrigins,
} = await import('./koa-security-headers.js');
const { setDevFeaturesEnabled, resetDevFeaturesEnabled } = await import(
  '#src/test-utils/dev-features.js'
);

const koaNoop = noop as unknown as Koa.Next;
const customScriptSource = 'https://scripts.example.com';
const customConnectSource = 'https://api.example.com';
const customUiAssets = Object.freeze({ id: 'custom_ui_assets_id', createdAt: 1 });

type CustomUiSettings = {
  readonly customUiAssets?: { readonly id: string; readonly createdAt: number };
  readonly customUiCsp?: Record<string, string[]>;
  readonly crossOriginOpenerPolicy?: CrossOriginOpenerPolicy;
  readonly capEndpoint?: string;
  readonly captchaProviderType?: CaptchaType;
  readonly isCaptchaEnabled?: boolean;
};

const createQueries = ({
  customUiAssets,
  customUiCsp = {},
  crossOriginOpenerPolicy = CrossOriginOpenerPolicy.UnsafeNone,
  capEndpoint,
  captchaProviderType,
  isCaptchaEnabled = true,
}: CustomUiSettings = {}) =>
  ({
    signInExperiences: {
      findDefaultSignInExperience: jest.fn(async () => ({
        customUiAssets: customUiAssets ?? null,
        customUiCsp,
        crossOriginOpenerPolicy,
        captchaPolicy: { enabled: isCaptchaEnabled },
      })),
    },
    captchaProviders: {
      findCapEndpoint: jest.fn(async () => capEndpoint ?? null),
      findCaptchaProviderType: jest.fn(async () => captchaProviderType ?? null),
    },
  }) as unknown as Queries;

const getCsp = (ctx: Koa.Context): string => {
  const value = ctx.res.getHeader('Content-Security-Policy');
  return typeof value === 'string' ? value : '';
};

const getCspDirective = (ctx: Koa.Context, directiveName: string): string | undefined =>
  getCsp(ctx)
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith(`${directiveName} `));

const getCrossOriginOpenerPolicy = async (settings: CustomUiSettings) => {
  const run = koaExperienceSecurityHeaders('default', createQueries(settings));
  const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

  await run(ctx, koaNoop);

  return ctx.res.getHeader('Cross-Origin-Opener-Policy');
};

describe('koaSecurityHeaders() middleware — experience CSP', () => {
  it('adds Custom UI CSP sources to the matching experience directives', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({
        customUiAssets,
        customUiCsp: {
          scriptSrc: [customScriptSource],
          connectSrc: [customConnectSource],
        },
      })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    const scriptSource = getCspDirective(ctx, 'script-src');
    const connectSource = getCspDirective(ctx, 'connect-src');

    expect(scriptSource).toContain("'self'");
    expect(scriptSource).toContain(customScriptSource);
    expect(scriptSource).not.toContain(customConnectSource);
    expect(connectSource).toContain('https://tenant.example.com');
    expect(connectSource).toContain(customConnectSource);
    expect(connectSource).not.toContain(customScriptSource);
  });

  it('allows local MinIO HTTP origins in experience img-src during development', async () => {
    const run = koaExperienceSecurityHeaders('default', createQueries());
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    const imageSource = getCspDirective(ctx, 'img-src');

    expect(imageSource).toContain('https:');
    expect(imageSource).toContain('http://localhost:9000');
    expect(imageSource).toContain('http://127.0.0.1:9000');
  });

  it('allows the Cap Standalone instance when Cap is the captcha provider', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({ capEndpoint: 'https://cap.example.com/base/' })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    expect(getCspDirective(ctx, 'connect-src')).toContain('https://cap.example.com');
    expect(getCspDirective(ctx, 'connect-src')).not.toContain('https://cap.example.com/base');
    expect(getCspDirective(ctx, 'script-src')).toContain("'wasm-unsafe-eval'");
    expect(getCspDirective(ctx, 'script-src')).toContain("'unsafe-eval'");
    expect(getCspDirective(ctx, 'worker-src')).toBe("worker-src 'self' blob:");
  });

  it('keeps Custom UI CSP sources along with the Cap sources', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({
        customUiAssets,
        customUiCsp: { connectSrc: [customConnectSource] },
        capEndpoint: 'https://cap.example.com',
      })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    const connectSource = getCspDirective(ctx, 'connect-src');

    expect(connectSource).toContain(customConnectSource);
    expect(connectSource).toContain('https://cap.example.com');
  });

  it('does not allow Cap sources when Cap is not the captcha provider', async () => {
    const run = koaExperienceSecurityHeaders('default', createQueries());
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    // `'unsafe-eval'` is always allowed outside production, so only check the Cap-specific sources
    expect(getCspDirective(ctx, 'script-src')).not.toContain("'wasm-unsafe-eval'");
    expect(getCspDirective(ctx, 'worker-src')).toBeUndefined();
  });

  it('skips the Cap CSP relaxation when the stored Cap endpoint is malformed', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({ capEndpoint: 'not a url' })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    // A malformed stored endpoint must not throw (500) — the Cap directives are simply skipped.
    await run(ctx, koaNoop);

    expect(getCsp(ctx)).toContain('default-src');
    expect(getCspDirective(ctx, 'connect-src')).not.toContain('not a url');
    expect(getCspDirective(ctx, 'script-src')).not.toContain("'wasm-unsafe-eval'");
    expect(getCspDirective(ctx, 'worker-src')).toBeUndefined();
  });

  it('does not allow Cap sources when CAPTCHA is disabled', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({ capEndpoint: 'https://cap.example.com', isCaptchaEnabled: false })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    expect(getCspDirective(ctx, 'connect-src')).not.toContain('https://cap.example.com');
    expect(getCspDirective(ctx, 'script-src')).not.toContain("'wasm-unsafe-eval'");
    expect(getCspDirective(ctx, 'worker-src')).toBeUndefined();
  });

  it('allows GeeTest sources when GeeTest is the captcha provider', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({ captchaProviderType: CaptchaType.Geetest })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    const scriptSource = getCspDirective(ctx, 'script-src');
    const connectSource = getCspDirective(ctx, 'connect-src');

    expect(scriptSource).toContain('https://static.geetest.com/');
    expect(scriptSource).toContain('https://static.geevisit.com/');
    expect(scriptSource).toContain('https://gcaptcha4.geetest.com/');
    expect(scriptSource).toContain('https://gcaptcha4.geevisit.com/');
    expect(scriptSource).toContain('https://gcaptcha4.gsensebot.com/');
    expect(connectSource).toContain('https://static.geetest.com/');
    expect(connectSource).toContain('https://gcaptcha4.geetest.com/');
    expect(connectSource).toContain('https://monitor.geetest.com/');
  });

  it('keeps Custom UI CSP sources along with the GeeTest sources', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({
        customUiAssets,
        customUiCsp: { connectSrc: [customConnectSource] },
        captchaProviderType: CaptchaType.Geetest,
      })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    const connectSource = getCspDirective(ctx, 'connect-src');

    expect(connectSource).toContain(customConnectSource);
    expect(connectSource).toContain('https://gcaptcha4.geetest.com/');
  });

  it('does not allow GeeTest sources when GeeTest is not the captcha provider', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({ captchaProviderType: CaptchaType.Turnstile })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    expect(getCspDirective(ctx, 'script-src')).not.toContain('https://static.geetest.com/');
    expect(getCspDirective(ctx, 'connect-src')).not.toContain('https://gcaptcha4.geetest.com/');
  });

  it('does not allow GeeTest sources when CAPTCHA is disabled', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({
        captchaProviderType: CaptchaType.Geetest,
        isCaptchaEnabled: false,
      })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    expect(getCspDirective(ctx, 'script-src')).not.toContain('https://static.geetest.com/');
    expect(getCspDirective(ctx, 'connect-src')).not.toContain('https://gcaptcha4.geetest.com/');
  });

  it('does not add Custom UI CSP sources when Custom UI assets are not configured', async () => {
    const run = koaExperienceSecurityHeaders(
      'default',
      createQueries({
        customUiCsp: {
          scriptSrc: [customScriptSource],
          connectSrc: [customConnectSource],
        },
      })
    );
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    const scriptSource = getCspDirective(ctx, 'script-src');
    const connectSource = getCspDirective(ctx, 'connect-src');

    expect(scriptSource).toContain("'self'");
    expect(scriptSource).not.toContain(customScriptSource);
    expect(connectSource).toContain('https://tenant.example.com');
    expect(connectSource).not.toContain(customConnectSource);
  });

  it('does not leak Custom UI CSP sources outside hosted experience routes', async () => {
    const run = koaSecurityHeaders(['api', 'oidc', '.well-known', 'demo-app'], 'default');
    const urlsWithDedicatedCsp = ['/console', '/account', '/account/callback/social/google'];
    const mountedAppUrls = ['/oidc/auth', '/api/.well-known', '/demo-app'];

    const cspHeaders = await Promise.all(
      urlsWithDedicatedCsp.map(async (url) => {
        const ctx = createMockContext({ method: 'GET', url });

        await run(ctx, koaNoop);

        return getCsp(ctx);
      })
    );

    for (const cspHeader of cspHeaders) {
      expect(cspHeader).not.toContain(customScriptSource);
      expect(cspHeader).not.toContain(customConnectSource);
    }

    const mountedAppCspHeaders = await Promise.all(
      mountedAppUrls.map(async (url) => {
        const ctx = createMockContext({ method: 'GET', url });

        await run(ctx, koaNoop);

        return getCsp(ctx);
      })
    );

    expect(mountedAppCspHeaders).toEqual(['', '', '']);
  });

  it('uses a per-request script nonce instead of unsafe-inline in account center', async () => {
    const run = koaSecurityHeaders(['api', 'oidc', '.well-known', 'demo-app'], 'default');
    const ctx = createMockContext({ method: 'GET', url: '/account' });

    await run(ctx, koaNoop);

    const scriptSource = getCspDirective(ctx, 'script-src');
    const scriptSourceAttribute = getCspDirective(ctx, 'script-src-attr');

    expect(scriptSource).toContain("'self'");
    expect(scriptSource).toMatch(/'nonce-[\d+/=A-Za-z]+'/);
    expect(scriptSource).not.toContain("'unsafe-inline'");
    expect(scriptSource).not.toContain("'unsafe-hashes'");
    expect(scriptSourceAttribute).toBe("script-src-attr 'none'");
  });

  it('issues a fresh nonce per account center request', async () => {
    const run = koaSecurityHeaders([], 'default');
    const firstCtx = createMockContext({ method: 'GET', url: '/account' });
    const secondCtx = createMockContext({ method: 'GET', url: '/account' });

    await run(firstCtx, koaNoop);
    await run(secondCtx, koaNoop);

    expect(getCspDirective(firstCtx, 'script-src')).not.toBe(
      getCspDirective(secondCtx, 'script-src')
    );
  });

  it('does not override mounted app CSP when the experience middleware is reached later', async () => {
    const queries = createQueries({
      customUiAssets,
      customUiCsp: {
        scriptSrc: [customScriptSource],
      },
    });
    const runSecurityHeaders = koaSecurityHeaders(['console'], 'default');
    const runExperienceSecurityHeaders = koaExperienceSecurityHeaders('default', queries, [
      'console',
    ]);
    const ctx = createMockContext({ method: 'GET', url: '/console/organizations' });

    await runSecurityHeaders(ctx, async () => runExperienceSecurityHeaders(ctx, koaNoop));

    const scriptSource = getCspDirective(ctx, 'script-src');

    expect(scriptSource).toContain('https://cdn.jsdelivr.net/');
    expect(scriptSource).not.toContain(customScriptSource);
    expect(queries.signInExperiences.findDefaultSignInExperience).not.toHaveBeenCalled();
  });
});

describe('koaExperienceSecurityHeaders() middleware — Cross-Origin-Opener-Policy', () => {
  afterEach(() => {
    resetDevFeaturesEnabled();
  });

  it.each([CrossOriginOpenerPolicy.SameOriginAllowPopups, CrossOriginOpenerPolicy.SameOrigin])(
    'sends %s while Custom UI assets are served',
    async (crossOriginOpenerPolicy) => {
      await expect(
        getCrossOriginOpenerPolicy({ customUiAssets, crossOriginOpenerPolicy })
      ).resolves.toBe(crossOriginOpenerPolicy);
    }
  );

  it('sends no header for unsafe-none', async () => {
    await expect(
      getCrossOriginOpenerPolicy({
        customUiAssets,
        crossOriginOpenerPolicy: CrossOriginOpenerPolicy.UnsafeNone,
      })
    ).resolves.toBeUndefined();
  });

  it.each([
    {},
    { capEndpoint: 'https://cap.example.com' },
    { captchaProviderType: CaptchaType.Geetest },
  ])('sends no header without Custom UI assets (%o)', async (settings) => {
    await expect(
      getCrossOriginOpenerPolicy({
        ...settings,
        crossOriginOpenerPolicy: CrossOriginOpenerPolicy.SameOrigin,
      })
    ).resolves.toBeUndefined();
  });

  it('sends no header when dev features are disabled', async () => {
    setDevFeaturesEnabled(false);

    await expect(
      getCrossOriginOpenerPolicy({
        customUiAssets,
        crossOriginOpenerPolicy: CrossOriginOpenerPolicy.SameOrigin,
      })
    ).resolves.toBeUndefined();
  });
});

describe('isLoopbackOrigin()', () => {
  it.each([
    'http://localhost:3002',
    'https://LOCALHOST',
    'http://localhost.:3001',
    'http://app.localhost:3000',
    'http://127.0.0.1:3001',
    'http://127.1.2.3',
    'http://127.1',
    'http://0.0.0.0:3002',
    'http://[::1]:3002',
    'http://[0:0:0:0:0:0:0:1]',
    'http://[::]:3002',
    'http://[::ffff:127.0.0.1]:3002',
  ])('treats %s as loopback', (origin) => {
    expect(isLoopbackOrigin(origin)).toBe(true);
  });

  it.each([
    'https://auth.example.com',
    'https://localhost.example.com',
    'http://128.0.0.1',
    'http://10.0.0.1',
    'http://[::2]',
    'http://[2001:db8::1]',
    'not a url',
  ])('does not treat %s as loopback', (origin) => {
    expect(isLoopbackOrigin(origin)).toBe(false);
  });

  it('keeps the original origins when all of them are loopback', () => {
    expect(withoutLoopbackOrigins(['http://localhost:3002', 'http://[::1]:3002'])).toEqual([
      'http://localhost:3002',
      'http://[::1]:3002',
    ]);
    expect(withoutLoopbackOrigins(['http://localhost:3002', 'https://portal.example.com'])).toEqual(
      ['https://portal.example.com']
    );
  });
});

const productionEnv = (adminOrigins: string[], coreOrigins: string[]) => ({
  isProduction: true,
  isCloud: false,
  adminUrlSet: { origins: adminOrigins },
  urlSet: { origins: coreOrigins },
  cloudUrlSet: { origins: [] },
});

describe('koaSecurityHeaders() middleware — production loopback origins and HSTS', () => {
  afterEach(() => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    mockEnvOverrides = undefined;
  });

  it('drops loopback origins from the console connect-src and frame-src', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    mockEnvOverrides = productionEnv(
      ['http://localhost:3002', 'http://[::1]:3002', 'https://portal.example.com'],
      ['http://localhost:3001', 'http://127.0.0.1:3001', 'https://auth.example.com']
    );
    const run = koaSecurityHeaders([], 'default');
    const ctx = createMockContext({ method: 'GET', url: '/console' });

    await run(ctx, koaNoop);

    for (const directive of ['connect-src', 'frame-src']) {
      const value = getCspDirective(ctx, directive);
      expect(value).toContain("'self'");
      expect(value).toContain('https://portal.example.com');
      expect(value).toContain('https://auth.example.com');
      expect(value).not.toContain('localhost');
      expect(value).not.toContain('127.0.0.1');
      expect(value).not.toContain('[::1]');
    }
  });

  it('keeps loopback console origins when no public endpoint is configured', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    mockEnvOverrides = productionEnv(['http://localhost:3002'], ['http://localhost:3001']);
    const run = koaSecurityHeaders([], 'default');
    const ctx = createMockContext({ method: 'GET', url: '/console' });

    await run(ctx, koaNoop);

    expect(getCspDirective(ctx, 'connect-src')).toContain('http://localhost:3001');
    expect(getCspDirective(ctx, 'frame-src')).toContain('http://localhost:3002');
  });

  it('drops every loopback form from the experience frame-ancestors', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    mockEnvOverrides = productionEnv(
      [
        'http://localhost:3002',
        'http://127.0.0.2:3002',
        'http://[::1]:3002',
        'http://0.0.0.0:3002',
        'https://portal.example.com',
      ],
      ['https://auth.example.com']
    );
    const run = koaExperienceSecurityHeaders('default', createQueries());
    const ctx = createMockContext({ method: 'GET', url: '/sign-in' });

    await run(ctx, koaNoop);

    expect(getCspDirective(ctx, 'frame-ancestors')).toBe(
      "frame-ancestors 'self' https://portal.example.com"
    );
  });

  it('sends a two-year HSTS header with includeSubDomains', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    mockEnvOverrides = productionEnv(['https://portal.example.com'], ['https://auth.example.com']);
    const run = koaSecurityHeaders(['api', 'oidc'], 'default');

    for (const url of ['/console', '/account', '/oidc/auth', '/sign-in']) {
      const ctx = createMockContext({ method: 'GET', url });
      // eslint-disable-next-line no-await-in-loop
      await run(ctx, koaNoop);
      expect(ctx.res.getHeader('Strict-Transport-Security')).toBe(
        'max-age=63072000; includeSubDomains'
      );
    }
  });

  it('keeps localhost console origins and the default HSTS outside production', async () => {
    const run = koaSecurityHeaders([], 'default');
    const ctx = createMockContext({ method: 'GET', url: '/console' });

    await run(ctx, koaNoop);

    expect(getCspDirective(ctx, 'connect-src')).toContain('http://localhost:3002');
    expect(ctx.res.getHeader('Strict-Transport-Security')).toBe(
      'max-age=15552000; includeSubDomains'
    );
  });
});
/* eslint-enable max-lines */
