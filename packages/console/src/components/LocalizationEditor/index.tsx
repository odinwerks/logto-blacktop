import type { LanguageTag } from '@logto/language-kit';
import type { AdminConsoleKey } from '@logto/phrases';
import type { ReactNode } from 'react';
import { useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from 'react-modal';

import Close from '@/assets/icons/close.svg?react';
import Card from '@/ds-components/Card';
import CardTitle from '@/ds-components/CardTitle';
import ConfirmModal from '@/ds-components/ConfirmModal';
import IconButton from '@/ds-components/IconButton';

import LocalizationNav from './LocalizationNav';
import styles from './index.module.scss';
import useLocalizationEditorContext, {
  LocalizationEditorContext,
} from './use-localization-editor-context';

type Props = {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Languages currently present/editable in this editor (e.g. languages that already have a template). */
  readonly languages: LanguageTag[];
  /** Optional add-language handler. When omitted, the add-language control is hidden. */
  readonly onAddLanguage?: (languageTag: LanguageTag) => void | Promise<void>;
  readonly titleKey: AdminConsoleKey;
  readonly subtitleKey?: AdminConsoleKey;
  /** Renders the per-language editor body for the currently selected language. */
  readonly renderDetails: (selectedLanguage: LanguageTag) => ReactNode;
};

function LocalizationEditorModal({
  isOpen,
  onClose,
  languages,
  onAddLanguage,
  titleKey,
  subtitleKey,
  renderDetails,
}: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  const defaultSelectedLanguage = languages[0] ?? 'en';

  const {
    selectedLanguage,
    preSelectedLanguage,
    preAddedLanguage,
    isDirty,
    confirmationState,
    setSelectedLanguage,
    setPreSelectedLanguage,
    setPreAddedLanguage,
    setConfirmationState,
    setIsDirty,
  } = useContext(LocalizationEditorContext);

  useEffect(() => {
    setSelectedLanguage(defaultSelectedLanguage);
  }, [defaultSelectedLanguage, setSelectedLanguage]);

  const onCloseModal = () => {
    if (isDirty) {
      setConfirmationState('try-close');

      return;
    }

    onClose();
    setSelectedLanguage(languages[0] ?? 'en');
  };

  const onConfirmUnsavedChanges = async () => {
    if (confirmationState === 'try-close') {
      onClose();
    }

    if (confirmationState === 'try-switch-language' && preSelectedLanguage) {
      setSelectedLanguage(preSelectedLanguage);
      setPreSelectedLanguage(undefined);
    }

    if (confirmationState === 'try-add-language' && preAddedLanguage) {
      await onAddLanguage?.(preAddedLanguage);
      setSelectedLanguage(preAddedLanguage);
      setPreAddedLanguage(undefined);
    }

    setConfirmationState('none');
    setIsDirty(false);
  };

  return (
    <Modal
      shouldCloseOnEsc
      isOpen={isOpen}
      className={styles.modalContent}
      overlayClassName={styles.modalOverlay}
      onRequestClose={onCloseModal}
    >
      <Card className={styles.editor}>
        <div className={styles.header}>
          <CardTitle title={titleKey} subtitle={subtitleKey} />
          <IconButton onClick={onCloseModal}>
            <Close />
          </IconButton>
        </div>
        <div className={styles.content}>
          <LocalizationNav languages={languages} onSelectAdd={onAddLanguage} />
          {renderDetails(selectedLanguage)}
        </div>
      </Card>
      <ConfirmModal
        isOpen={confirmationState !== 'none'}
        cancelButtonText="general.stay_on_page"
        confirmButtonText="general.leave_page"
        onCancel={() => {
          setConfirmationState('none');
        }}
        onConfirm={onConfirmUnsavedChanges}
      >
        {t('general.unsaved_changes_warning')}
      </ConfirmModal>
    </Modal>
  );
}

function LocalizationEditor(props: Props) {
  const { context, Provider: LocalizationEditorContextProvider } = useLocalizationEditorContext();

  return (
    <LocalizationEditorContextProvider value={context}>
      <LocalizationEditorModal {...props} />
    </LocalizationEditorContextProvider>
  );
}

export default LocalizationEditor;
