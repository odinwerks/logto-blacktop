import { z } from 'zod';

/**
 * UsageType here is used to specify the use case of the template, can be either
 * 'Register', 'SignIn', 'ForgotPassword', 'Generic'.
 */
const requiredTemplateUsageTypes = ['Register', 'SignIn', 'ForgotPassword', 'Generic'];

const templateGuard = z.object({
  usageType: z.string(),
  templateAlias: z.string(),
});

export const postmarkConfigGuard = z.object({
  serverToken: z.string(),
  fromEmail: z.string(),
  templates: z.array(templateGuard).refine(
    (templates) =>
      requiredTemplateUsageTypes.every((requiredType) =>
        templates.map((template) => template.usageType).includes(requiredType)
      ),
    (templates) => ({
      message: `Template with UsageType (${requiredTemplateUsageTypes
        .filter(
          (requiredType) => !templates.map((template) => template.usageType).includes(requiredType)
        )
        .join(', ')}) should be provided!`,
    })
  ),
  /**
   * Per-language translation dictionary. Postmark templates are provider-stored aliases (no inline
   * `{{t.key}}` content), so this field has no runtime effect here and the inline editor's
   * translations grid stays empty. Kept for parity with the other email connectors + reserved for
   * future alias-side localization. Dev-flagged.
   */
  translations: z.record(z.record(z.string())).optional(),
});

export type PostmarkConfig = z.infer<typeof postmarkConfigGuard>;
