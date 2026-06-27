import { pickDefault } from '@logto/shared/esm';

import { createContextWithRouteParameters } from '#src/utils/test-utils.js';

const { jest } = import.meta;

const { MockQueries } = await import('#src/test-utils/tenant.js');
const findAllCustomLanguageTags = jest.fn();

const queries = new MockQueries({
  customPhrases: { findAllCustomLanguageTags },
  signInExperiences: {
    findDefaultSignInExperience: jest.fn().mockResolvedValue({
      languageInfo: {
        autoDetect: true,
        fallbackLanguage: 'en',
      },
    }),
  },
});

const koaEmailI18n = await pickDefault(import('./koa-email-i18n.js'));

describe('koaEmailI18n', () => {
  const next = jest.fn();

  it('should resolve fr as fr-CA is not a built-in language', async () => {
    const ctx = {
      ...createContextWithRouteParameters({
        cookies: { _logto: '{ "uiLocales": "fr-CA fr" }' },
        headers: { 'accept-language': 'fr' },
      }),
      query: { locale: 'fr' },
    };
    findAllCustomLanguageTags.mockResolvedValueOnce([]);
    await koaEmailI18n(queries)(ctx, next);
    expect(ctx.emailI18n?.locale).toEqual('fr');
    expect(ctx.emailI18n?.uiLocales).toEqual('fr-CA fr');
  });

  it('should resolve fr-CA after adding fr-CA as a custom language', async () => {
    const ctx = {
      ...createContextWithRouteParameters({
        cookies: { _logto: '{ "uiLocales": "fr-CA fr" }' },
        headers: { 'accept-language': 'fr' },
      }),
      query: {},
    };
    findAllCustomLanguageTags.mockResolvedValueOnce(['fr-CA']);
    await koaEmailI18n(queries)(ctx, next);
    expect(ctx.emailI18n?.locale).toEqual('fr-CA');
    expect(ctx.emailI18n?.uiLocales).toEqual('fr-CA fr');
  });

  it('should resolve fallback language when no match found', async () => {
    const ctx = {
      ...createContextWithRouteParameters({
        cookies: { _logto: '{ "uiLocales": "de-DE" }' },
      }),
      query: {},
    };
    findAllCustomLanguageTags.mockResolvedValueOnce(['fr-CA']);
    await koaEmailI18n(queries)(ctx, next);
    expect(ctx.emailI18n?.locale).toEqual('de');
    expect(ctx.emailI18n?.uiLocales).toEqual('de-DE');
  });

  it('should not include `uiLocales` when no `ui_locales` param is provided', async () => {
    const ctx = {
      ...createContextWithRouteParameters({
        headers: { 'accept-language': 'ja' },
      }),
      query: {},
    };
    findAllCustomLanguageTags.mockResolvedValueOnce([]);
    await koaEmailI18n(queries)(ctx, next);
    expect(ctx.emailI18n?.locale).toEqual('ja');
    expect(ctx.emailI18n?.uiLocales).toBeUndefined();
  });

  describe('?lang= query parameter', () => {
    // Georgian (`ka`) is not a built-in language; treat it as a custom language in these tests
    // so we can assert that `?lang=` is honored and that region tags normalize to their base.

    it('should let ?lang= take precedence over the cookie ui_locales', async () => {
      const ctx = {
        ...createContextWithRouteParameters({
          cookies: { _logto: '{ "uiLocales": "fr-CA fr" }' },
        }),
        query: { lang: 'ka' },
      };
      findAllCustomLanguageTags.mockResolvedValueOnce(['ka']);
      await koaEmailI18n(queries)(ctx, next);
      expect(ctx.emailI18n?.locale).toEqual('ka');
      // `uiLocales` still reflects the original cookie value (OIDC `ui_locales`), untouched by `?lang=`.
      expect(ctx.emailI18n?.uiLocales).toEqual('fr-CA fr');
    });

    it('should preserve existing behavior when ?lang= is absent', async () => {
      // Same cookie as above, but without `?lang=`: the cookie `ui_locales` still drives resolution.
      const ctx = {
        ...createContextWithRouteParameters({
          cookies: { _logto: '{ "uiLocales": "fr-CA fr" }' },
        }),
        query: {},
      };
      findAllCustomLanguageTags.mockResolvedValueOnce([]);
      await koaEmailI18n(queries)(ctx, next);
      expect(ctx.emailI18n?.locale).toEqual('fr');
      expect(ctx.emailI18n?.uiLocales).toEqual('fr-CA fr');
    });

    it('should normalize a ?lang= region tag to its base (ka-GE -> ka)', async () => {
      const ctx = {
        ...createContextWithRouteParameters({}),
        query: { lang: 'ka-GE' },
      };
      findAllCustomLanguageTags.mockResolvedValueOnce(['ka']);
      await koaEmailI18n(queries)(ctx, next);
      expect(ctx.emailI18n?.locale).toEqual('ka');
      expect(ctx.emailI18n?.uiLocales).toBeUndefined();
    });

    it('should fall back to the cookie ui_locales when ?lang= is unsupported', async () => {
      const ctx = {
        ...createContextWithRouteParameters({
          cookies: { _logto: '{ "uiLocales": "fr-CA fr" }' },
        }),
        query: { lang: 'xyz' },
      };
      findAllCustomLanguageTags.mockResolvedValueOnce(['ka']);
      await koaEmailI18n(queries)(ctx, next);
      // `xyz` is unsupported -> falls back to cookie `ui_locales` -> `fr`
      expect(ctx.emailI18n?.locale).toEqual('fr');
      expect(ctx.emailI18n?.uiLocales).toEqual('fr-CA fr');
    });

    it('should fall back to the fallback language when ?lang= is unsupported and no other source', async () => {
      const ctx = {
        ...createContextWithRouteParameters({}),
        query: { lang: 'xyz' },
      };
      findAllCustomLanguageTags.mockResolvedValueOnce(['ka']);
      await koaEmailI18n(queries)(ctx, next);
      expect(ctx.emailI18n?.locale).toEqual('en');
      expect(ctx.emailI18n?.uiLocales).toBeUndefined();
    });
  });
});
