import { type LanguageTag, languages as uiLanguageNameMapping } from '@logto/language-kit';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DeleteIcon from '@/assets/icons/delete.svg?react';
import Button from '@/ds-components/Button';
import CodeEditor from '@/ds-components/CodeEditor';
import DangerousRaw from '@/ds-components/DangerousRaw';
import IconButton from '@/ds-components/IconButton';
import TabNav, { TabNavItem } from '@/ds-components/TabNav';
import TextInput from '@/ds-components/TextInput';

import styles from './index.module.scss';
import {
  parseTranslationsJson,
  serializeTranslations,
  type TranslationsParseResult,
} from './utils';

type LanguageDict = Record<string, string>;

type EditorProps = {
  readonly languageTag: LanguageTag;
  readonly dict: LanguageDict;
  readonly onChange: (next: LanguageDict) => void;
};

type JsonErrorKey = Extract<TranslationsParseResult, { success: false }>['errorKey'];

/**
 * The inline per-language dictionary editor for the unified Localizations tab. Edits a flat
 * `Record<string, string>` directly (no `{ Value: ... }` wrapper) with a Form/JSON toggle.
 *
 * Form mode renders a key/value table: each row has an editable key input, an editable value input,
 * and a delete button. JSON mode uses the canonical flat JSON format and validates with the shared
 * {@link parseTranslationsJson} helper.
 */
const UnifiedLanguageDictEditor = memo(({ languageTag, dict, onChange }: EditorProps) => {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<JsonErrorKey | undefined>(undefined);
  const [newKey, setNewKey] = useState<string>('');

  // Keep the JSON buffer derived from the live dictionary while in Form mode.
  useEffect(() => {
    if (mode === 'form') {
      setJsonText(serializeTranslations(dict));
      setJsonError(undefined);
    }
  }, [dict, mode]);

  const switchToJson = useCallback(() => {
    setJsonText(serializeTranslations(dict));
    setJsonError(undefined);
    setMode('json');
  }, [dict]);

  const switchToForm = useCallback(() => {
    const parsed = parseTranslationsJson(jsonText);

    if (!parsed.success) {
      setJsonError(parsed.errorKey);

      return;
    }

    onChange(parsed.data);
    setJsonError(undefined);
    setMode('form');
  }, [jsonText, onChange]);

  const onKeyChange = (oldKey: string, newKeyValue: string) => {
    const trimmed = newKeyValue.trim();

    if (trimmed === oldKey) {
      return;
    }

    if (trimmed.length === 0 || trimmed in dict) {
      // Reject empty or duplicate keys by reverting to the original key.
      onChange({ ...dict });

      return;
    }

    const next = Object.fromEntries(
      Object.entries(dict).map(([key, value]) => [key === oldKey ? trimmed : key, value])
    );

    onChange(next);
  };

  const onValueChange = (key: string, value: string) => {
    onChange({ ...dict, [key]: value });
  };

  const onAddKey = () => {
    const trimmed = newKey.trim();

    if (trimmed.length === 0 || trimmed in dict) {
      return;
    }

    onChange({ ...dict, [trimmed]: '' });
    setNewKey('');
  };

  const onDeleteKey = (key: string) => {
    onChange(Object.fromEntries(Object.entries(dict).filter(([existing]) => existing !== key)));
  };

  return (
    <div className={styles.section}>
      <div className={styles.translationsPanelHeader}>
        <span className={styles.translationsPanelTitle}>
          {t('connector_details.template_editor.translations_for_language', {
            language: uiLanguageNameMapping[languageTag],
          })}
        </span>
      </div>
      <TabNav className={styles.modeToggleRow}>
        <TabNavItem isActive={mode === 'form'} onClick={switchToForm}>
          {t('connector_details.template_editor.form_mode')}
        </TabNavItem>
        <TabNavItem isActive={mode === 'json'} onClick={switchToJson}>
          {t('connector_details.template_editor.json_mode')}
        </TabNavItem>
      </TabNav>
      {mode === 'form' ? (
        <div className={styles.perTypeTableWrapper}>
          <table>
            <thead>
              <tr>
                <th className={styles.translationKey}>
                  {t('connector_details.template_editor.key')}
                </th>
                <th className={styles.translationKey}>
                  {t('connector_details.template_editor.value')}
                </th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {Object.entries(dict).map(([key, value]) => (
                <tr key={key}>
                  <td className={styles.translationKey}>
                    <TextInput
                      value={key}
                      onChange={(event) => {
                        onKeyChange(key, event.currentTarget.value);
                      }}
                    />
                  </td>
                  <td>
                    <TextInput
                      value={value}
                      onChange={(event) => {
                        onValueChange(key, event.currentTarget.value);
                      }}
                    />
                  </td>
                  <td>
                    <IconButton
                      size="small"
                      aria-label={t('connector_details.template_editor.delete_language')}
                      onClick={() => {
                        onDeleteKey(key);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.inlineAddRow}>
            <TextInput
              placeholder={t('connector_details.template_editor.add_key')}
              value={newKey}
              onChange={(event) => {
                setNewKey(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onAddKey();
                }
              }}
            />
            <Button
              type="primary"
              size="medium"
              title={<DangerousRaw>+</DangerousRaw>}
              onClick={onAddKey}
            />
          </div>
        </div>
      ) : (
        <CodeEditor
          language="json"
          value={jsonText}
          error={jsonError ? t(jsonErrorPhraseKey(jsonError)) : undefined}
          placeholder={t('connector_details.unified_editor.json_merge_hint')}
          onChange={(value) => {
            setJsonText(value);
            setJsonError(undefined);
          }}
        />
      )}
    </div>
  );
});

const jsonErrorPhraseKey = (
  errorKey: JsonErrorKey
):
  | 'connector_details.unified_editor.invalid_json_format'
  | 'connector_details.unified_editor.json_must_be_object'
  | 'connector_details.unified_editor.json_values_must_be_strings' => {
  switch (errorKey) {
    case 'json_must_be_object': {
      return 'connector_details.unified_editor.json_must_be_object';
    }
    case 'json_values_must_be_strings': {
      return 'connector_details.unified_editor.json_values_must_be_strings';
    }
    default: {
      return 'connector_details.unified_editor.invalid_json_format';
    }
  }
};

export default UnifiedLanguageDictEditor;
