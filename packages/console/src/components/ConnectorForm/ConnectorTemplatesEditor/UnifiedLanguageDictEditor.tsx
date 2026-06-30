import { type LanguageTag, languages as uiLanguageNameMapping } from '@logto/language-kit';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import PerTypeTableEditor from './PerTypeTableEditor';
import styles from './index.module.scss';
import { type PerTypeString, typeColumns } from './unified';

/**
 * A per-language dictionary in the unified translations model: `Record<key, PerTypeString>`
 * (each key carries a `Generic` value plus per-usage-type overrides).
 */
type LanguageDict = Record<string, PerTypeString>;

type EditorProps = {
  readonly languageTag: LanguageTag;
  readonly dict: LanguageDict;
  readonly onChange: (next: LanguageDict) => void;
};

/**
 * The inline per-language dictionary editor (a table keyed by translation key with a `Generic`
 * column + per-usage-type columns) plus a Form/JSON toggle. A thin wrapper over
 * {@link PerTypeTableEditor} that supplies the per-language header and the dict-specific labels.
 * Extracted from `UnifiedLocalizationsTab` to keep that host under the shared `max-lines` limit.
 */
const UnifiedLanguageDictEditor = memo(({ languageTag, dict, onChange }: EditorProps) => {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  return (
    <PerTypeTableEditor
      data={dict}
      typeColumns={typeColumns}
      addButtonLabel="connector_details.template_editor.add_key"
      addPromptLabel={t('connector_details.template_editor.add_key')}
      deleteButtonLabel={t('connector_details.template_editor.delete_language')}
      jsonModeTitle={t('connector_details.unified_editor.json_merge_hint')}
      header={
        <div className={styles.translationsPanelHeader}>
          <span className={styles.translationsPanelTitle}>
            {t('connector_details.template_editor.translations_for_language', {
              language: uiLanguageNameMapping[languageTag],
            })}
          </span>
        </div>
      }
      onChange={onChange}
    />
  );
});

export default UnifiedLanguageDictEditor;
