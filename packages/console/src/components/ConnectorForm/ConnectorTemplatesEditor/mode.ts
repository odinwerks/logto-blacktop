import { ConnectorType } from '@logto/connector-kit';

/**
 * Editor mode for a connector's `templates`/`deliveries` form item. Derived from the connector
 * type + the form-item key + the row shape, so callers only pass `connectorType` + `formItem`.
 *
 * - `sms` — uniform `{ usageType, content }[]` (every SMS connector).
 * - `email-content` — common email shape `{ usageType, subject, content, contentType?|type? }[]`
 *   (SMTP, SendGrid, AWS-SES, Aliyun-DM, MailJunky).
 * - `email-alias` — provider-stored aliases `{ usageType, templateAlias }[]` (Postmark). There is
 *   no inline `{{t.key}}` content to localize here, so the translations grid stays empty.
 * - `email-deliveries` — Mailgun's `deliveries` record `Record<usageType, DeliveryConfig>` (a union
 *   of raw `html`/`text` and provider-template variants).
 */
export type ConnectorTemplateMode = 'sms' | 'email-content' | 'email-alias' | 'email-deliveries';

/**
 * Keys of the string fields whose `{{t.key}}` placeholders feed the per-language translations grid
 * for a given mode. Used by {@link extractTranslationKeys} (defaulting to `['content']` for SMS so
 * existing callers/tests are unchanged).
 */
export const extractableFieldsFor = (mode: ConnectorTemplateMode): readonly string[] => {
  switch (mode) {
    case 'sms': {
      return ['content'];
    }
    case 'email-content': {
      return ['subject', 'content'];
    }
    case 'email-deliveries': {
      return ['subject', 'html', 'text'];
    }
    case 'email-alias': {
      return [];
    }
  }
};

/**
 * Whether a template row counts as "filled" — i.e. the user has entered content into at least one
 * of its editable, localizable string fields. The host uses this to sort filled templates above
 * empty ones and to park `Generic` between the filled and empty buckets (see the host's
 * `sortTemplatesByFillStatus`).
 *
 * Mode-aware: only the row's real editable fields are considered, so a synthetic empty row — which
 * may carry a default `contentType`/`type` but no `content`/`subject` — is never mistaken for
 * filled. The alias mode has no `{{t.key}}` fields, so its `templateAlias` is checked directly.
 */
export const isTemplateFilled = (
  row: { usageType: string } & Record<string, unknown>,
  mode: ConnectorTemplateMode
): boolean => {
  const fields = mode === 'email-alias' ? ['templateAlias'] : extractableFieldsFor(mode);

  return fields.some((field) => {
    const value = row[field];

    return typeof value === 'string' && value.length > 0;
  });
};

type TemplateRow = {
  usageType: string;
  templateAlias?: unknown;
} & Record<string, unknown>;

/**
 * Derives the editor mode from the connector type, the form-item key, and the parsed template rows.
 *
 * Mode selection:
 * - `Sms` connector → `'sms'`.
 * - `Email` connector + form-item key `deliveries` → `'email-deliveries'` (Mailgun).
 * - `Email` connector + a row carrying a string `templateAlias` → `'email-alias'` (Postmark).
 * - otherwise `Email` → `'email-content'` (the common shape).
 *
 * The editor only mounts for SMS/email connectors (see `ConfigFormFields`), so other connector
 * types are routed to the email-content renderer as a safe default rather than throwing.
 */
export const deriveEditorMode = (
  connectorType: ConnectorType,
  formItemKey: string,
  templates: readonly TemplateRow[]
): ConnectorTemplateMode => {
  if (connectorType === ConnectorType.Sms) {
    return 'sms';
  }

  if (connectorType !== ConnectorType.Email) {
    // The editor only mounts for SMS/email connectors (see `ConfigFormFields`); route anything
    // else to the common email-content renderer as a safe default rather than throwing.
    return 'email-content';
  }

  if (formItemKey === 'deliveries') {
    return 'email-deliveries';
  }

  if (typeof templates[0]?.templateAlias === 'string') {
    return 'email-alias';
  }

  return 'email-content';
};

/**
 * Detects which row key carries the email content-type selector (`'contentType'` for SMTP,
 * `'type'` for SendGrid/MailJunky). Returns `undefined` when the connector's templates have no
 * content-type field (AWS-SES, Aliyun-DM), in which case no selector is rendered.
 */
export const contentTypeKeyFor = (
  row: Record<string, unknown> | undefined
): 'contentType' | 'type' | undefined => {
  if (!row) {
    return undefined;
  }

  if (typeof row.contentType === 'string') {
    return 'contentType';
  }

  if (typeof row.type === 'string') {
    return 'type';
  }

  return undefined;
};

/**
 * Builds a provider-appropriate empty template row for a usage type that the connector's config
 * does not yet define. The shape matches what {@link deriveEditorMode} resolved for the connector
 * (SMS, common email, email alias, or Mailgun `deliveries`) so the auto-detected rows render with
 * the same editable fields as existing ones.
 *
 * - `sms` — `{ usageType, content }`.
 * - `email-content` — `{ usageType, subject, content }`, plus the connector's content-type key
 *   (defaulting to `'text/html'`) when `contentTypeKey` is defined so the row is consistent with the
 *   connector's existing rows (SMTP/SendGrid). AWS-SES/Aliyun-DM (`contentTypeKey === undefined`)
 *   get no content-type field.
 * - `email-alias` — `{ usageType, templateAlias }`.
 * - `email-deliveries` — `{ usageType, subject, html }` (no `text` until the user opts into a
 *   plain-text part, matching the row's `showText` gating).
 *
 * Synthetic rows are display-only until a field is edited (see the host write-back).
 */
export const buildEmptyTemplateRow = (
  usageType: string,
  mode: ConnectorTemplateMode,
  contentTypeKey?: 'contentType' | 'type'
): TemplateRow => {
  switch (mode) {
    case 'sms': {
      return { usageType, content: '' };
    }
    case 'email-content': {
      const base: TemplateRow = { usageType, subject: '', content: '' };

      return contentTypeKey ? { ...base, [contentTypeKey]: 'text/html' } : base;
    }
    case 'email-alias': {
      return { usageType, templateAlias: '' };
    }
    case 'email-deliveries': {
      return { usageType, subject: '', html: '' };
    }
  }
};
