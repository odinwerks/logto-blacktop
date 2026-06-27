import { emailTemplateDetailsGuard, type EmailTemplateDetails } from '@logto/connector-kit';
import { languages as uiLanguageNameMapping, type LanguageTag } from '@logto/language-kit';
import { TemplateType } from '@logto/schemas';
import { HTTPError, TimeoutError } from 'ky';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import Delete from '@/assets/icons/delete.svg?react';
import { LocalizationEditorContext } from '@/components/LocalizationEditor/use-localization-editor-context';
import Button from '@/ds-components/Button';
import ConfirmModal from '@/ds-components/ConfirmModal';
import IconButton from '@/ds-components/IconButton';
import TabNav, { TabNavItem } from '@/ds-components/TabNav';
import { Tooltip } from '@/ds-components/Tip';
import useApi from '@/hooks/use-api';
import { mutateEmailTemplates } from '@/hooks/use-email-templates';

import EmailTemplateDetailsForm from './EmailTemplateDetailsForm';
import styles from './EmailTemplateLanguageDetails.module.scss';
import FallbackIndicator from './FallbackIndicator';
import {
  createEmptyEmailTemplateDetails,
  formatTemplateTypeLabel,
  isDetailsEmpty,
  normalizeDetails,
  templateTypes,
} from './utils';

type Props = {
  readonly languageTag: LanguageTag;
  readonly initialTemplates: Partial<Record<TemplateType, EmailTemplateDetails>>;
  /** Language universe the host renders, used to pick a survivor after a language delete. */
  readonly allLanguages: LanguageTag[];
};

const seedDraft = (
  initial: Partial<Record<TemplateType, EmailTemplateDetails>>
): Record<TemplateType, EmailTemplateDetails> => ({
  [TemplateType.SignIn]: initial[TemplateType.SignIn] ?? createEmptyEmailTemplateDetails(),
  [TemplateType.Register]: initial[TemplateType.Register] ?? createEmptyEmailTemplateDetails(),
  [TemplateType.ForgotPassword]:
    initial[TemplateType.ForgotPassword] ?? createEmptyEmailTemplateDetails(),
  [TemplateType.OrganizationInvitation]:
    initial[TemplateType.OrganizationInvitation] ?? createEmptyEmailTemplateDetails(),
  [TemplateType.Generic]: initial[TemplateType.Generic] ?? createEmptyEmailTemplateDetails(),
  [TemplateType.UserPermissionValidation]:
    initial[TemplateType.UserPermissionValidation] ?? createEmptyEmailTemplateDetails(),
  [TemplateType.BindNewIdentifier]:
    initial[TemplateType.BindNewIdentifier] ?? createEmptyEmailTemplateDetails(),
  [TemplateType.MfaVerification]:
    initial[TemplateType.MfaVerification] ?? createEmptyEmailTemplateDetails(),
  [TemplateType.BindMfa]: initial[TemplateType.BindMfa] ?? createEmptyEmailTemplateDetails(),
});

/**
 * Editor body for one language: renders templateType tabs across {@link templateTypes}, keeps a
 * per-type draft so edits survive tab switches within the language, and persists the whole
 * language on Save via `PUT /api/email-templates` (only types with non-empty subject+content are
 * sent, so untouched types remain absent and the runtime fallback chain still applies).
 *
 * Dirty state is mirrored into the shared `LocalizationEditorContext` so the modal shell can guard
 * language switches / close with its unsaved-changes confirmation (mirrors the Sign-in Experience
 * `LanguageDetails`).
 */
function EmailTemplateLanguageDetails({ languageTag, initialTemplates, allLanguages }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const api = useApi();
  const { setIsDirty, setSelectedLanguage } = useContext(LocalizationEditorContext);

  const [draft, setDraft] = useState<Record<TemplateType, EmailTemplateDetails>>(() =>
    seedDraft(initialTemplates)
  );
  const [baseline, setBaseline] = useState<Record<TemplateType, EmailTemplateDetails>>(() =>
    seedDraft(initialTemplates)
  );
  const [activeType, setActiveType] = useState<TemplateType>(
    () =>
      templateTypes.find((type) => !isDetailsEmpty(initialTemplates[type])) ?? TemplateType.SignIn
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const activeDetails = draft[activeType];
  // Compare per-type normalized shapes so optional fields that RHF materializes as `''` on mount
  // (vs `undefined` in the seed) do not produce a false-positive dirty flag.
  const isDraftDirty = useMemo(
    () =>
      templateTypes.some(
        (type) =>
          JSON.stringify(normalizeDetails(draft[type])) !==
          JSON.stringify(normalizeDetails(baseline[type]))
      ),
    [draft, baseline]
  );

  useEffect(() => {
    setIsDirty(isDraftDirty);
  }, [isDraftDirty, setIsDirty]);

  const handleDetailsChange = useCallback(
    (details: EmailTemplateDetails) => {
      setDraft((previous) => ({ ...previous, [activeType]: details }));
    },
    [activeType]
  );

  // Only types with a parseable, non-empty subject + content are sent; the rest stay absent so the
  // runtime 3-level fallback can resolve them. Empty optional fields are stripped via normalization.
  const savableTemplates = useMemo(
    () =>
      templateTypes.flatMap((type) => {
        const result = emailTemplateDetailsGuard.safeParse(draft[type]);
        return result.success && !isDetailsEmpty(result.data)
          ? [{ languageTag, templateType: type, details: normalizeDetails(result.data) }]
          : [];
      }),
    [draft, languageTag]
  );

  const onSave = async () => {
    if (savableTemplates.length === 0) {
      return;
    }

    setIsSaving(true);
    try {
      await api.put('api/email-templates', { json: { templates: savableTemplates } });
      await mutateEmailTemplates();
      // Re-baseline against the just-saved snapshot so further edits are tracked correctly.
      setBaseline(draft);
      toast.success(t('general.saved'));
    } catch (error: unknown) {
      // `useApi` already surfaces Management API errors via toasts.
      if (error instanceof HTTPError || error instanceof TimeoutError) {
        return;
      }

      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const onConfirmDelete = async () => {
    setIsDeleteConfirmOpen(false);
    setIsDeleting(true);
    try {
      await api.delete('api/email-templates', { searchParams: { languageTag } });
      await mutateEmailTemplates();
      toast.success(t('general.deleted'));
      setIsDirty(false);
      setSelectedLanguage(allLanguages.find((tag) => tag !== languageTag) ?? 'en');
    } catch (error: unknown) {
      if (error instanceof HTTPError || error instanceof TimeoutError) {
        return;
      }

      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.languageDetails}>
      <div className={styles.header}>
        <div className={styles.languageInfo}>
          {uiLanguageNameMapping[languageTag]}
          <span className={styles.tag}>{languageTag}</span>
        </div>
        <Tooltip content={t('connector_details.email_templates.delete_language')}>
          <IconButton
            onClick={() => {
              setIsDeleteConfirmOpen(true);
            }}
          >
            <Delete />
          </IconButton>
        </Tooltip>
      </div>
      <TabNav className={styles.tabs}>
        {templateTypes.map((type) => (
          <TabNavItem
            key={type}
            isActive={type === activeType}
            onClick={() => {
              setActiveType(type);
            }}
          >
            {formatTemplateTypeLabel(type)}
          </TabNavItem>
        ))}
      </TabNav>
      <div className={styles.formContainer}>
        <EmailTemplateDetailsForm
          key={activeType}
          defaultValue={activeDetails}
          onChange={handleDetailsChange}
        />
        <FallbackIndicator languageTag={languageTag} isEmpty={isDetailsEmpty(activeDetails)} />
      </div>
      <div className={styles.footer}>
        <Button
          type="primary"
          title="connector_details.email_templates.save_language"
          isLoading={isSaving}
          disabled={savableTemplates.length === 0}
          onClick={onSave}
        />
      </div>
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        isLoading={isDeleting}
        confirmButtonType="danger"
        confirmButtonText="general.delete"
        onCancel={() => {
          setIsDeleteConfirmOpen(false);
        }}
        onConfirm={onConfirmDelete}
      >
        {t('connector_details.email_templates.delete_language_confirmation')}
      </ConfirmModal>
    </div>
  );
}

export default EmailTemplateLanguageDetails;
