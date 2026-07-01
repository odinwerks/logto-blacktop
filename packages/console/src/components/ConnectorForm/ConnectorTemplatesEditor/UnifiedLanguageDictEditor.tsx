import { type LanguageTag, languages as uiLanguageNameMapping } from '@logto/language-kit';
import { memo, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import PerTypeTableEditor from './PerTypeTableEditor';
import styles from './index.module.scss';

type LanguageDict = Record<string, string>;

type EditorProps = {
  readonly languageTag: LanguageTag;
  readonly dict: LanguageDict;
  readonly onChange: (next: LanguageDict) => void;
};

/**
 * The inline per-language dictionary editor (a table keyed by translation key with a single 'Value'
 * column) plus a Form/JSON toggle. A thin wrapper over {@link PerTypeTableEditor} that supplies the
 * per-language header and the dict-specific labels. Under Unified v4, we map the flat dict
 * Record<string, string> to/from the Record<string, PerTypeString> structure expected by PerTypeTableEditor
 * and supply ['Value'] as the only column.
 */
const UnifiedLanguageDictEditor = memo(({ languageTag, dict, onChange }: EditorProps) => {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  const editorData = useMemo(() => {
    return Object.fromEntries(Object.entries(dict).map(([key, value]) => [key, { Value: value }]));
  }, [dict]);

  const handleEditorChange = useCallback(
    (next: Record<string, { Value?: string }>) => {
      const nextFlat = Object.fromEntries(
        Object.entries(next).map(([key, perType]) => [key, perType.Value ?? ''])
      );
      onChange(nextFlat);
    },
    [onChange]
  );

  return (
    <PerTypeTableEditor
      data={editorData}
      typeColumns={['Value']}
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
      onChange={handleEditorChange}
    />
  );
});

export default UnifiedLanguageDictEditor;
