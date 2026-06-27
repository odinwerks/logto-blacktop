import type { LanguageTag } from '@logto/language-kit';
import { languages as uiLanguageNameMapping } from '@logto/language-kit';
import type { SignInExperience } from '@logto/schemas';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import type { RequestError } from '@/hooks/use-api';

import styles from './FallbackIndicator.module.scss';

type Props = {
  readonly languageTag: LanguageTag;
  /** Whether the currently edited `(languageTag, templateType)` details are empty. */
  readonly isEmpty: boolean;
};

/**
 * Informational hint shown when the current template is empty and a different tenant fallback
 * language applies. Resolves the fallback language tag from the sign-in experience (mirroring the
 * runtime `getI18nEmailTemplate` chain's `fallbackLanguage` step) and renders its display name.
 *
 * No actions are offered — the indicator only communicates where an empty template resolves.
 */
function FallbackIndicator({ languageTag, isEmpty }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { data: signInExperience } = useSWR<SignInExperience, RequestError>('api/sign-in-exp');
  const fallbackLanguage = signInExperience?.languageInfo.fallbackLanguage;

  // Hide when there is content, when the fallback language is unknown, or when the edited
  // language already *is* the fallback language (no cross-language fallback applies).
  if (!isEmpty || !fallbackLanguage || fallbackLanguage === languageTag) {
    return null;
  }

  return (
    <div className={styles.fallbackHint}>
      {t('connector_details.email_templates.fallback_hint', {
        language: uiLanguageNameMapping[fallbackLanguage],
      })}
    </div>
  );
}

export default FallbackIndicator;
