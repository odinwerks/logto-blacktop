import classNames from 'classnames';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import CodeEditor from '@/ds-components/CodeEditor';
import FormField from '@/ds-components/FormField';
import TextInput from '@/ds-components/TextInput';
import Textarea from '@/ds-components/Textarea';

import styles from './index.module.scss';

type Props = {
  readonly usageType: string;
  /** Current `subject` value (empty string when the usage type has no subject). */
  readonly subject: string;
  /** Current `html` value (empty string for the provider-template variant). */
  readonly html: string;
  /** Current `text` value (empty string when the usage type has no plain-text part). */
  readonly text: string;
  /** Whether this usage type uses a provider-stored template (only `subject` is editable). */
  readonly isTemplateVariant: boolean;
  readonly showSubject: boolean;
  readonly showText: boolean;
  readonly onSubjectChange: (usageType: string, subject: string) => void;
  readonly onHtmlChange: (usageType: string, html: string) => void;
  readonly onTextChange: (usageType: string, text: string) => void;
};

/**
 * Memoized per-`usageType` row for Mailgun `deliveries` (a `Record<usageType, RawEmailConfig |
 * TemplateEmailConfig>`). Only the localizable string fields are editable: `subject` (when present),
 * `html` (a `CodeEditor`) and `text` (raw variant only). Provider-stored `template`/`variables`
 * (template variant) are left untouched on write-back, with an explanatory hint.
 */
const DeliveryTemplateRow = memo(
  ({
    usageType,
    subject,
    html,
    text,
    isTemplateVariant,
    showSubject,
    showText,
    onSubjectChange,
    onHtmlChange,
    onTextChange,
  }: Props) => {
    const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

    return (
      <div className={styles.templateRow}>
        <div className={styles.templateRowHeader}>
          <span className={styles.usageType}>{usageType}</span>
          <div className={styles.headerDivider} />
        </div>
        <div className={styles.fieldsGroup}>
          {showSubject && (
            <FormField
              isRequired
              className={classNames(styles.subjectField, styles.fieldInRow)}
              title="connector_details.email_templates.subject"
            >
              <TextInput
                value={subject}
                placeholder={t('connector_details.template_editor.subject_placeholder')}
                onChange={(event) => {
                  onSubjectChange(usageType, event.currentTarget.value);
                }}
              />
            </FormField>
          )}
          {isTemplateVariant ? (
            <div className={styles.note}>
              {t('connector_details.template_editor.provider_template_hint')}
            </div>
          ) : (
            <>
              <FormField
                isRequired
                className={styles.fieldInRow}
                title="connector_details.email_templates.content"
              >
                <CodeEditor
                  className={styles.contentEditor}
                  language="html"
                  value={html}
                  shouldWrap={false}
                  placeholder={t('connector_details.template_editor.content_placeholder')}
                  onChange={(value) => {
                    onHtmlChange(usageType, value);
                  }}
                />
              </FormField>
              {showText && (
                <FormField
                  className={styles.fieldInRow}
                  title="connector_details.email_templates.text_version"
                >
                  <Textarea
                    rows={2}
                    className={styles.translationValue}
                    value={text}
                    onChange={(event) => {
                      onTextChange(usageType, event.currentTarget.value);
                    }}
                  />
                </FormField>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
);

export default DeliveryTemplateRow;
