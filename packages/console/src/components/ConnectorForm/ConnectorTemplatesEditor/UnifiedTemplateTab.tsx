/* eslint-disable unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import { type ConnectorConfigFormItem } from '@logto/connector-kit';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import EditIcon from '@/assets/icons/edit.svg?react';
import Button from '@/ds-components/Button';
import CodeEditor from '@/ds-components/CodeEditor';
import DangerousRaw from '@/ds-components/DangerousRaw';
import FormField from '@/ds-components/FormField';
import Textarea from '@/ds-components/Textarea';

import styles from './index.module.scss';
import PreviewTestModal from './PreviewTestModal';
import SubjectSettingsModal from './SubjectSettingsModal';
import type {
  ConnectorKind,
  DummyPayload,
  UnifiedTemplate,
  UnifiedTranslations,
  VariablesTable,
} from './unified';
import { parseIfBlocks } from './unified';

type Props = {
  readonly kind: ConnectorKind;
  readonly template: UnifiedTemplate;
  readonly onTemplateChange: (next: UnifiedTemplate) => void;
  readonly variables: VariablesTable;
  readonly translations: UnifiedTranslations;
  readonly dummyPayload: DummyPayload;
  readonly unifiedSubjects: Record<string, string>;
  readonly onUnifiedSubjectsChange: (next: Record<string, string>) => void;
  readonly connectorFactoryId?: string;
  readonly formItems?: ConnectorConfigFormItem[];
};

/**
 * The Template tab of the unified editor: one editor per localizable string field the Mailgun
 * connector compiles (`subject` + `html` via the `content` field + optional `text`).
 *
 * It features a toolbar with buttons to "Localize Subjects" and "Preview & Test" to open
 * the beautifully rendered floating Sandbox iframe-based PreviewTestModal.
 */
function UnifiedTemplateTab({
  kind,
  template,
  onTemplateChange,
  variables,
  translations,
  dummyPayload,
  unifiedSubjects,
  onUnifiedSubjectsChange,
  connectorFactoryId,
  formItems,
}: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const parseError = useMemo(() => {
    // Content only
    const fields: ReadonlyArray<keyof UnifiedTemplate> = ['content'];

    for (const field of fields) {
      const value = template[field] ?? '';
      const result = parseIfBlocks(value);

      if (!result.success) {
        return result.errorKey;
      }
    }
  }, [template]);

  const updateField = (field: keyof UnifiedTemplate) => (value: string) => {
    onTemplateChange({ ...template, [field]: value });
  };

  return (
    <>
      {parseError ? (
        <div className={styles.parseError}>{t('connector_details.unified_editor.parse_error')}</div>
      ) : null}
      <div className={styles.premiumGrid}>
        {/* Full-Width Bento Editor Card */}
        <div className={styles.bentoCard}>
          <div className={styles.toolbarRow}>
            <span className={styles.toolbarTitle}>Template Editor</span>
            <div className={styles.toolbarActions}>
              <Button
                type="outline"
                size="medium"
                icon={<EditIcon />}
                title={<DangerousRaw>Configure Subjects</DangerousRaw>}
                onClick={() => setIsSubjectModalOpen(true)}
              />
              <Button
                type="primary"
                size="medium"
                title={<DangerousRaw>Preview & Test</DangerousRaw>}
                onClick={() => setIsPreviewModalOpen(true)}
              />
            </div>
          </div>
          <FormField title="connector_details.email_templates.content">
            <CodeEditor
              className={styles.contentEditor}
              language="html"
              value={template.content ?? ''}
              shouldWrap={false}
              onChange={(value) => {
                updateField('content')(value);
              }}
            />
          </FormField>
        </div>
      </div>

      <SubjectSettingsModal
        isOpen={isSubjectModalOpen}
        subjects={unifiedSubjects}
        onApply={onUnifiedSubjectsChange}
        onRequestClose={() => setIsSubjectModalOpen(false)}
      />

      <PreviewTestModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        kind={kind}
        template={template}
        variables={variables}
        localizations={translations}
        subjects={unifiedSubjects}
        dummyPayload={dummyPayload}
        connectorFactoryId={connectorFactoryId}
        formItems={formItems}
      />
    </>
  );
}

export default UnifiedTemplateTab;
/* eslint-enable */
