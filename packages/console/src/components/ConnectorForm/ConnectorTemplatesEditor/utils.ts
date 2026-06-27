import { safeParseJson } from '@/utils/json';

/**
 * Matches `{{t.key}}` placeholders — with optional surrounding whitespace, mirroring the runtime
 * `replaceSendMessageHandlebars` resolver (`/{{\s*([\w.]+)\s*}}/g`) — and captures the translation
 * key, a run of word characters, dots, underscores, and dashes.
 */
const translationKeyPattern = /\{\{\s*t\.([a-zA-Z0-9_.-]+)\s*\}\}/gu;

/**
 * Extracts the unique `{{t.key}}` translation keys referenced across an array of template
 * `content` strings, preserving first-seen order so the translations grid stays stable as
 * templates are edited. Keys composed solely of punctuation (no alphanumeric character) are
 * treated as malformed and ignored.
 */
export const extractTranslationKeys = (
  templates: ReadonlyArray<{ content?: string }>
): string[] => {
  const seen = new Set<string>();

  return templates.flatMap(({ content }) => {
    if (typeof content !== 'string' || content.length === 0) {
      return [];
    }

    const matches = [...content.matchAll(translationKeyPattern)]
      .map((match) => match[1] ?? '')
      .filter((key) => key !== '' && /[a-zA-Z0-9]/u.test(key));

    // Dedupe against `seen` while preserving first-seen order across all templates.
    return matches.filter((key) => {
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    });
  });
};

/**
 * Best-effort `JSON.parse` that never throws: returns `undefined` for empty/whitespace-only
 * strings, non-strings, or invalid JSON. Delegates to the shared `safeParseJson` helper so error
 * handling stays identical to the rest of the console. The generic carries the caller's asserted
 * shape (a JSON form field); no structural guard applies without over-engineering.
 */
export const safeJsonParse = <T>(value: unknown): T | undefined => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return;
  }

  const result = safeParseJson(value);

  if (!result.success) {
    return;
  }

  // eslint-disable-next-line no-restricted-syntax -- the parsed value's shape is asserted by the generic caller (a JSON form field); no structural guard applies without over-engineering.
  return result.data as T;
};

/**
 * Best-effort `JSON.stringify` with the same 2-space indentation used when the form first
 * materializes JSON values (see `initFormData`). Falls back to `'{}'` for `undefined` or
 * non-serializable input (functions, BigInt, circular references) so the form field is never left
 * blank. `JSON.stringify` is typed as returning `string`, but it actually returns `undefined` for
 * some inputs, so the result is checked at runtime.
 */
export const safeJsonStringify = (value: unknown): string => {
  try {
    const result: unknown = JSON.stringify(value, null, 2);

    return typeof result === 'string' ? result : '{}';
  } catch {
    return '{}';
  }
};
