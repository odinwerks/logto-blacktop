import { TemplateType } from '@logto/connector-kit';

import { safeParseJson } from '@/utils/json';

import { isTemplateFilled, type ConnectorTemplateMode } from './mode';

/**
 * The list of every usage type Logto supports, derived from the {@link TemplateType} enum so future
 * additions are surfaced automatically. Because `TemplateType` is a string enum (values equal
 * their keys, no numeric reverse mappings), `Object.values` yields exactly the usage-type strings.
 */
const allTemplateUsageTypes: readonly string[] = Object.values(TemplateType);

/**
 * Returns a rows array guaranteed to contain an entry for every {@link TemplateType}, in a stable
 * canonical order, by appending an empty row (built by `buildEmptyRow`) for any missing usage type.
 *
 * Existing rows are preserved (first occurrence wins on duplicate usage types), reordered to
 * follow the canonical {@link allTemplateUsageTypes} order; any custom usage type not in the enum
 * is appended at the end preserving first-seen order. Synthetic empty rows are display-only — they
 * are only persisted to the form field when the user edits one of their fields (see the host's
 * `updateTemplateField` write-back), so existing configs are never polluted with unused types.
 *
 * This lets the editor surface every supported delivery template regardless of which subset the
 * connector's config currently defines.
 *
 * @param rows The parsed template rows (any provider shape, each carrying a `usageType`).
 * @param buildEmptyRow Builds a provider-appropriate empty row for a missing usage type.
 */
export const ensureAllTemplateTypes = <T extends { usageType: string }>(
  rows: readonly T[],
  buildEmptyRow: (usageType: string) => T
): T[] => {
  const existing = new Map<string, T>();

  for (const row of rows) {
    if (typeof row.usageType === 'string' && !existing.has(row.usageType)) {
      existing.set(row.usageType, row);
    }
  }

  const seen = new Set<string>();

  // Canonical rows: every supported type, reusing the configured row where present (first wins on
  // duplicates) or a freshly-built empty row otherwise.
  const canonical = allTemplateUsageTypes.map((usageType) => {
    const row = existing.get(usageType) ?? buildEmptyRow(usageType);

    seen.add(usageType);

    return row;
  });

  // Custom (non-enum) usage types the connector defined, appended in first-seen order so
  // provider-specific templates are never dropped.
  const custom = rows.filter((row) => {
    if (typeof row.usageType !== 'string' || seen.has(row.usageType)) {
      return false;
    }

    seen.add(row.usageType);

    return true;
  });

  return [...canonical, ...custom];
};

/**
 * Sorts template rows by fill status for display: filled (specific) templates first, the `Generic`
 * row next (always parked between filled-specific and empty-specific, even when the generic row
 * itself is empty), and the remaining empty templates last. Within each bucket the input order is
 * preserved (the comparator only returns `0` for same-bucket rows, and `Array.prototype.sort` is
 * stable in the engines this app targets), so the canonical order from {@link ensureAllTemplateTypes}
 * holds inside every bucket.
 *
 * A row is "filled" when at least one of its editable fields for `mode` is non-empty (see
 * {@link isTemplateFilled}); `Generic` is matched by its `usageType` (`TemplateType.Generic`, the
 * string `'Generic'`).
 *
 * Returns a new array; the input is not mutated.
 *
 * @param templates The display rows (any provider shape, each carrying a `usageType`).
 * @param mode The editor mode for the connector (drives which fields count as "filled").
 */
export const sortTemplatesByFillStatus = <T extends { usageType: string }>(
  templates: readonly T[],
  mode: ConnectorTemplateMode
): T[] =>
  templates.slice().sort((left, right) => {
    const leftFilled = isTemplateFilled(left, mode);
    const rightFilled = isTemplateFilled(right, mode);
    const leftGeneric = left.usageType === 'Generic';
    const rightGeneric = right.usageType === 'Generic';

    // `Generic` always sits between filled-specific and empty-specific rows: after any filled
    // specific row, and before any empty specific row.
    if (leftGeneric && !rightGeneric) {
      return rightFilled ? 1 : -1;
    }

    if (!leftGeneric && rightGeneric) {
      return leftFilled ? -1 : 1;
    }

    if (leftFilled && !rightFilled) {
      return -1;
    }

    if (!leftFilled && rightFilled) {
      return 1;
    }

    return 0;
  });

/**
 * Matches `{{t.key}}` placeholders — with optional surrounding whitespace, mirroring the runtime
 * `replaceSendMessageHandlebars` resolver (`/{{\s*([\w.]+)\s*}}/g`) — and captures the translation
 * key, a run of word characters, dots, underscores, and dashes.
 */
const translationKeyPattern = /\{\{\s*t\.([a-zA-Z0-9_.-]+)\s*\}\}/gu;

/**
 * Extracts the unique `{{t.key}}` translation keys referenced across an array of template rows,
 * scanning each named string field, preserving first-seen order so the translations grid stays
 * stable as templates are edited. Keys composed solely of punctuation (no alphanumeric character)
 * are treated as malformed and ignored.
 *
 * @param templates The template rows (any provider shape).
 * @param fields The string fields to scan for `{{t.key}}` placeholders. Defaults to `['content']`
 * (SMS) so existing callers/tests are unchanged. Pass `['subject','content']` for the common email
 * shape, or `['subject','html','text']` for Mailgun `deliveries`.
 */
export const extractTranslationKeys = (
  templates: ReadonlyArray<Record<string, unknown>>,
  fields: readonly string[] = ['content']
): string[] => {
  const seen = new Set<string>();

  return templates.flatMap((template) =>
    fields.flatMap((field) => {
      const content = template[field];

      if (typeof content !== 'string' || content.length === 0) {
        return [];
      }

      const matches = [...content.matchAll(translationKeyPattern)]
        .map((match) => match[1] ?? '')
        .filter((key) => key !== '' && /[a-zA-Z0-9]/u.test(key));

      // Dedupe against `seen` while preserving first-seen order across all templates/fields.
      return matches.filter((key) => {
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      });
    })
  );
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
