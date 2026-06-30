import { type ConnectorType } from '@logto/connector-kit';

import { safeParseJson } from '@/utils/json';

import { isPlainObject } from '../utils';

import type { ConnectorKind, PerTypeString, UnifiedTemplate } from './types';

/**
 * The localizable string fields a {@link ConnectorKind} compiles (and previews). The unified
 * template carries the Mailgun HTML body in the `content` field (the compiler maps it to the
 * delivery row's `html` key on emit). Mailgun additionally carries `subject` and an optional
 * `text` plain-text part.
 *
 * Single source of truth for the compiler (`compileUnified`) and the preview (`renderPreview`),
 * which previously each carried their own identical copy.
 */
export const fieldsForKind = (kind: ConnectorKind): ReadonlyArray<keyof UnifiedTemplate> => [
  'content',
];

/**
 * Maps a connector's {@link ConnectorType} to the unified compiler {@link ConnectorKind} it
 * targets. Only Mailgun (`Email`) is supported by the unified editor; SMS connectors keep the
 * classic per-type editor and never reach this path (the {@link UnifiedEditorModeToggle} allowlist
 * gates the toggle to `mailgun-email` only). Single source of truth for the toggle host and the
 * {@link UnifiedTemplateEditor}.
 */
export const kindForConnectorType = (connectorType: ConnectorType): ConnectorKind =>
  'email-mailgun';

/**
 * Narrows a parsed JSON value for one `PerTypeString` cell map to the cleaned shape the unified
 * model stores: keeps only string-valued, non-empty cells whose column key is a recognized
 * {@link typeColumns} member (everything else — empty strings, non-strings, unknown type columns —
 * is dropped). Non-object values collapse to `{}`. Used by {@link parsePerTypeTableJson} so the
 * build phase only ever stores columns the compiler/preview resolve.
 */
const normalizePerType = (value: unknown, allowedColumns: ReadonlySet<string>): PerTypeString => {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.entries(value).reduce<PerTypeString>(
    (accumulator, [column, cellValue]) =>
      typeof cellValue === 'string' && cellValue.length > 0 && allowedColumns.has(column)
        ? { ...accumulator, [column]: cellValue }
        : accumulator,
    {}
  );
};

/** The structured error keys a per-type table JSON parse can surface to the UI. */
export type PerTypeTableParseError =
  | 'invalid_json_format'
  | 'json_must_be_object'
  | 'json_values_must_be_strings';

/**
 * The result of parsing a per-type table JSON draft: the cleaned table on success, an errorKey on
 * failure. Kept module-local (`parsePerTypeTableJson`'s callers infer it from the return type).
 */
type PerTypeTableParseResult =
  | { readonly success: true; readonly data: Record<string, PerTypeString> }
  | { readonly success: false; readonly errorKey: PerTypeTableParseError };

/**
 * Parses a per-type table JSON draft (`Record<key, PerTypeString>`) for the Variables and the
 * per-language Localizations editors, mirroring {@link parseTranslationsJson}'s draft-and-merge
 * pattern (so pasted JSON extends an existing table without losing unmentioned keys) and surfacing
 * a structured error rather than a bare boolean.
 *
 * Validation rules (each maps to a user-facing message via {@link PerTypeTableParseError}):
 * - Empty/whitespace text is valid and yields `{}` (opening JSON mode on an empty table, or
 *   clearing the editor, never wipes existing keys on merge).
 * - The top-level value must be a plain object (`json_must_be_object`).
 * - Each value must itself be a plain object (`json_must_be_object`).
 * - Every cell value must be a string (`json_values_must_be_strings`).
 *
 * Empty-string top-level keys are skipped, and the surviving cells are normalized via
 * {@link normalizePerType} (string + non-empty + recognized column only). Built immutably with a
 * `.reduce` that short-circuits on the first structural error so no `let`/reassignment is needed.
 */
export const parsePerTypeTableJson = (
  text: string,
  columns: readonly string[]
): PerTypeTableParseResult => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { success: true, data: {} };
  }

  const parseResult = safeParseJson(trimmed);

  if (!parseResult.success) {
    return { success: false, errorKey: 'invalid_json_format' };
  }

  if (!isPlainObject(parseResult.data)) {
    return { success: false, errorKey: 'json_must_be_object' };
  }

  const entries = Object.entries(parseResult.data).filter(([key]) => key.length > 0);
  const allowedColumns = new Set(columns);

  // Single reduce both validates the nested shape (top-level object → each value an object → each
  // cell a string) and builds the cleaned table, carrying the first structural errorKey out via the
  // accumulator so the build stays type-safe (the `isPlainObject` guard narrows each value to
  // `Record<string, unknown>` for the cell scan) without a cast.
  const reduced = entries.reduce<{
    readonly data: Record<string, PerTypeString>;
    readonly errorKey?: PerTypeTableParseError;
  }>(
    (accumulator, [key, perType]) => {
      if (accumulator.errorKey) {
        return accumulator;
      }

      if (!isPlainObject(perType)) {
        return { ...accumulator, errorKey: 'json_must_be_object' };
      }

      const hasNonStringCell = Object.values(perType).some(
        (cellValue) => typeof cellValue !== 'string'
      );

      if (hasNonStringCell) {
        return { ...accumulator, errorKey: 'json_values_must_be_strings' };
      }

      return {
        ...accumulator,
        data: { ...accumulator.data, [key]: normalizePerType(perType, allowedColumns) },
      };
    },
    { data: {} }
  );

  return reduced.errorKey
    ? { success: false, errorKey: reduced.errorKey }
    : { success: true, data: reduced.data };
};

/**
 * Per-key shallow merge of a parsed per-type table into the current draft: parsed values override
 * existing keys, and unmentioned draft keys are preserved. Returns a new object; neither input is
 * mutated. The Variables/localizations JSON → Form switch uses this so pasted JSON extends an
 * existing table without losing keys that aren't mentioned in the JSON. Generic over the table's
 * value type so both `VariablesTable` and the per-language `LanguageDict` share one implementation.
 */
export const mergePerTypeTable = <T extends PerTypeString>(
  current: Record<string, T>,
  parsed: Record<string, T>
): Record<string, T> => ({ ...current, ...parsed });
