/* eslint-disable unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import { replaceSendMessageHandlebars, type TemplateType } from '@logto/connector-kit';

import { inlineVariables, resolvePerTypeValue } from './compiler';
import { resolveIfBlocks } from './if-parser';
import type {
  DummyPayload,
  PerTypeString,
  PreviewInput,
  RenderedPreview,
  UnifiedTranslations,
} from './types';
import { fieldsForKind } from './utils';

/**
 * Matches a plausible BCP-47-style language tag: a 2–3 letter primary subtag optionally followed by
 * dash-separated subtags (e.g. `en`, `zh-CN`, `pt-BR`). Mirrors the runtime
 * `getLocalizedPayload` guard so the preview's locale fallback chain degrades gracefully on
 * malformed/empty locales (no `t` dict injected → literal `{{t.K}}` placeholders survive in the
 * preview, matching runtime behavior).
 */
const languageTagPattern = /^[A-Za-z]{2,3}(-[\dA-Za-z]{2,8})*$/u;

const isPlausibleLanguageTag = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && languageTagPattern.test(value);

/**
 * Returns the parent language tag of a BCP-47 language tag, e.g. `'zh'` for `'zh-CN'`. Returns
 * `undefined` when the tag has no region/script subtag (no dash).
 */
const parentLanguageTag = (tag: string): string | undefined => {
  const dashIndex = tag.indexOf('-');

  if (dashIndex <= 0) {
    return;
  }

  const parent = tag.slice(0, dashIndex);

  return parent || undefined;
};

/**
 * Builds the ordered list of fallback candidates for a given locale, excluding `undefined`/empty
 * entries. Order: exact `locale` → parent tag (if any) → `'en'`. The caller appends the
 * "first available language" fallback when none of these resolve.
 */
const localeFallbackCandidates = (locale: string): readonly string[] => {
  const parent = parentLanguageTag(locale);

  return [locale, parent, 'en'].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0
  );
};

/**
 * Resolves the flat translations dictionary (`Record<key, string>`) for a preview locale
 * using the same fallback chain as the runtime `getLocalizedPayload`: exact `locale` → parent tag
 * → `'en'` → first available language. Returns `undefined` when no dictionary can be resolved (or
 * the locale is malformed), in which case `{{t.K}}` placeholders survive verbatim — matching
 * runtime behavior.
 */
const resolvePreviewDict = (
  translations: UnifiedTranslations,
  locale?: string
): Record<string, string> | undefined => {
  if (!isPlausibleLanguageTag(locale)) {
    return;
  }

  for (const candidate of localeFallbackCandidates(locale)) {
    if (candidate in translations) {
      return translations[candidate];
    }
  }

  const [firstKey] = Object.keys(translations);

  return firstKey === undefined ? undefined : translations[firstKey];
};

/**
 * Builds the preview `payload.t` dict for a target type `T` from the resolved locale's flat
 * dictionary. Under Unified v4, the dictionary is already a flat `Record<string, string>` and
 * copied verbatim, so we just return it.
 */
const buildPreviewTDict = (
  translations: UnifiedTranslations,
  locale: string | undefined
): Record<string, string> => {
  const dict = resolvePreviewDict(translations, locale);

  return dict ?? {};
};

/**
 * Whether a resolved preview `t` dict carries at least one non-empty value. Mirrors the runtime
 * behavior of {@link getLocalizedPayload} + the compiler's `flattenTranslationsForType`: when no
 * (key, type) pair resolves to a truthy value, the runtime `payload.t` is NOT injected, so
 * `{{t.K}}` placeholders survive verbatim in the rendered message. The preview must match — when
 * `hasValues` is false, omitting `t` keeps the literal `{{t.K}}` placeholder instead of collapsing
 * it to an empty string (which would diverge from the runtime output).
 */
const hasValues = (dict: Record<string, string>): boolean =>
  Object.values(dict).some((value) => value.length > 0);

/**
 * Renders the unified template for a selected {@link TemplateType} + optional preview locale with
 * the hardcoded dummy payload, returning each present localizable field fully rendered.
 */
export const renderPreview = (
  input: PreviewInput,
  type: TemplateType,
  locale: string | undefined,
  payload: DummyPayload
): RenderedPreview => {
  const { kind, template, variables, translations, unifiedSubjects = {} } = input;
  const fields = fieldsForKind(kind);
  const tDict = buildPreviewTDict(translations, locale);
  // Only inject `t` when it carries at least one non-empty value; otherwise omit it so missing
  // `{{t.K}}` placeholders survive verbatim — matching runtime `getLocalizedPayload`.
  const renderedPayload = { ...payload, ...(hasValues(tDict) && { t: tDict }) };

  const baseResult = fields.reduce<RenderedPreview>((result, field) => {
    const raw = template[field];

    if (typeof raw !== 'string' || raw.length === 0) {
      return result;
    }

    const resolved = resolveIfBlocks(raw, type);
    const inlined = inlineVariables(resolved, variables, type);

    return { ...result, [field]: replaceSendMessageHandlebars(inlined, renderedPayload) };
  }, {});

  if (Object.keys(unifiedSubjects).length > 0) {
    const rawSubject = resolvePerTypeValue(unifiedSubjects, type);
    const inlinedSubject = inlineVariables(rawSubject, variables, type);
    baseResult.subject = replaceSendMessageHandlebars(inlinedSubject, renderedPayload);
  }

  return baseResult;
};
/* eslint-enable */
