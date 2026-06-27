import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Table from '@/ds-components/Table';
import type { Column, RowGroup } from '@/ds-components/Table/types';
import Textarea from '@/ds-components/Textarea';

import styles from './index.module.scss';

type TranslationRow = {
  key: string;
  value: string;
};

type Props = {
  readonly keys: readonly string[];
  readonly values: Record<string, string>;
  readonly onChange: (key: string, value: string) => void;
};

type ValueCellProps = {
  readonly translationKey: string;
  readonly value: string;
  readonly onChange: (key: string, value: string) => void;
};

/**
 * Memoized per-row value editor. Across a single keystroke only the edited row's `value` prop
 * changes (the rest keep their value and the stable `onChange`), so React skips re-rendering the
 * untouched cells.
 */
const TranslationValueCell = memo(({ translationKey, value, onChange }: ValueCellProps) => (
  <Textarea
    rows={2}
    className={styles.translationValue}
    value={value}
    onChange={(event) => {
      onChange(translationKey, event.currentTarget.value);
    }}
  />
));

/**
 * Two-column translations grid: read-only key (as taken from the templates' `{{t.key}}`
 * placeholders or previously-defined keys) and an editable value cell for the selected language.
 *
 * Renders through the shared console `Table` so styling (borders, hover, empty state) stays
 * consistent with the rest of the admin console.
 */
function TranslationGrid({ keys, values, onChange }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  const data: TranslationRow[] = keys.map((key) => ({ key, value: values[key] ?? '' }));

  const columns: Array<Column<TranslationRow>> = [
    {
      title: t('connector_details.template_editor.key'),
      dataIndex: 'key',
      render: (row) => <code className={styles.translationKey}>{row.key}</code>,
    },
    {
      title: t('connector_details.template_editor.value'),
      dataIndex: 'value',
      render: (row) => (
        <TranslationValueCell translationKey={row.key} value={row.value} onChange={onChange} />
      ),
    },
  ];

  const rowGroups: Array<RowGroup<TranslationRow>> = [
    {
      key: 'translations',
      data,
    },
  ];

  return (
    <Table<TranslationRow, 'key'>
      hasBorder
      isRowHoverEffectDisabled
      rowGroups={rowGroups}
      columns={columns}
      rowIndexKey="key"
    />
  );
}

export default TranslationGrid;
