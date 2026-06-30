import { useTranslation } from 'react-i18next';

import PerTypeTableEditor from './PerTypeTableEditor';
import { typeColumns, type VariablesTable } from './unified';

type Props = {
  readonly variables: VariablesTable;
  readonly onChange: (next: VariablesTable) => void;
};

/**
 * The Variables tab of the unified editor: a per-type table (`Key` + `Generic` + per-usage-type
 * columns) plus a Form/JSON toggle. A thin wrapper over {@link PerTypeTableEditor} that supplies
 * the Variables-specific labels (the `Generic` column is the fallback a variable resolves to when no
 * per-type column is defined — see the compiler's `inlineVariables`).
 */
function UnifiedVariablesTab({ variables, onChange }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  return (
    <PerTypeTableEditor
      data={variables}
      typeColumns={typeColumns}
      addButtonLabel="connector_details.unified_editor.add_variable"
      addPromptLabel={t('connector_details.unified_editor.variable_key_prompt')}
      deleteButtonLabel={t('connector_details.unified_editor.delete_variable')}
      emptyMessage={t('connector_details.unified_editor.no_variables')}
      jsonModeTitle={t('connector_details.unified_editor.json_merge_hint')}
      onChange={onChange}
    />
  );
}

export default UnifiedVariablesTab;
