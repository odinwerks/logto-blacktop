import { type LanguageTag, languages as uiLanguageNameMapping } from '@logto/language-kit';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DeleteIcon from '@/assets/icons/delete.svg?react';
import Button from '@/ds-components/Button';
import CodeEditor from '@/ds-components/CodeEditor';
import IconButton from '@/ds-components/IconButton';
import TabNav, { TabNavItem } from '@/ds-components/TabNav';
import TextInput from '@/ds-components/TextInput';
import { safeParseJson } from '@/utils/json';

import styles from './index.module.scss';
import type { PerTypeString } from './unified';
import { typeColumns } from './unified';
import { safeJsonStringify } from './utils';

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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type DictParseResult = { success: true; data: LanguageDict } | { success: false };

/**
 * The inline per-language dictionary editor (a table keyed by translation key with a `Generic`
 * column + 8 per-usage-type columns) plus a Form/JSON toggle mirroring the `TranslationEditorModal`'s
 * draft-and-apply pattern. Extracted from `UnifiedLocalizationsTab` to keep that host under the
 * shared `max-lines` limit.
 */
const UnifiedLanguageDictEditor = memo(({ languageTag, dict, onChange }: EditorProps) => {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<boolean>(false);
  const [newKey, setNewKey] = useState<string>('');

  useEffect(() => {
    if (mode === 'form') {
      setJsonText(safeJsonStringify(dict));
      setJsonError(false);
    }
  }, [dict, mode]);

  const switchToJson = useCallback(() => {
    setJsonText(safeJsonStringify(dict));
    setJsonError(false);
    setMode('json');
  }, [dict]);

  const switchToForm = useCallback(() => {
    const parsed = parseDictJson(jsonText);

    if (!parsed.success) {
      setJsonError(true);

      return;
    }

    onChange(mergeDict(dict, parsed.data));
    setJsonError(false);
    setMode('form');
  }, [jsonText, dict, onChange]);

  const onCellChange = (key: string, column: string, value: string) => {
    const perType = dict[key] ?? {};

    onChange({ ...dict, [key]: { ...perType, [column]: value } });
  };

  const onAddKey = () => {
    const trimmed = newKey.trim();

    if (trimmed.length === 0 || trimmed in dict) {
      return;
    }

    onChange({ ...dict, [trimmed]: {} });
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
                {typeColumns.map((column) => (
                  <th key={column} className={styles.translationKey}>
                    {column}
                  </th>
                ))}
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {Object.keys(dict).map((key) => (
                <tr key={key}>
                  <td className={styles.translationKey}>
                    <code>{key}</code>
                  </td>
                  {typeColumns.map((column) => (
                    <td key={column}>
                      <TextInput
                        value={dict[key]?.[column] ?? ''}
                        onChange={(event) => {
                          onCellChange(key, column, event.currentTarget.value);
                        }}
                      />
                    </td>
                  ))}
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
          <div className={styles.modeToggleRow}>
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
              type="outline"
              size="medium"
              title="connector_details.template_editor.add_key"
              onClick={onAddKey}
            />
          </div>
        </div>
      ) : (
        <CodeEditor
          language="json"
          value={jsonText}
          error={jsonError ? t('connector_details.unified_editor.invalid_json_format') : undefined}
          placeholder={t('connector_details.unified_editor.json_merge_hint')}
          onChange={(value) => {
            setJsonText(value);
            setJsonError(false);
          }}
        />
      )}
    </div>
  );
});

const parseDictJson = (text: string): DictParseResult => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { success: true, data: {} };
  }

  const result = safeParseJson(trimmed);

  if (!result.success || !isPlainObject(result.data)) {
    return { success: false };
  }

  const dict = Object.entries(result.data).reduce<LanguageDict>((accumulator, [key, perType]) => {
    if (key.length === 0) {
      return accumulator;
    }

    return { ...accumulator, [key]: normalizePerType(perType) };
  }, {});

  return { success: true, data: dict };
};

const normalizePerType = (value: unknown): PerTypeString => {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.entries(value).reduce<PerTypeString>(
    (accumulator, [column, cellValue]) =>
      typeof cellValue === 'string' && cellValue.length > 0
        ? { ...accumulator, [column]: cellValue }
        : accumulator,
    {}
  );
};

const mergeDict = (current: LanguageDict, parsed: LanguageDict): LanguageDict => ({
  ...current,
  ...parsed,
});

export default UnifiedLanguageDictEditor;
