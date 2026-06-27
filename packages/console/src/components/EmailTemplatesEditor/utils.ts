import type { EmailTemplateDetails } from '@logto/connector-kit';
import { type EmailTemplate, TemplateType } from '@logto/schemas';

/**
 * All email template types exposed by the editor, in declaration order.
 *
 * `Object.values` enumerates the enum's string members (string enums carry no reverse mappings),
 * so this yields exactly the live `TemplateType` value set — the deprecated `VerificationCodeType`
 * is a separate enum and is therefore excluded.
 */
export const templateTypes = Object.values(TemplateType);

/** Content-type options offered by the editor (matches `EmailTemplateDetails['contentType']`). */
export const contentTypeOptions = ['text/html', 'text/plain'] as const;

/**
 * Human-readable label for a template-type tab, derived from the enum value
 * (e.g. `ForgotPassword` -> `Forgot Password`). Kept client-side because the tab strip lists
 * internal usage types rather than user-facing copy; localizing each would balloon the i18n
 * surface for no end-user benefit.
 */
export const formatTemplateTypeLabel = (type: TemplateType): string =>
  type.replaceAll(/([a-z])([A-Z])/gu, '$1 $2');

/** Default (empty) details for a freshly-added template; defaults to HTML content. */
export const createEmptyEmailTemplateDetails = (): EmailTemplateDetails => ({
  subject: '',
  content: '',
  contentType: 'text/html',
});

/**
 * Builds the editor's draft map from the persisted list returned by `GET /api/email-templates`,
 * keyed by `languageTag` then `templateType`. Missing combinations are intentionally absent from
 * the map — the editor seeds them with {@link createEmptyEmailTemplateDetails} on first access.
 */
export const groupTemplatesByLanguage = (
  templates: readonly EmailTemplate[]
): Record<string, Partial<Record<TemplateType, EmailTemplateDetails>>> =>
  templates.reduce<Record<string, Partial<Record<TemplateType, EmailTemplateDetails>>>>(
    (accumulator, { languageTag, templateType, details }) => ({
      ...accumulator,
      [languageTag]: {
        ...accumulator[languageTag],
        [templateType]: details,
      },
    }),
    {}
  );

/**
 * Whether a details entry has no meaningful content. Such entries are intentionally NOT sent on
 * `PUT /api/email-templates`, so the row stays absent and the runtime 3-level fallback
 * (`getI18nEmailTemplate` in `@logto/core`) resolves to the tenant default language instead of
 * delivering an empty subject/body. Note that `emailTemplateDetailsGuard` allows empty strings,
 * so this guard is stricter than the API contract on purpose.
 */
export const isDetailsEmpty = (details?: EmailTemplateDetails): boolean =>
  !details || details.subject.trim().length === 0 || details.content.trim().length === 0;

/**
 * Canonicalize an `EmailTemplateDetails` value for stable equality checks and API payloads.
 *
 * `react-hook-form` materializes `register`ed optional fields as empty strings once their inputs
 * mount, so a freshly-loaded template omitting `replyTo`/`sendFrom` would otherwise look "changed"
 * against its own seed. Normalizing drops empty/blank optional fields (so they are omitted from
 * JSON) and defaults a missing `contentType` to `'text/html'`, so the editor's dirty check flips
 * only on real edits and the API receives the minimal, meaningful payload.
 */
export const normalizeDetails = (details: EmailTemplateDetails): EmailTemplateDetails => ({
  subject: details.subject,
  content: details.content,
  contentType: details.contentType === 'text/plain' ? 'text/plain' : 'text/html',
  ...(details.replyTo ? { replyTo: details.replyTo } : {}),
  ...(details.sendFrom ? { sendFrom: details.sendFrom } : {}),
});
