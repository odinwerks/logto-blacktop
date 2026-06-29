import { z } from 'zod';

type CommonEmailConfig = {
  /** Subject of the message. */
  subject?: string;
  /** The email address for recipients to reply to. */
  replyTo?: string;
};

/** The data to send a regular message (email). */
type RawEmailConfig = CommonEmailConfig & {
  /** HTML version of the message. */
  html: string;
  /** Text version of the message. */
  text?: string;
};

/** The data to send a template message (email). */
type TemplateEmailConfig = CommonEmailConfig & {
  /** The template name. */
  template: string;
  /** The template variables. */
  variables?: Record<string, unknown>;
};

/** Config object fot a specific template type. */
export type DeliveryConfig = RawEmailConfig | TemplateEmailConfig;

const templateConfigGuard = z.union([
  z.object({
    html: z.string(),
    text: z.string().optional(),
    subject: z.string().optional(),
    replyTo: z.string().optional(),
  }),
  z.object({
    template: z.string(),
    variables: z.record(z.unknown()).optional(),
    subject: z.string().optional(),
    replyTo: z.string().optional(),
  }),
]) satisfies z.ZodType<DeliveryConfig>;

export type MailgunConfig = {
  /** Mailgun endpoint. For EU region, use `https://api.eu.mailgun.net`. */
  endpoint?: string;
  /** Mailgun domain. */
  domain: string;
  /** Mailgun API key. */
  apiKey: string;
  /** The sender of the email, in the form `Sender Name <me@samples.mailgun.org>`. */
  from: string;
  /**
   * The template config object for each template type, while the key is the template type
   * and the value is the config object.
   */
  deliveries: Record<string, DeliveryConfig>;
  /**
   * Per-language translation dictionary consumed by `getLocalizedPayload` to resolve `{{t.key}}`
   * placeholders in `deliveries` (subject/html/text) at send time. A back-compatible no-op when
   * absent/empty. Reachable only under the dev feature flag.
   */
  translations?: Record<string, Record<string, string>>;
  /**
   * Unified template editor (dev-flagged, console-only) source fields. Consumed only by the admin
   * console's Unified editor; `sendMessage` never reads them. The console compiles them into the
   * runtime `deliveries` + `translations` shapes on save.
   */
  unifiedTemplate?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  unifiedTranslations?: Record<string, unknown>;
  templateEditorMode?: string;
};

export const mailgunConfigGuard = z.object({
  endpoint: z.string().url().endsWith('.mailgun.net').optional(),
  domain: z.string(),
  apiKey: z.string(),
  from: z.string(),
  deliveries: z.record(templateConfigGuard),
  translations: z.record(z.record(z.string())).optional(),
  // Unified template editor (dev-flagged, console-only) source fields — explicit allowance so the
  // PATCH is not stripped by Zod's default-key behavior. `sendMessage` never reads them; the
  // console compiles them into `deliveries` + `translations` on save.
  unifiedTemplate: z.record(z.unknown()).optional(),
  variables: z.record(z.unknown()).optional(),
  unifiedTranslations: z.record(z.unknown()).optional(),
  templateEditorMode: z.string().optional(),
}) satisfies z.ZodType<MailgunConfig>;
