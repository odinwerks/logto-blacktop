import { TemplateType } from '@logto/connector-kit';

/**
 * The editor mode for the ConnectorTemplatesEditor host. Persisted to the defensive
 * `formConfig.templateEditorMode` JSON field so a connector remembers its last-used surface across
 * saves/reloads. The host reads it (defaulting to `'classic'` when absent) to decide whether to
 * render the classic per-type rows or the {@link UnifiedTemplateEditor}.
 *
 * Gated behind `isDevFeaturesEnabled` + an allowlist of connector factory ids (Ubill-SMS +
 * Mailgun); every other connector stays on `'classic'` regardless.
 */
export type TemplateEditorMode = 'classic' | 'unified';

/**
 * The per-type column key set the unified model addresses. `Generic` is the fallback column: when
 * a specific {@link TemplateType} value is absent for a variable/localization key, the compiler
 * (and preview) resolve to the `Generic` value.
 *
 * `'Generic'` is a literal member of the {@link TemplateType} enum already (`TemplateType.Generic`),
 * so this union is nominally `TemplateType`; the explicit `| 'Generic'` documents the fallback
 * column's role and keeps the column-list construction type-stable.
 */
export type TypeColumn = TemplateType | 'Generic';

/**
 * A per-type record: each {@link TypeColumn} (usage-type string) maps to its own string value.
 * `Generic` is the fallback. Used for both variables (compile-time, connector-scoped) and
 * per-language localized values (runtime-resolved via the namespaced `{{t.K__T}}` rewrite).
 *
 * Typed with a loose string index (matching the sibling `TranslationMap` convention) rather than a
 * `Partial<Record<TypeColumn, string>>` mapped type: mixing the string enum `TemplateType` with the
 * `'Generic'` literal in a `Record` key set produces a mapped type whose keys TS cannot index with a
 * runtime `TemplateType` variable (an enum-nominality limitation). The column set is still
 * validated at the UI edge via the {@link typeColumns} const.
 */
export type PerTypeString = Partial<Record<string, string>>;

/**
 * Which connector the unified compiler is targeting. Drives the compiled row shape and which
 * localizable string fields the unified template carries.
 *
 * - `'sms-ubill'` — Ubill-SMS. The unified template carries a single `content` field; the compiler
 *   emits `templates: Array<{ usageType, content }>`.
 * - `'email-mailgun'` — Mailgun. The unified template carries `subject`, `html`, and an optional
 *   `text` field; the compiler emits `deliveries: Record<usageType, { subject?, html, text? }>`.
 */
export type ConnectorKind = 'sms-ubill' | 'email-mailgun';

/**
 * The single canonical unified template body for a connector. Carries optional `<If type="…">`
 * blocks that the compiler expands into per-usageType rows. `{{var.X}}` placeholders are inlined
 * at compile time; `{{t.K}}` placeholders are rewritten to namespaced `{{t.K__T}}` keys so the
 * existing runtime resolver resolves per-type localizations with zero send-path changes.
 *
 * - SMS (Ubill): only `content` is used.
 * - Email (Mailgun): `subject`, `html`, and an optional `text` plain-text part are used.
 */
export type UnifiedTemplate = {
  /** SMS body (Ubill) or the email HTML body (Mailgun). */
  content?: string;
  /** Mailgun plain-text fallback part. */
  text?: string;
  /** Mailgun email subject. */
  subject?: string;
};

/**
 * The variable definition table. Compile-time, connector-scoped (not per-language). Each variable
 * key maps to a {@link PerTypeString}; the `Generic` column is the fallback.
 *
 * `{{var.appName}}` in a unified body resolves at compile time for the target type `T` to
 * `variables['appName']?.[T] ?? variables['appName']?.['Generic'] ?? ''` (inlined literally into
 * the compiled row).
 */
export type VariablesTable = Record<string, PerTypeString>;

/**
 * The unified per-language + per-type localization table. Runtime-resolved via the namespacing
 * rewrite: for target type `T`, key `K`, locale `L`, the compiler emits
 * `translations[L][`${K}__${T}`] = unifiedTranslations[L]?.[K]?.[T] ?? unifiedTranslations[L]?.[K]?.['Generic'] ?? ''`,
 * and the compiled row's `{{t.K}}` is rewritten to `{{t.K__T}}`, which the existing runtime
 * `replaceSendMessageHandlebars` resolver reads as a single dot-free key under `payload.t`.
 *
 * Keyed by language tag at the top level (kept as `string` to round-trip arbitrary tags the way the
 * sibling `translations` field does; values are validated as language tags only at the editor/UI
 * edge).
 */
export type UnifiedTranslations = Record<string, Record<string, PerTypeString>>;

/** The connector factory ids whose connectors gain the Unified editor toggle. */
export const unifiedConnectorFactoryIds: ReadonlySet<string> = new Set([
  'ubill-sms',
  'mailgun-email',
]);

/** The ordered column set rendered in the Variables / Localizations per-type tables. */
export const typeColumns: readonly TypeColumn[] = [
  'Generic',
  ...Object.values(TemplateType).filter((value) => value !== TemplateType.Generic),
];

/** A compiled Ubill-SMS templates row, matching the connector's existing `templates` shape. */
export type SmsCompiledRow = { readonly usageType: TemplateType; readonly content: string };

/** A compiled Mailgun deliveries row, matching the connector's existing `deliveries` shape. */
export type EmailCompiledRow = {
  readonly subject?: string;
  readonly html: string;
  readonly text?: string;
};

/**
 * The compiled rows emitted by {@link compileUnified} — a discriminated union on {@link ConnectorKind}
 * so the host writes back the exact shape the connector already consumes (`templates[]` for SMS,
 * `deliveries{}` for Mailgun).
 */
export type CompiledRows =
  | { readonly kind: 'sms-ubill'; readonly templates: SmsCompiledRow[] }
  | { readonly kind: 'email-mailgun'; readonly deliveries: Record<string, EmailCompiledRow> };

/** The flat runtime translations dictionary: `Record<LanguageTag, Record<TranslationKey, string>>`. */
export type CompiledTranslations = Record<string, Record<string, string>>;

/** Input to {@link compileUnified}. */
export type CompileInput = {
  readonly kind: ConnectorKind;
  readonly template: UnifiedTemplate;
  readonly variables: VariablesTable;
  readonly translations: UnifiedTranslations;
};

/** Output of {@link compileUnified}: the compiled rows + the flat runtime translations dict. */
export type CompileOutput = {
  readonly rows: CompiledRows;
  readonly translations: CompiledTranslations;
};

/** The classic per-type rows a reverse-compile seeds the unified model from. */
export type SeedUnifiedFromClassicInput =
  | {
      readonly kind: 'sms-ubill';
      readonly templates: ReadonlyArray<{ usageType: string; content?: string }>;
    }
  | {
      readonly kind: 'email-mailgun';
      readonly deliveries: Record<string, { subject?: string; html?: string; text?: string }>;
    };

/** Output of {@link seedUnifiedFromClassic}: the best-effort unified model template + (empty) variables + per-type-reconstructed translations. */
export type SeedUnifiedFromClassicOutput = {
  readonly template: UnifiedTemplate;
  readonly variables: VariablesTable;
  readonly translations: UnifiedTranslations;
};

/**
 * A rendered preview body: each present localizable string field rendered with dummy data, keyed
 * by field name. Loosely keyed (matching {@link PerTypeString}) so the preview loop can assign
 * each present field without a cast.
 */
export type RenderedPreview = Record<string, string>;

/** The hardcoded dummy runtime payload used by the preview (per task spec §6). */
export type DummyPayload = {
  readonly code: string;
  readonly email: string;
  readonly phone: string;
};

/** Input to {@link renderPreview}. */
export type PreviewInput = CompileInput;

/**
 * A parsed segment of a unified body: either literal text outside any `<If>` block, or an
 * `<If type="X">…</If>` block carrying its (raw, case-insensitive) type literal and inner text.
 */
export type IfSegment =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'if'; readonly type: string; readonly text: string };

/**
 * The structured error keys the If-parser surfaces to the UI (banner). Unknown type literals are
 * NOT an error — the resolver drops the block (see {@link resolveIfBlocks}); only structural
 * malformations (nesting, extra attributes, unclosed/empty type) are surfaced.
 */
export type IfErrorKey = 'if_unclosed' | 'if_nested' | 'if_invalid_attr' | 'if_empty_type';

/** Result of parsing a unified body into segments. */
export type ParseIfResult =
  | { readonly success: true; readonly segments: readonly IfSegment[] }
  | { readonly success: false; readonly errorKey: IfErrorKey };
