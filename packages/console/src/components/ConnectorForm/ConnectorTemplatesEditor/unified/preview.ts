import { replaceSendMessageHandlebars, type TemplateType } from '@logto/connector-kit';

import { inlineVariables } from './compiler';
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
 * Resolves the per-language per-type dictionary (`Record<key, PerTypeString>`) for a preview locale
 * using the same fallback chain as the runtime `getLocalizedPayload`: exact `locale` → parent tag
 * → `'en'` → first available language. Returns `undefined` when no dictionary can be resolved (or
 * the locale is malformed), in which case `{{t.K}}` placeholders survive verbatim — matching
 * runtime behavior.
 */
const resolvePreviewDict = (
  translations: UnifiedTranslations,
  locale?: string
): Record<string, PerTypeString> | undefined => {
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
 * Builds the preview `payload.t` dict for a target type `T` from the resolved locale's per-type
 * dictionary: each key `K` maps to `dict[K][T] ?? dict[K]['Generic'] ?? ''`. Mirrors the compile-time
 * per-(L, T) fallback so the preview shows exactly what a sent message of type `T` in locale `L`
 * would render.
 */
const buildPreviewTDict = (
  translations: UnifiedTranslations,
  locale: string | undefined,
  targetType: TemplateType
): Record<string, string> => {
  const dict = resolvePreviewDict(translations, locale);

  if (!dict) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(dict).map(([key, perType]): [string, string] => [
      key,
      perType[targetType] ?? perType.Generic ?? '',
    ])
  );
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
 *
 * Steps per field:
 * 1. `resolveIfBlocks(body, type)` — keep matching `<If>` blocks, drop others.
 * 2. `inlineVariables(body, variables, type)` — replace `{{var.X}}` with the per-type / Generic
 *    value (compile-time constants are baked in, exactly as the compiler would).
 * 3. Build `payload.t` from the resolved locale's per-type dict (with the runtime fallback chain),
 *    so `{{t.K}}` resolves to the per-type value (the unified body still carries the un-namespaced
 *    `{{t.K}}` — the preview resolves it directly, whereas the compiled runtime row carries the
 *    namespaced `{{t.K__T}}`). The `t` dict is only injected when it carries at least one non-empty
 *    value — matching runtime `getLocalizedPayload`, which leaves `payload` unchanged (no `t`) when
 *    no translation can be resolved. When `t` is omitted, `{{t.K}}` placeholders survive verbatim
 *    (the literal `{{t.K}}`/`{{t.K__T}}` survives the runtime send path the same way).
 * 4. `replaceSendMessageHandlebars(body, { ...dummyPayload, ...(hasValues(tDict) && { t: tDict }) })`
 *    — resolve `{{t.K}}` from `payload.t` and `{{code}}` / `{{email}}` / `{{phone}}` from the dummy
 *    payload. Unknown placeholders survive verbatim (matching runtime behavior).
 *
 * Returns a {@link RenderedPreview} carrying each present field rendered (so a Mailgun preview can
 * show `subject` + `html` + `text` independently; a Ubill-SMS preview carries only `content`). A
 * single string return cannot represent a multi-field Mailgun template, so the per-field object is
 * the practical, faithful shape.
 */
export const renderPreview = (
  input: PreviewInput,
  type: TemplateType,
  locale: string | undefined,
  payload: DummyPayload
): RenderedPreview => {
  const { kind, template, variables, translations } = input;
  const fields = fieldsForKind(kind);
  const tDict = buildPreviewTDict(translations, locale, type);
  // Only inject `t` when it carries at least one non-empty value; otherwise omit it so missing
  // `{{t.K}}` placeholders survive verbatim — matching runtime `getLocalizedPayload`.
  const renderedPayload = { ...payload, ...(hasValues(tDict) && { t: tDict }) };

  return fields.reduce<RenderedPreview>((result, field) => {
    const raw = template[field];

    if (typeof raw !== 'string' || raw.length === 0) {
      return result;
    }

    const resolved = resolveIfBlocks(raw, type);
    const inlined = inlineVariables(resolved, variables, type);

    return { ...result, [field]: replaceSendMessageHandlebars(inlined, renderedPayload) };
  }, {});
};
