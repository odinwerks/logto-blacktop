import { type ConnectorConfigFormItem, TemplateType } from '@logto/connector-kit';
import { isLanguageTag } from '@logto/language-kit';
import { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import ReactModal from 'react-modal';

import Button from '@/ds-components/Button';
import CodeEditor from '@/ds-components/CodeEditor';
import DangerousRaw from '@/ds-components/DangerousRaw';
import FormField from '@/ds-components/FormField';
import ModalLayout from '@/ds-components/ModalLayout';
import Select, { type Option } from '@/ds-components/Select';
import TabNav, { TabNavItem } from '@/ds-components/TabNav';
import TextInput from '@/ds-components/TextInput';
import useApi from '@/hooks/use-api';
import { useConnectorFormConfigParser } from '@/hooks/use-connector-form-config-parser';
import modalStyles from '@/scss/modal.module.scss';
import type { ConnectorFormType } from '@/types/connector';

import styles from './PreviewTestModal.module.scss';
import type {
  ConnectorKind,
  DummyPayload,
  UnifiedTemplate,
  UnifiedTranslations,
  VariablesTable,
} from './unified';
import { renderPreview } from './unified';

type PreviewTestModalProps = {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly kind: ConnectorKind;
  readonly template: UnifiedTemplate;
  readonly variables: VariablesTable;
  readonly localizations: UnifiedTranslations;
  readonly subjects: Record<string, string>;
  readonly dummyPayload: DummyPayload;
  readonly connectorId?: string;
  readonly connectorFactoryId?: string;
  readonly formItems?: ConnectorConfigFormItem[];
};

export default function PreviewTestModal({
  isOpen,
  onClose,
  kind,
  template,
  variables,
  localizations,
  subjects,
  dummyPayload,
  connectorId,
  connectorFactoryId,
  formItems,
}: PreviewTestModalProps) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const [selectedTemplateType, setSelectedTemplateType] = useState<TemplateType>(
    TemplateType.Generic
  );

  // Dynamic languages populated from translations, falling back to 'en'
  const languageOptions = useMemo<Array<Option<string>>>(() => {
    const keys = Object.keys(localizations).filter((tag): tag is string => isLanguageTag(tag));
    if (keys.length === 0) {
      return [{ value: 'en', title: 'en' }];
    }
    return keys.map((tag) => ({ value: tag, title: tag }));
  }, [localizations]);

  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    languageOptions[0]?.value ?? 'en'
  );
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');
  const [testEmail, setTestEmail] = useState<string>('test@example.com');
  const [isSending, setIsSending] = useState(false);

  // Compile preview on-the-fly
  const preview = useMemo(
    () =>
      renderPreview(
        { kind, template, variables, translations: localizations, unifiedSubjects: subjects },
        selectedTemplateType,
        selectedLanguage,
        dummyPayload
      ),
    [
      kind,
      template,
      variables,
      localizations,
      subjects,
      selectedTemplateType,
      selectedLanguage,
      dummyPayload,
    ]
  );

  const compiledHTML = preview.content ?? '';
  const compiledSubject = preview.subject ?? '';

  // Clean the compiled HTML for the Raw Code view by stripping trailing whitespace per line,
  // collapsing runs of blank lines, and removing duplicate empty lines that sneak in from
  // the template compiler's indentation. Without this the code preview is peppered with 20+
  // stray blank lines that make it hard to read.
  const cleanCompiledHtml = useMemo(() => {
    return compiledHTML
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line, index, array) => !(line === '' && array[index - 1] === ''))
      .join('\n')
      .replaceAll(/\n{3,}/g, '\n\n');
  }, [compiledHTML]);

  // API Call & Hook triggers
  const api = useApi();
  const configParser = useConnectorFormConfigParser();
  const { watch } = useFormContext<ConnectorFormType>();

  const handleSendTest = async () => {
    if (!testEmail) {
      toast.error('Please enter a recipient email address');
      return;
    }
    const factoryId = connectorFactoryId ?? connectorId;
    if (!factoryId) {
      toast.error('Connector Factory ID is missing');
      return;
    }

    setIsSending(true);
    try {
      // Parse full form config using current form values and items
      const parsedConfig = configParser(watch(), formItems ?? []);

      const payload = {
        config: parsedConfig,
        templateType: selectedTemplateType,
        locale: selectedLanguage,
        email: testEmail,
      };

      await api.post(`api/connectors/${factoryId}/test`, { json: payload }).json();
      toast.success('Test message sent successfully!');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to send test message');
    } finally {
      setIsSending(false);
    }
  };

  const typeOptions = useMemo<Array<Option<TemplateType>>>(() => {
    return Object.values(TemplateType).map((value) => ({
      value,
      title: value,
    }));
  }, []);

  return (
    <ReactModal
      shouldCloseOnEsc
      isOpen={isOpen}
      className={styles.modalContent}
      overlayClassName={modalStyles.overlay}
      onRequestClose={onClose}
    >
      <ModalLayout
        size="large"
        title={<DangerousRaw>Preview & Test Template</DangerousRaw>}
        className={styles.layoutBody}
        footer={
          <div className={styles.testSendRow}>
            <div className={styles.emailInput}>
              <FormField title={<DangerousRaw>Recipient Email</DangerousRaw>}>
                <TextInput
                  value={testEmail}
                  placeholder="Enter test email..."
                  onChange={(event) => {
                    setTestEmail(event.currentTarget.value);
                  }}
                />
              </FormField>
            </div>
            <Button
              className={styles.sendButton}
              type="primary"
              title={<DangerousRaw>{isSending ? 'Sending...' : 'Send Test'}</DangerousRaw>}
              disabled={isSending}
              onClick={handleSendTest}
            />
            <Button
              className={styles.sendButton}
              type="default"
              title={<DangerousRaw>Close</DangerousRaw>}
              onClick={onClose}
            />
          </div>
        }
        onClose={onClose}
      >
        <div className={styles.controlsRow}>
          <FormField title={<DangerousRaw>Delivery Type</DangerousRaw>}>
            <Select
              size="medium"
              value={selectedTemplateType}
              options={typeOptions}
              onChange={(value) => {
                if (value) {
                  setSelectedTemplateType(value);
                }
              }}
            />
          </FormField>

          <FormField title={<DangerousRaw>Language</DangerousRaw>}>
            <Select
              size="medium"
              value={selectedLanguage}
              options={languageOptions}
              onChange={(value) => {
                if (value) {
                  setSelectedLanguage(value);
                }
              }}
            />
          </FormField>

          <div className={styles.viewModeToggle}>
            <TabNav>
              <TabNavItem
                isActive={viewMode === 'rendered'}
                onClick={() => {
                  setViewMode('rendered');
                }}
              >
                Rendered HTML
              </TabNavItem>
              <TabNavItem
                isActive={viewMode === 'raw'}
                onClick={() => {
                  setViewMode('raw');
                }}
              >
                Raw Code
              </TabNavItem>
            </TabNav>
          </div>
        </div>

        <div className={styles.subjectPreviewRow}>
          <span className={styles.subjectLabel}>Subject</span>
          <span className={styles.subjectText}>{compiledSubject || '(No Subject)'}</span>
        </div>

        <div className={styles.bodyArea}>
          {viewMode === 'rendered' ? (
            <div className={styles.iframeContainer}>
              <iframe
                className={styles.previewIframe}
                srcDoc={compiledHTML}
                sandbox="allow-same-origin"
                title="Template Preview"
              />
            </div>
          ) : (
            <CodeEditor
              isReadonly
              className={styles.codeEditor}
              language="html"
              value={cleanCompiledHtml}
            />
          )}
        </div>
      </ModalLayout>
    </ReactModal>
  );
}
