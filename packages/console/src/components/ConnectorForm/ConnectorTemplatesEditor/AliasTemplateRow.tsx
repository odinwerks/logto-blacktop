import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import FormField from '@/ds-components/FormField';
import TextInput from '@/ds-components/TextInput';

import styles from './index.module.scss';

type Props = {
  readonly usageType: string;
  readonly templateAlias: string;
  readonly onAliasChange: (usageType: string, templateAlias: string) => void;
};

/**
 * Memoized per-`usageType` row for Postmark-style aliases (`{ usageType, templateAlias }`). The
 * alias references a provider-side template — its `{{t.key}}` localization is inapplicable, so this
 * row only edits the alias string and the translations grid stays empty.
 */
const AliasTemplateRow = memo(({ usageType, templateAlias, onAliasChange }: Props) => {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  return (
    <div className={styles.templateRow}>
      <div className={styles.templateRowHeader}>
        <span className={styles.usageType}>{usageType}</span>
        <div className={styles.headerDivider} />
      </div>
      <FormField isRequired title="connector_details.template_editor.alias">
        <TextInput
          value={templateAlias}
          placeholder={t('connector_details.template_editor.alias_placeholder')}
          onChange={(event) => {
            onAliasChange(usageType, event.currentTarget.value);
          }}
        />
      </FormField>
      <div className={styles.note}>{t('connector_details.template_editor.alias_hint')}</div>
    </div>
  );
});

export default AliasTemplateRow;
