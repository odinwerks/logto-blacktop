import { TemplateType } from '@logto/connector-kit';
import { isLanguageTag } from '@logto/language-kit';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import CodeEditor from '@/ds-components/CodeEditor';
import FormField from '@/ds-components/FormField';
import Select, { type Option } from '@/ds-components/Select';
import TextInput from '@/ds-components/TextInput';
import Textarea from '@/ds-components/Textarea';

import styles from './index.module.scss';
import type {
  ConnectorKind,
  DummyPayload,
  TypeColumn,
  UnifiedTemplate,
  UnifiedTranslations,
  VariablesTable,
} from './unified';
import { parseIfBlocks, renderPreview, typeColumns } from './unified';

type Props = {
  readonly kind: ConnectorKind;
  readonly template: UnifiedTemplate;
  readonly onTemplateChange: (next: UnifiedTemplate) => void;
  readonly variables: VariablesTable;
  readonly translations: UnifiedTranslations;
  readonly dummyPayload: DummyPayload;
};

/**
 * The Template tab of the unified editor: one editor per localizable string field the Mailgun
 * connector compiles (`subject` + `html` via the `content` field + optional `text`), plus a
 * preview pane (usage-type + language selectors rendering the compiled body with dummy payload
 * data).
 *
 * Parse errors from {@link parseIfBlocks} (nested/unclosed/extra-attribute `<If>` blocks) surface as
 * a banner above the editors so the admin notices malformations before they leak into a sent
 * message (the lenient {@link resolveIfBlocks} used by the compiler leaves malformed blocks verbatim).
 */
function UnifiedTemplateTab({
  kind,
  template,
  onTemplateChange,
  variables,
  translations,
  dummyPayload,
}: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  const typeOptions = useMemo<Array<Option<TemplateType>>>(
    () =>
      typeColumns.map((column) => toTemplateType(column)).map((value) => ({ value, title: value })),
    []
  );

  const languageOptions = useMemo<Array<Option<string>>>(
    () =>
      Object.keys(translations)
        .filter((tag): tag is string => isLanguageTag(tag))
        .map((tag) => ({ value: tag, title: tag })),
    [translations]
  );

  const [previewType, setPreviewType] = useState<TemplateType>(TemplateType.Generic);
  const [previewLanguage, setPreviewLanguage] = useState<string>(languageOptions[0]?.value ?? 'en');

  const parseError = useMemo(() => {
    // Mailgun emits `subject` + `content` (the HTML body) + optional `text`.
    const fields: ReadonlyArray<keyof UnifiedTemplate> = ['subject', 'content', 'text'];

    for (const field of fields) {
      const value = template[field] ?? '';
      const result = parseIfBlocks(value);

      if (!result.success) {
        return result.errorKey;
      }
    }
  }, [template]);

  const preview = useMemo(
    () =>
      renderPreview(
        { kind, template, variables, translations },
        previewType,
        previewLanguage,
        dummyPayload
      ),
    [kind, template, variables, translations, previewType, previewLanguage, dummyPayload]
  );

  const updateField = (field: keyof UnifiedTemplate) => (value: string) => {
    onTemplateChange({ ...template, [field]: value });
  };

  return (
    <>
      {parseError ? (
        <div className={styles.parseError}>{t('connector_details.unified_editor.parse_error')}</div>
      ) : null}
      <FormField title="connector_details.email_templates.subject">
        <TextInput
          value={template.subject ?? ''}
          onChange={(event) => {
            updateField('subject')(event.currentTarget.value);
          }}
        />
      </FormField>
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
      <FormField title="connector_details.email_templates.text_version">
        <Textarea
          rows={4}
          value={template.text ?? ''}
          onChange={(event) => {
            updateField('text')(event.currentTarget.value);
          }}
        />
      </FormField>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t('connector_details.unified_editor.preview')}</h4>
        <div className={styles.modeToggleRow}>
          <FormField title="connector_details.unified_editor.preview_as_type">
            <Select
              size="medium"
              value={previewType}
              options={typeOptions}
              onChange={(value) => {
                if (value) {
                  setPreviewType(value);
                }
              }}
            />
          </FormField>
          <FormField title="connector_details.unified_editor.preview_language">
            <Select
              size="medium"
              value={previewLanguage}
              options={languageOptions}
              onChange={(value) => {
                if (value) {
                  setPreviewLanguage(value);
                }
              }}
            />
          </FormField>
        </div>
        {renderPreviewFields(preview)}
      </div>
    </>
  );
}

const toTemplateType = (column: TypeColumn): TemplateType =>
  Object.values(TemplateType).find((value) => value === column) ?? TemplateType.Generic;

const renderPreviewFields = (preview: {
  content?: string;
  subject?: string;
  html?: string;
  text?: string;
}) => {
  const entries = Object.entries(preview).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );

  if (entries.length === 0) {
    return null;
  }

  return entries.map(([field, value]) => (
    <div key={field} className={styles.previewField}>
      <span className={styles.previewFieldTitle}>{field}</span>
      <pre className={styles.previewOutput}>{value}</pre>
    </div>
  ));
};

export default UnifiedTemplateTab;
