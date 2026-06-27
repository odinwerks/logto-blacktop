import type { EmailTemplate } from '@logto/schemas';
import useSWR, { mutate as globalMutate } from 'swr';

import type { RequestError } from './use-api';

/**
 * SWR cache key for the global email-templates Management API resource
 * (`GET /api/email-templates`). Reused by the cross-component `mutateEmailTemplates` helper and
 * by {@link useEmailTemplates}; module-local to avoid leaking the internal cache key.
 */
const emailTemplatesApiResource = 'api/email-templates';

/**
 * SWR hook for the tenant-wide email templates.
 *
 * The response shape (`EmailTemplate[]`) is not runtime-guarded here — this mirrors how the
 * sibling hooks (`useConfigs`, `useUiLanguages`) consume Management API resources: they rely on
 * the server-side guards (`EmailTemplates.guard` in `@logto/schemas`) for validation and keep the
 * client typing thin. Switching to a runtime guard would pull backend guards into the console,
 * which is intentionally avoided.
 */
const useEmailTemplates = () => {
  const { data, error, isLoading, mutate } = useSWR<EmailTemplate[], RequestError>(
    emailTemplatesApiResource
  );

  return { data, error, isLoading, mutate };
};

/**
 * Imperatively revalidate the email-templates cache from anywhere (e.g. after a `PUT`/`DELETE`
 * in a child component that does not own the {@link useEmailTemplates} instance). Uses SWR's
 * global `mutate` bound to the shared cache key.
 */
export const mutateEmailTemplates = async (): Promise<unknown> =>
  globalMutate(emailTemplatesApiResource);

export default useEmailTemplates;
