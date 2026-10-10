import {
  findSupportedLanguageTag,
  matchExactLanguageTag,
  matchSupportedLanguageTag,
} from '@logto/language-kit';
import { builtInLanguages } from '@logto/phrases-experience';
import { type SignInExperience } from '@logto/schemas';
import { conditionalArray } from '@silverhand/essentials';
import type { i18n } from 'i18next';
import _i18next from 'i18next';
import { type ParameterizedContext } from 'koa';
import { type IRouterParamContext } from 'koa-router';

import detectLanguage from '#src/i18n/detect-language.js';
import type Queries from '#src/tenants/Queries.js';

/**
 * The global scoped i18next instance.
 * We use this instance to maintain the global configuration and resources for i18next.
 *
 * @remarks
 * This instance should not be used directly in the request lifecycle as it is shared across all requests.
 * For different language settings in the request lifecycle, use `ctx.i18next` instead.
 */
// This may be fixed by a cjs require wrapper. TBD.
// See https://github.com/microsoft/TypeScript/issues/49189
// eslint-disable-next-line no-restricted-syntax
export const i18next = _i18next as unknown as i18n;

type GetExperienceLanguage = {
  ctx: ParameterizedContext<unknown, IRouterParamContext>;
  languageInfo: SignInExperience['languageInfo'];
  customLanguages: readonly string[];
  lng?: string;
};

export const getExperienceLanguage = ({
  ctx,
  languageInfo: { autoDetect, fallbackLanguage },
  customLanguages,
  lng,
}: GetExperienceLanguage) => {
  const acceptableLanguageCandidates = conditionalArray<string | string[]>(
    lng?.split(/\s+/).filter(Boolean),
    autoDetect && detectLanguage(ctx),
    fallbackLanguage
  );
  const acceptableLanguages = acceptableLanguageCandidates.flatMap<string>((language) =>
    Array.isArray(language) ? language : [language]
  );

  for (const language of acceptableLanguages) {
    const customExactLanguage = matchExactLanguageTag([language], customLanguages);

    if (customExactLanguage) {
      return customExactLanguage;
    }

    const builtInExactLanguage = matchExactLanguageTag([language], builtInLanguages);

    if (builtInExactLanguage) {
      return builtInExactLanguage;
    }

    const { match: builtInFallbackLanguage, matchType: builtInMatchType } =
      matchSupportedLanguageTag([language], builtInLanguages);

    if (builtInMatchType === 'base' && builtInFallbackLanguage) {
      return builtInFallbackLanguage;
    }

    const { match: customFallbackLanguage, matchType: customMatchType } = matchSupportedLanguageTag(
      [language],
      customLanguages
    );

    if (customMatchType === 'base' && customFallbackLanguage) {
      return customFallbackLanguage;
    }
  }

  return findSupportedLanguageTag([], builtInLanguages);
};

type ResolveMessageLocaleArgs = {
  queries: Queries;
  locale: string;
};

/**
 * Resolve an explicit message `locale` (e.g. a request body field) against the tenant's
 * supported languages, so an arbitrary string can never reach a connector payload verbatim:
 * an exact custom or built-in tag wins, a region tag normalizes to its supported base tag,
 * and an unrecognized tag resolves to `undefined` so callers keep the default locale.
 */
export const resolveMessageLocale = async ({
  queries: { customPhrases },
  locale,
}: ResolveMessageLocaleArgs) => {
  const customLanguages = await customPhrases.findAllCustomLanguageTags();
  const tags = [locale];
  const { match: builtInMatch, matchType: builtInMatchType } = matchSupportedLanguageTag(
    tags,
    builtInLanguages
  );
  const { match: customMatch, matchType: customMatchType } = matchSupportedLanguageTag(
    tags,
    customLanguages
  );

  return (
    matchExactLanguageTag(tags, customLanguages) ??
    matchExactLanguageTag(tags, builtInLanguages) ??
    (builtInMatchType === 'base' ? builtInMatch : undefined) ??
    (customMatchType === 'base' ? customMatch : undefined)
  );
};
