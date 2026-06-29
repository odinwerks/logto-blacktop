import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DeleteIcon from '@/assets/icons/delete.svg?react';
import Button from '@/ds-components/Button';
import CodeEditor from '@/ds-components/CodeEditor';
import IconButton from '@/ds-components/IconButton';
import TabNav, { TabNavItem } from '@/ds-components/TabNav';
import TextInput from '@/ds-components/TextInput';
import { safeParseJson } from '@/utils/json';

import styles from './index.module.scss';
import type { PerTypeString, VariablesTable } from './unified';
import { typeColumns } from './unified';
import { safeJsonStringify } from './utils';

type Props = {
  readonly variables: VariablesTable;
  readonly onChange: (next: VariablesTable) => void;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type VariablesParseResult = { success: true; data: VariablesTable } | { success: false };

/**
 * The Variables tab of the unified editor: a per-type table (`Key` + `Generic` + 8 usage-type
 * columns) plus a Form/JSON toggle whose JSON mode edits the whole variables table as one JSON
 * object (mirroring the `TranslationEditorModal`'s draft-and-apply pattern).
 *
 * Form edits are live (each cell writes back via `onChange` immediately); JSON edits live in a
 * local buffer and merge into the table on the JSON → Form switch (invalid JSON blocks the switch
 * and surfaces an error). The `Generic` column is the fallback a variable resolves to when no
 * per-type column is defined (see the compiler's `inlineVariables`).
 */
function UnifiedVariablesTab({ variables, onChange }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<boolean>(false);
  const [newKey, setNewKey] = useState<string>('');

  // While in Form mode, keep the JSON buffer derived from the live variables so switching to JSON
  // always reflects the latest values. Does not run in JSON mode (preserves in-progress typing).
  useEffect(() => {
    if (mode === 'form') {
      setJsonText(safeJsonStringify(variables));
      setJsonError(false);
    }
  }, [variables, mode]);

  const keys = useMemo(() => Object.keys(variables), [variables]);

  const switchToJson = useCallback(() => {
    setJsonText(safeJsonStringify(variables));
    setJsonError(false);
    setMode('json');
  }, [variables]);

  const switchToForm = useCallback(() => {
    const parsed = parseVariablesJson(jsonText);

    if (!parsed.success) {
      setJsonError(true);

      return;
    }

    onChange(mergeVariables(variables, parsed.data));
    setJsonError(false);
    setMode('form');
  }, [jsonText, variables, onChange]);

  const onCellChange = (key: string, column: string, value: string) => {
    const perType = variables[key] ?? {};
    onChange({ ...variables, [key]: { ...perType, [column]: value } });
  };

  const onAddVariable = () => {
    const trimmed = newKey.trim();

    if (trimmed.length === 0 || trimmed in variables) {
      return;
    }

    onChange({ ...variables, [trimmed]: {} });
    setNewKey('');
  };

  const onDeleteVariable = (key: string) => {
    onChange(
      Object.fromEntries(Object.entries(variables).filter(([existing]) => existing !== key))
    );
  };

  return (
    <div className={styles.section}>
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
          {keys.length === 0 ? (
            <div className={styles.note}>{t('connector_details.unified_editor.no_variables')}</div>
          ) : (
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
                {keys.map((key) => (
                  <tr key={key}>
                    <td className={styles.translationKey}>
                      <code>{key}</code>
                    </td>
                    {typeColumns.map((column) => (
                      <td key={column}>
                        <VariableCell
                          value={variables[key]?.[column] ?? ''}
                          onChange={(value) => {
                            onCellChange(key, column, value);
                          }}
                        />
                      </td>
                    ))}
                    <td>
                      <IconButton
                        size="small"
                        aria-label={t('connector_details.unified_editor.delete_variable')}
                        onClick={() => {
                          onDeleteVariable(key);
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className={styles.modeToggleRow}>
            <TextInput
              placeholder={t('connector_details.unified_editor.variable_key_prompt')}
              value={newKey}
              onChange={(event) => {
                setNewKey(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onAddVariable();
                }
              }}
            />
            <Button
              type="outline"
              size="medium"
              title="connector_details.unified_editor.add_variable"
              onClick={onAddVariable}
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
}

const VariableCell = memo(
  ({ value, onChange }: { readonly value: string; readonly onChange: (value: string) => void }) => (
    <TextInput
      value={value}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
    />
  )
);

const parseVariablesJson = (text: string): VariablesParseResult => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { success: true, data: {} };
  }

  const result = safeParseJson(trimmed);

  if (!result.success || !isPlainObject(result.data)) {
    return { success: false };
  }

  const table = Object.entries(result.data).reduce<VariablesTable>(
    (accumulator, [key, perType]) => {
      if (key.length === 0) {
        return accumulator;
      }

      return { ...accumulator, [key]: normalizePerType(perType) };
    },
    {}
  );

  return { success: true, data: table };
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

const mergeVariables = (current: VariablesTable, parsed: VariablesTable): VariablesTable => ({
  ...current,
  ...parsed,
});

export default UnifiedVariablesTab;
