import type { LanguageTag } from '@logto/language-kit';
import { isLanguageTag } from '@logto/language-kit';
import { deduplicate } from '@silverhand/essentials';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import LocalizationEditor from '@/components/LocalizationEditor';
import useEmailTemplates from '@/hooks/use-email-templates';

import EmailTemplateLanguageDetails from './EmailTemplateLanguageDetails';
import styles from './index.module.scss';
import { groupTemplatesByLanguage } from './utils';

type Props = {
  readonly isOpen: boolean;
  readonly onClose: () => void;
};

/**
 * Email templates admin modal (Phase 2 of the email/SMS localization plan).
 *
 * Hosts the per-language editor inside the shared {@link LocalizationEditor} shell. Loads all
 * tenant templates via `GET /api/email-templates`, groups them by `languageTag`, and exposes each
 * language to the shell via `renderDetails`. Adding a language is a local-only registration — no
 * API call — because rows are lazily created on the first `PUT /api/email-templates` from the
 * per-language editor (`upsertMany`). Save/delete (and cache revalidation) are owned by
 * {@link EmailTemplateLanguageDetails}.
 *
 * The modal is rendered through React's portal (`react-modal`), so it never touches the connector
 * config form state on the underlying page.
 */
function EmailTemplatesEditor({ isOpen, onClose }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { data, isLoading } = useEmailTemplates();
  const [addedLanguages, setAddedLanguages] = useState<LanguageTag[]>([]);

  const grouped = useMemo(() => groupTemplatesByLanguage(data ?? []), [data]);

  // Languages present in the response plus any locally-added (not-yet-saved) languages, so the nav
  // can offer a freshly-added language immediately for editing.
  const languages = useMemo<LanguageTag[]>(
    () =>
      deduplicate([...Object.keys(grouped), ...addedLanguages])
        .filter((languageTag): languageTag is LanguageTag => isLanguageTag(languageTag))
        .slice()
        .sort(),
    [grouped, addedLanguages]
  );

  const onAddLanguage = useCallback((languageTag: LanguageTag) => {
    setAddedLanguages((previous) => deduplicate([...previous, languageTag]));
  }, []);

  const renderDetails = useCallback(
    (languageTag: LanguageTag) => {
      if (isLoading) {
        return <div className={styles.status}>{t('general.loading')}</div>;
      }

      if (languages.length === 0) {
        return (
          <div className={styles.status}>{t('connector_details.email_templates.empty_state')}</div>
        );
      }

      return (
        <EmailTemplateLanguageDetails
          key={languageTag}
          languageTag={languageTag}
          initialTemplates={grouped[languageTag] ?? {}}
          allLanguages={languages}
        />
      );
    },
    [isLoading, grouped, languages, t]
  );

  return (
    <LocalizationEditor
      isOpen={isOpen}
      languages={languages}
      titleKey="connector_details.email_templates.card_title"
      subtitleKey="connector_details.email_templates.description"
      renderDetails={renderDetails}
      onClose={onClose}
      onAddLanguage={onAddLanguage}
    />
  );
}

export default EmailTemplatesEditor;
