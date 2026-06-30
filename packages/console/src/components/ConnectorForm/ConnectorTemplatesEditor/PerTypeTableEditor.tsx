import type { AdminConsoleKey } from '@logto/phrases';
import { type ReactNode, memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DeleteIcon from '@/assets/icons/delete.svg?react';
import Button from '@/ds-components/Button';
import CodeEditor from '@/ds-components/CodeEditor';
import IconButton from '@/ds-components/IconButton';
import TabNav, { TabNavItem } from '@/ds-components/TabNav';
import TextInput from '@/ds-components/TextInput';

import styles from './index.module.scss';
import {
  mergePerTypeTable,
  parsePerTypeTableJson,
  type PerTypeString,
  type PerTypeTableParseError,
} from './unified';
import { safeJsonStringify } from './utils';

type Props = {
  /** The per-type table being edited (`Record<key, PerTypeString>`). */
  readonly data: Record<string, PerTypeString>;
  /** Fired with the next table on every Form-mode edit and on a successful JSON → Form switch. */
  readonly onChange: (data: Record<string, PerTypeString>) => void;
  /** The ordered column set rendered as the table's per-type columns (Generic + usage types). */
  readonly typeColumns: readonly string[];
  /** The Add button's phrase key (resolved by `Button`/`DynamicT`, mirroring the classic editors). */
  readonly addButtonLabel: AdminConsoleKey;
  /** Placeholder for the add-key input (already translated by the caller). */
  readonly addPromptLabel: string;
  /** Accessible label for the per-row delete button (already translated). Omit → no `aria-label`. */
  readonly deleteButtonLabel?: string;
  /** Empty-state note rendered in place of the empty table (already translated). Omit → render the (header-only) table. */
  readonly emptyMessage?: string;
  /** Hint rendered as the JSON editor's placeholder (already translated). */
  readonly jsonModeTitle: string;
  /** Optional header node rendered above the Form/JSON toggle (e.g. the per-language title). */
  readonly header?: ReactNode;
};

/**
 * A generic controlled editor for a `Record<string, PerTypeString>` table (a `Key` column plus one
 * column per {@link Props.typeColumns} member — `Generic` is the fallback), with a Form/JSON toggle
 * mirroring the classic `TranslationEditorModal`'s draft-and-apply pattern.
 *
 * - Form mode is live (each cell writes back via `onChange` immediately); the JSON buffer is kept
 *   derived from the live table so switching to JSON always reflects the latest values.
 * - JSON mode edits live in a local buffer and merge into the table on the JSON → Form switch;
 *   invalid JSON (or a non-object / non-string value) blocks the switch and surfaces a structured
 *   error message in the `CodeEditor` (reusing the `unified_editor.json_*` phrase keys).
 *
 * Shared by the Variables tab (`UnifiedVariablesTab`) and the per-language Localizations dict
 * editor (`UnifiedLanguageDictEditor`), which collapse to thin wrappers that supply their label
 * bundle + header. Previously the two were ~90% duplicated.
 */
function PerTypeTableEditor({
  data,
  onChange,
  typeColumns,
  addButtonLabel,
  addPromptLabel,
  deleteButtonLabel,
  emptyMessage,
  jsonModeTitle,
  header,
}: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<PerTypeTableParseError | undefined>(undefined);
  const [newKey, setNewKey] = useState<string>('');

  // While in Form mode, keep the JSON buffer derived from the live table so switching to JSON
  // always reflects the latest values. Does not run in JSON mode (preserves in-progress typing).
  useEffect(() => {
    if (mode === 'form') {
      setJsonText(safeJsonStringify(data));
      setJsonError(undefined);
    }
  }, [data, mode]);

  const keys = Object.keys(data);

  const switchToJson = useCallback(() => {
    setJsonText(safeJsonStringify(data));
    setJsonError(undefined);
    setMode('json');
  }, [data]);

  const switchToForm = useCallback(() => {
    const parsed = parsePerTypeTableJson(jsonText, typeColumns);

    if (!parsed.success) {
      setJsonError(parsed.errorKey);

      return;
    }

    onChange(mergePerTypeTable(data, parsed.data));
    setJsonError(undefined);
    setMode('form');
  }, [data, jsonText, typeColumns, onChange]);

  const onCellChange = (key: string, column: string, value: string) => {
    const perType = data[key] ?? {};

    onChange({ ...data, [key]: { ...perType, [column]: value } });
  };

  const onAddKey = () => {
    const trimmed = newKey.trim();

    if (trimmed.length === 0 || trimmed in data) {
      return;
    }

    onChange({ ...data, [trimmed]: {} });
    setNewKey('');
  };

  const onDeleteKey = (key: string) => {
    onChange(Object.fromEntries(Object.entries(data).filter(([existing]) => existing !== key)));
  };

  return (
    <div className={styles.section}>
      {header}
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
          {keys.length === 0 && emptyMessage ? (
            <div className={styles.note}>{emptyMessage}</div>
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
                        <TableCell
                          value={data[key]?.[column] ?? ''}
                          onChange={(value) => {
                            onCellChange(key, column, value);
                          }}
                        />
                      </td>
                    ))}
                    <td>
                      <IconButton
                        size="small"
                        aria-label={deleteButtonLabel}
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
          )}
          <div className={styles.modeToggleRow}>
            <TextInput
              placeholder={addPromptLabel}
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
            <Button type="outline" size="medium" title={addButtonLabel} onClick={onAddKey} />
          </div>
        </div>
      ) : (
        <CodeEditor
          language="json"
          value={jsonText}
          error={jsonError ? t(jsonErrorPhraseKey(jsonError)) : undefined}
          placeholder={jsonModeTitle}
          onChange={(value) => {
            setJsonText(value);
            setJsonError(undefined);
          }}
        />
      )}
    </div>
  );
}

/**
 * Maps a per-type table parse error key to its user-facing phrase key (all under
 * `unified_editor`). The return type is inferred as the narrow union of the three leaf phrase keys
 * (not the full `AdminConsoleKey`) so the caller's typed `t(...)` narrows each branch to `string`
 * (the value type at a leaf key) rather than the full admin-console value union. Kept as a pure
 * switch (rather than a template string) so the phrase keys stay statically type-checked.
 */
const jsonErrorPhraseKey = (
  errorKey: PerTypeTableParseError
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

const TableCell = memo(
  ({ value, onChange }: { readonly value: string; readonly onChange: (value: string) => void }) => (
    <TextInput
      value={value}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
    />
  )
);

export default PerTypeTableEditor;
