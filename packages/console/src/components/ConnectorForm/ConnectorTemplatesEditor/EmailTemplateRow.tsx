import classNames from 'classnames';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import CodeEditor from '@/ds-components/CodeEditor';
import FormField from '@/ds-components/FormField';
import Select, { type Option } from '@/ds-components/Select';
import TextInput from '@/ds-components/TextInput';

import styles from './index.module.scss';

/** The two content-type values every email connector that has the field uses. */
export type EmailContentType = 'text/plain' | 'text/html';

const contentTypeSelectOptions: Array<Option<EmailContentType>> = [
  { value: 'text/plain', title: 'text/plain' },
  { value: 'text/html', title: 'text/html' },
];

type Props = {
  readonly usageType: string;
  readonly subject: string;
  readonly content: string;
  /** Current content-type value (host defaults to `'text/html'` when the row has none). */
  readonly contentType: EmailContentType;
  /** Which row key holds the content-type field, so the host writes the selector back to it. */
  readonly contentTypeKey: 'contentType' | 'type';
  /**
   * Whether the connector's templates carry a content-type field. `false` (AWS-SES / Aliyun-DM)
   * suppresses the selector.
   */
  readonly showContentType: boolean;
  readonly onSubjectChange: (usageType: string, subject: string) => void;
  readonly onContentChange: (usageType: string, content: string) => void;
  readonly onContentTypeChange: (
    usageType: string,
    key: 'contentType' | 'type',
    contentType: EmailContentType
  ) => void;
};

/**
 * Memoized per-`usageType` email template row for the common `{ subject, content, contentType?|type? }`
 * shape (SMTP, SendGrid, AWS-SES, Aliyun-DM, MailJunky). Renders a subject `TextInput`, an optional
 * content-type `Select` (only when the connector's templates carry a `contentType`/`type` field), and
 * a content `CodeEditor` (HTML highlighting, no line-number gutter for compactness). `Subject` is
 * email-only — SMS and alias rows do not render it.
 *
 * Only the edited row's props change on a given keystroke (the host threads stable `onXChange`
 * callbacks that read the latest form value via `getValues`), so the other rows skip re-rendering.
 */
const EmailTemplateRow = memo(
  ({
    usageType,
    subject,
    content,
    contentType,
    contentTypeKey,
    showContentType,
    onSubjectChange,
    onContentChange,
    onContentTypeChange,
  }: Props) => {
    const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

    return (
      <div className={styles.templateRow}>
        <div className={styles.templateRowHeader}>
          <span className={styles.usageType}>{usageType}</span>
          <div className={styles.headerDivider} />
        </div>
        <div className={styles.fieldsGroup}>
          <div className={styles.emailFieldGrid}>
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
            {showContentType && (
              <FormField
                className={classNames(styles.contentTypeField, styles.fieldInRow)}
                title="connector_details.email_templates.content_type"
              >
                <Select<EmailContentType>
                  value={contentType}
                  options={contentTypeSelectOptions}
                  onChange={(value) => {
                    if (value) {
                      onContentTypeChange(usageType, contentTypeKey, value);
                    }
                  }}
                />
              </FormField>
            )}
          </div>
          <FormField
            isRequired
            className={styles.fieldInRow}
            title="connector_details.email_templates.content"
          >
            <CodeEditor
              className={styles.contentEditor}
              language="html"
              value={content}
              placeholder={t('connector_details.template_editor.content_placeholder')}
              onChange={(value) => {
                onContentChange(usageType, value);
              }}
            />
          </FormField>
        </div>
      </div>
    );
  }
);

export default EmailTemplateRow;
