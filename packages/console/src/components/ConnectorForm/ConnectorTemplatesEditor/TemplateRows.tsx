import { useTranslation } from 'react-i18next';

import Textarea from '@/ds-components/Textarea';

import AliasTemplateRow from './AliasTemplateRow';
import EmailTemplateRow, { type EmailContentType } from './EmailTemplateRow';
import styles from './index.module.scss';
import { type ConnectorTemplateMode } from './mode';

type TemplateRow = { usageType: string } & Record<string, unknown>;

type FieldHandlers = {
  content: (usageType: string, value: string) => void;
  subject: (usageType: string, value: string) => void;
  html: (usageType: string, value: string) => void;
  text: (usageType: string, value: string) => void;
  alias: (usageType: string, value: string) => void;
};

type Props = {
  readonly mode: ConnectorTemplateMode;
  readonly sortedTemplates: TemplateRow[];
  readonly contentTypeKey?: 'contentType' | 'type';
  readonly fieldHandlers: FieldHandlers;
  readonly onContentTypeChange: (
    usageType: string,
    key: 'contentType' | 'type',
    contentType: EmailContentType
  ) => void;
};

function TemplateRows({
  mode,
  sortedTemplates,
  contentTypeKey,
  fieldHandlers,
  onContentTypeChange,
}: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  if (mode === 'sms') {
    return sortedTemplates.map(({ usageType, content }) => (
      <div key={usageType} className={styles.templateRow}>
        <div className={styles.templateRowHeader}>
          <span className={styles.usageType}>{usageType}</span>
          <div className={styles.headerDivider} />
        </div>
        <Textarea
          rows={2}
          className={styles.translationValue}
          value={typeof content === 'string' ? content : ''}
          placeholder={t('connector_details.template_editor.content_placeholder')}
          onChange={(event) => {
            fieldHandlers.content(usageType, event.currentTarget.value);
          }}
        />
      </div>
    ));
  }

  if (mode === 'email-alias') {
    return sortedTemplates.map(({ usageType, templateAlias }) => (
      <AliasTemplateRow
        key={usageType}
        usageType={usageType}
        templateAlias={typeof templateAlias === 'string' ? templateAlias : ''}
        onAliasChange={fieldHandlers.alias}
      />
    ));
  }

  return sortedTemplates.map((row) => {
    const rawContentType = contentTypeKey ? row[contentTypeKey] : undefined;

    return (
      <EmailTemplateRow
        key={row.usageType}
        usageType={row.usageType}
        subject={typeof row.subject === 'string' ? row.subject : ''}
        content={typeof row.content === 'string' ? row.content : ''}
        contentType={
          rawContentType === 'text/plain' || rawContentType === 'text/html'
            ? rawContentType
            : 'text/html'
        }
        contentTypeKey={contentTypeKey ?? 'contentType'}
        showContentType={Boolean(contentTypeKey)}
        onSubjectChange={fieldHandlers.subject}
        onContentChange={fieldHandlers.content}
        onContentTypeChange={onContentTypeChange}
      />
    );
  });
}

export default TemplateRows;
