/* eslint-disable unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactModal from 'react-modal';

import Button from '@/ds-components/Button';
import DangerousRaw from '@/ds-components/DangerousRaw';
import FormField from '@/ds-components/FormField';
import ModalLayout from '@/ds-components/ModalLayout';
import TextInput from '@/ds-components/TextInput';
import modalStyles from '@/scss/modal.module.scss';

import styles from './SubjectSettingsModal.module.scss';
import { typeColumns } from './unified';

type Props = {
  readonly isOpen: boolean;
  readonly subjects: Record<string, string>;
  readonly onApply: (next: Record<string, string>) => void;
  readonly onRequestClose: () => void;
};

export default function SubjectSettingsModal({ isOpen, subjects, onApply, onRequestClose }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const [draft, setDraft] = useState<Record<string, string>>(() => subjects);

  const handleApply = () => {
    onApply(draft);
    onRequestClose();
  };

  const genericValue = draft.Generic ?? '';

  return (
    <ReactModal
      shouldCloseOnEsc
      isOpen={isOpen}
      className={modalStyles.content}
      overlayClassName={modalStyles.overlay}
      onRequestClose={onRequestClose}
    >
      <ModalLayout
        title={<DangerousRaw>{(t as any)('connector_details.email_templates.subject_settings') || 'Subject Settings'}</DangerousRaw>}
        footer={
          <>
            <Button type="default" title={<DangerousRaw>Cancel</DangerousRaw>} onClick={onRequestClose} />
            <Button type="primary" title={<DangerousRaw>Apply</DangerousRaw>} onClick={handleApply} />
          </>
        }
      >
        <div className={styles.modalContent}>
          <p className={styles.description}>
            Define localized template subjects by usage type. The "Generic" subject acts as the fallback default for all other types.
          </p>
          <div className={styles.grid}>
            <div className={styles.genericWrapper}>
              <FormField title={<DangerousRaw>Generic fallback subject</DangerousRaw>}>
                <TextInput
                  value={draft.Generic ?? ''}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((prev) => ({ ...prev, Generic: value }));
                  }}
                  placeholder="Enter fallback email subject..."
                />
              </FormField>
            </div>
            <hr className={styles.divider} />
            <div className={styles.perTypeGrid}>
              {typeColumns
                .filter((col) => col !== 'Generic')
                .map((col) => {
                  const val = draft[col] ?? '';
                  return (
                    <FormField key={col} title={<DangerousRaw>{`${col} subject`}</DangerousRaw>}>
                      <TextInput
                        value={val}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setDraft((prev) => ({ ...prev, [col]: value }));
                        }}
                        placeholder={genericValue || `Enter ${col} subject...`}
                        className={!val && genericValue ? styles.fallbackInput : undefined}
                      />
                    </FormField>
                  );
                })}
            </div>
          </div>
        </div>
      </ModalLayout>
    </ReactModal>
  );
}
/* eslint-enable */
