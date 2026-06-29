import { TemplateType } from '@logto/connector-kit';

import { resolveIfBlocks } from './if-parser';
import type {
  CompileInput,
  CompileOutput,
  CompiledTranslations,
  ConnectorKind,
  PerTypeString,
  SeedUnifiedFromClassicInput,
  SeedUnifiedFromClassicOutput,
  UnifiedTemplate,
  UnifiedTranslations,
  VariablesTable,
} from './types';

/**
 * Every supported {@link TemplateType}, cached once for the per-type compile loop. Because
 * `TemplateType` is a string enum (values equal their keys, no numeric reverse mappings),
 * `Object.values` yields exactly the usage-type strings.
 */
const allTemplateTypes: readonly TemplateType[] = Object.values(TemplateType);

/**
 * Matches `{{var.X}}` placeholders (with optional surrounding whitespace) and captures the variable
 * key `X`. The `var.` prefix deliberately separates compile-time variables from runtime payload
 * handlebars (`{{code}}`, `{{t.K}}`) so inlining cannot shadow a runtime placeholder.
 */
const variablePattern = /\{\{\s*var\.([a-zA-Z0-9_.-]+)\s*\}\}/gu;

/**
 * Matches `{{t.K}}` placeholders (with optional surrounding whitespace) and captures the
 * translation key `K`. Mirrors the runtime `replaceSendMessageHandlebars` resolver's
 * `/{{\s*([\w.]+)\s*}}/g` capture, restricted to the `t.` prefix.
 */
const translationPattern = /\{\{\s*t\.([a-zA-Z0-9_.-]+)\s*\}\}/gu;

/**
 * The localizable string fields a {@link ConnectorKind} compiles. Both kinds carry the body in
 * the unified `content` field (SMS content for Ubill; the HTML body for Mailgun) — the compiler
 * maps it to the connector-specific row key (`content` for SMS, `html` for Mailgun) on emit.
 * Mailgun additionally carries `subject` and an optional `text` plain-text part.
 */
const fieldsForKind = (kind: ConnectorKind): ReadonlyArray<keyof UnifiedTemplate> =>
  kind === 'sms-ubill' ? ['content'] : ['subject', 'content', 'text'];

/**
 * Resolves a per-type value for `targetType` from a {@link PerTypeString}, falling back to the
 * `Generic` column (matching the existing `getConfigTemplateByType` runtime fallback pattern).
 * Returns the empty string when neither the type nor `Generic` is defined.
 */
const resolvePerTypeValue = (
  perType: PerTypeString | undefined,
  targetType: TemplateType
): string => perType?.[targetType] ?? perType?.Generic ?? '';

/**
 * Inlines `{{var.X}}` placeholders with the per-type variable value (with `Generic` fallback).
 * Variables are compile-time, connector-scoped constants (not locale-specific), so they are baked
 * literally into the compiled row — the connector never needs to know about variables at send
 * time. An undefined variable key resolves to the empty string (inlined as nothing).
 *
 * Only `{{var.X}}` is touched; `{{t.K}}` localization placeholders and runtime payload handlebars
 * (`{{code}}`, `{{email}}`, …) pass through untouched.
 */
export const inlineVariables = (
  body: string,
  variables: VariablesTable,
  targetType: TemplateType
): string => {
  if (body.length === 0) {
    return '';
  }

  return body.replaceAll(variablePattern, (fullMatch, key: string) =>
    resolvePerTypeValue(variables[key], targetType)
  );
};

/**
 * Rewrites `{{t.K}}` placeholders into namespaced `{{t.K__T}}` keys for the target type `T`, so
 * the existing runtime `replaceSendMessageHandlebars` resolver resolves per-type localized values
 * via `payload.t['K__T']` without any send-path changes. A single compiled `t` dict carries every
 * `(K, T)` pair (see {@link flattenTranslationsForType}).
 */
export const rewriteLocalizations = (body: string, targetType: TemplateType): string => {
  if (body.length === 0) {
    return '';
  }

  return body.replaceAll(
    translationPattern,
    (fullMatch, key: string) => `{{t.${key}__${targetType}}}`
  );
};

/**
 * Extracts the unique `{{t.K}}` translation keys referenced in a body, in first-seen order. Used
 * to determine exactly which `K__T` entries the compiled translations dict must carry for a target
 * type (so the runtime row's `{{t.K__T}}` always resolves). Keys with no alphanumeric character
 * are treated as malformed and ignored.
 */
const extractTranslationKeysFromBody = (body: string): string[] => {
  if (body.length === 0) {
    return [];
  }

  const seen = new Set<string>();

  return [...body.matchAll(translationPattern)]
    .map((match) => match[1] ?? '')
    .filter((key) => {
      if (key === '' || !/[a-zA-Z0-9]/u.test(key) || seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    });
};

/**
 * Builds the flat runtime translations fragment for a single target type `T`: for each referenced
 * key `K` and each language `L`, `translations[L][`${K}__${T}`] =
 * unifiedTranslations[L]?.[K]?.[T] ?? unifiedTranslations[L]?.[K]?.['Generic'] ?? ''`.
 *
 * Empty values are omitted (so a missing key/locale does not pollute the runtime dict and
 * `cleanDeep` can strip empty objects), and empty per-language dicts are dropped entirely. The
 * host merges the per-type fragments across all types into the final compiled translations dict.
 */
export const flattenTranslationsForType = (
  unified: UnifiedTranslations,
  keysForType: ReadonlySet<string>,
  targetType: TemplateType
): CompiledTranslations =>
  Object.entries(unified).reduce<CompiledTranslations>((accumulator, [languageTag, perKeyDict]) => {
    const flatDict = [...keysForType].reduce<Record<string, string>>((flatAccumulator, key) => {
      const value = resolvePerTypeValue(perKeyDict[key], targetType);

      return value ? { ...flatAccumulator, [`${key}__${targetType}`]: value } : flatAccumulator;
    }, {});

    return Object.keys(flatDict).length > 0
      ? { ...accumulator, [languageTag]: flatDict }
      : accumulator;
  }, {});

/** Immutably merges a per-type translations fragment into the compiled translations dict. */
const mergeTranslationsFragments = (
  target: CompiledTranslations,
  fragment: CompiledTranslations
): CompiledTranslations =>
  Object.entries(fragment).reduce<CompiledTranslations>(
    (accumulator, [languageTag, flatDict]) => ({
      ...accumulator,
      [languageTag]: { ...accumulator[languageTag], ...flatDict },
    }),
    target
  );

/** The fully-compiled body for one localizable field of one target type (pre-rewrite keys + post-rewrite body). */
type CompiledField = {
  readonly body: string;
  readonly keys: readonly string[];
};

/**
 * Compiles a single unified template field for `targetType`: resolves `<If>` blocks, inlines
 * variables, captures the `{{t.K}}` keys referenced in the resolved (pre-rewrite) body, then
 * rewrites them to namespaced `{{t.K__T}}` keys so the runtime resolver resolves per-type values.
 */
const compileField = (
  rawField: string | undefined,
  variables: VariablesTable,
  targetType: TemplateType
): CompiledField => {
  const raw = rawField ?? '';
  const resolved = resolveIfBlocks(raw, targetType);
  const inlined = inlineVariables(resolved, variables, targetType);
  const keys = extractTranslationKeysFromBody(inlined);
  const body = rewriteLocalizations(inlined, targetType);

  return { body, keys };
};

/** Whether a compiled field's body should produce a persisted row (empty bodies are skipped). */
const isFieldNonEmpty = (body: string): boolean => body.length > 0;

/**
 * Compiles the unified model into the exact `templates`/`deliveries` + `translations` shapes the
 * target connector already consumes, so the persisted + runtime contract is byte-for-byte
 * unchanged and the send path needs zero changes.
 *
 * Per target type `T` (every {@link TemplateType}):
 * 1. `resolveIfBlocks(template[field], T)` — keep matching `<If>` blocks, drop others.
 * 2. `inlineVariables(body, variables, T)` — replace `{{var.X}}` with the per-type / Generic value.
 * 3. Capture the `{{t.K}}` keys referenced in the resolved body, then
 *    `rewriteLocalizations(body, T)` — replace `{{t.K}}` with `{{t.K__T}}`.
 * 4. Build the row for type `T` in the connector's shape.
 * 5. Merge `flattenTranslationsForType(unified, keysForT, T)` into the compiled translations dict,
 *    so the runtime `payload.t` carries `K__T` for every reference.
 *
 * Row emission: a type `T` (other than `Generic`) whose compiled body is empty is skipped — matching
 * the classic editor's synthetic-row behavior (empty rows are display-only and never persisted).
 * `Generic` is always emitted (even when empty) so Mailgun's `deliveries[type] ?? deliveries[Generic]`
 * fallback always resolves, and so a connector with only `<If>` overrides still carries a (possibly
 * empty) Generic fallback row.
 */
export const compileUnified = (input: CompileInput): CompileOutput => {
  const { kind, template, variables, translations } = input;
  const fields = fieldsForKind(kind);

  // Pre-compile every (type, field) once via a `Map` built from a `.map` (no `Map.set` mutation),
  // so the row-emission pass can look each (type, field) up without recompiling.
  const compiledByType = new Map(
    allTemplateTypes.map((targetType): [TemplateType, Record<string, CompiledField>] => [
      targetType,
      Object.fromEntries(
        fields.map((field): [string, CompiledField] => [
          field,
          compileField(template[field], variables, targetType),
        ])
      ),
    ])
  );

  if (kind === 'sms-ubill') {
    const { templates, translations: compiledTranslations } = allTemplateTypes.reduce<{
      templates: Array<{ usageType: TemplateType; content: string }>;
      translations: CompiledTranslations;
    }>(
      (accumulator, targetType) => {
        const compiledFields = compiledByType.get(targetType);
        const content = compiledFields?.content?.body ?? '';

        if (!isFieldNonEmpty(content) && targetType !== TemplateType.Generic) {
          return accumulator;
        }

        const keysForType = new Set(compiledFields?.content?.keys ?? []);
        const fragment = flattenTranslationsForType(translations, keysForType, targetType);

        return {
          templates: [...accumulator.templates, { usageType: targetType, content }],
          translations: mergeTranslationsFragments(accumulator.translations, fragment),
        };
      },
      { templates: [], translations: {} }
    );

    return {
      rows: { kind: 'sms-ubill', templates },
      translations: compiledTranslations,
    };
  }

  const { deliveries, translations: compiledTranslations } = allTemplateTypes.reduce<{
    deliveries: Record<string, { subject?: string; html: string; text?: string }>;
    translations: CompiledTranslations;
  }>(
    (accumulator, targetType) => {
      const compiledFields = compiledByType.get(targetType);
      // The unified `content` field is the Mailgun HTML body; emit it as the row's `html`.
      const html = compiledFields?.content?.body ?? '';
      const subject = compiledFields?.subject?.body ?? '';
      const text = compiledFields?.text?.body ?? '';

      if (!isFieldNonEmpty(html) && targetType !== TemplateType.Generic) {
        return accumulator;
      }

      // The Mailgun guard requires a non-optional `html` on every deliveries row; subject/text are
      // only emitted when non-empty (matching the classic row's `showText` gating).
      const row: { subject?: string; html: string; text?: string } = {
        html,
        ...(subject ? { subject } : {}),
        ...(text ? { text } : {}),
      };

      const keysForType = new Set<string>([
        ...(compiledFields?.subject?.keys ?? []),
        ...(compiledFields?.content?.keys ?? []),
        ...(compiledFields?.text?.keys ?? []),
      ]);
      const fragment = flattenTranslationsForType(translations, keysForType, targetType);

      return {
        deliveries: { ...accumulator.deliveries, [targetType]: row },
        translations: mergeTranslationsFragments(accumulator.translations, fragment),
      };
    },
    { deliveries: {}, translations: {} }
  );

  return {
    rows: { kind: 'email-mailgun', deliveries },
    translations: compiledTranslations,
  };
};

/**
 * Splits a flat translation key into its base `K` + per-type `T` tag, returning `undefined` when
 * the key is not a namespaced `K__T` pair (a plain classic key). The `__` separator is reserved
 * by {@link rewriteLocalizations} for the namespacing rewrite, so a classic `K__T` collision is
 * the admin's responsibility (documented as a known namespacing limitation).
 */
const splitNamespacedKey = (key: string): { key: string; type: TemplateType } | undefined => {
  const separatorIndex = key.lastIndexOf('__');

  if (separatorIndex <= 0) {
    return;
  }

  const baseKey = key.slice(0, separatorIndex);
  const typeLiteral = key.slice(separatorIndex + 2);
  const matched = allTemplateTypes.find(
    (value) => value.toLowerCase() === typeLiteral.toLowerCase()
  );

  return matched && baseKey.length > 0 ? { key: baseKey, type: matched } : undefined;
};

/**
 * Reconstructs a per-type cell map for one field across the classic per-type rows (keyed by the
 * usage-type string). Used by the reverse-compile so a classic connector with per-type content
 * variations surfaces them as `<If>` blocks (or a shared body when every configured type shares
 * identical content).
 */
const collectFieldByType = (
  fieldValues: ReadonlyArray<{ usageType: string; value: string | undefined }>
): Record<string, string> =>
  fieldValues.reduce<Record<string, string>>((accumulator, { usageType, value }) => {
    if (typeof value !== 'string' || value.length === 0) {
      return accumulator;
    }

    const matched = allTemplateTypes.find((value_) => value_ === usageType);

    return matched && !(matched in accumulator)
      ? { ...accumulator, [matched]: value }
      : accumulator;
  }, {});

/**
 * Reverse-compiles one field's per-type cell map into a unified body: when every configured type
 * shares identical content, returns it as a shared body (no `<If>` blocks); otherwise concatenates
 * a `<If type="T">…</If>` block per configured type (Generic first, then enum order), dropping the
 * shared body so per-type rows that *replace* rather than *add to* Generic are faithfully round-
 * tripped (the unified `<If>` model is shared-body-always + additive per-type blocks).
 */
const seedField = (byType: Record<string, string>): string => {
  const entries = Object.entries(byType).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0
  );

  if (entries.length === 0) {
    return '';
  }

  const values = entries.map(([, value]) => value);
  const allSame = values.every((value) => value === values[0]);

  if (allSame) {
    return values[0] ?? '';
  }

  // Generic first then the remaining enum order, so resolution on reopen reads naturally.
  const genericFirst = entries
    .filter(([type]) => type === TemplateType.Generic)
    .concat(entries.filter(([type]) => type !== TemplateType.Generic));

  return genericFirst.map(([type, value]) => `<If type="${type}">${value}</If>`).join('');
};

/**
 * Reverse-compiles a flat runtime translations dict into the unified per-language + per-type
 * shape. A namespaced `K__T` key maps to `unifiedTranslations[lang][K][T]`; a plain classic key maps
 * to `unifiedTranslations[lang][K]['Generic']`. Best-effort + intentionally lossy for keys that
 * collide with the `__` namespacing separator.
 */
const seedTranslations = (classicTranslations: CompiledTranslations): UnifiedTranslations =>
  Object.entries(classicTranslations).reduce<UnifiedTranslations>(
    (outerAccumulator, [languageTag, flatDict]) => {
      const langDict = Object.entries(flatDict).reduce<Record<string, PerTypeString>>(
        (langAccumulator, [flatKey, value]) => {
          const namespaced = splitNamespacedKey(flatKey);
          const baseKey = namespaced?.key ?? flatKey;
          const typeColumn = namespaced?.type ?? 'Generic';
          const existing: PerTypeString = langAccumulator[baseKey] ?? {};

          return { ...langAccumulator, [baseKey]: { ...existing, [typeColumn]: value } };
        },
        outerAccumulator[languageTag] ?? {}
      );

      return { ...outerAccumulator, [languageTag]: langDict };
    },
    {}
  );

/**
 * Best-effort reverse-compile of a connector's classic per-type `templates`/`deliveries` +
 * `translations` into the unified model, used when an admin toggles Classic → Unified so the
 * existing per-type content surfaces in the unified editor (instead of an empty template that would
 * clobber the classic data on the next compile).
 *
 * Per the minimal plan, the reverse-compile is best-effort + one-way-lossy for per-type
 * localization: namespaced `K__T` keys round-trip exactly, but a connector authored purely in
 * Classic (flat `translations` dict) loses its per-type dimension (every value is parked under
 * `Generic`). Variables are reset to empty (the admin re-defines them) — there is no classic
 * equivalent of the unified variables table.
 */
export const seedUnifiedFromClassic = (
  input: SeedUnifiedFromClassicInput,
  classicTranslations: CompiledTranslations
): SeedUnifiedFromClassicOutput => {
  if (input.kind === 'sms-ubill') {
    const byType = collectFieldByType(
      input.templates.map((row) => ({ usageType: row.usageType, value: row.content }))
    );

    return {
      template: { content: seedField(byType) },
      variables: {},
      translations: seedTranslations(classicTranslations),
    };
  }

  const byTypeSubject = collectFieldByType(
    Object.entries(input.deliveries).map(([usageType, row]) => ({ usageType, value: row.subject }))
  );
  // The classic deliveries `html` is the unified `content` body (see `fieldsForKind`).
  const byTypeContent = collectFieldByType(
    Object.entries(input.deliveries).map(([usageType, row]) => ({ usageType, value: row.html }))
  );
  const byTypeText = collectFieldByType(
    Object.entries(input.deliveries).map(([usageType, row]) => ({ usageType, value: row.text }))
  );

  const subject = seedField(byTypeSubject);
  const content = seedField(byTypeContent);
  const text = seedField(byTypeText);

  // Only carry subject/text when non-empty (matching the compiler's <If> + optional-field model);
  // built immutably via conditional spread.
  const template: UnifiedTemplate = {
    content: content || '',
    ...(subject ? { subject } : {}),
    ...(text ? { text } : {}),
  };

  return {
    template,
    variables: {},
    translations: seedTranslations(classicTranslations),
  };
};
