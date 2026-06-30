import { type ConnectorConfigFormItem, type ConnectorType } from '@logto/connector-kit';
import { type ReactNode, useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { isDevFeaturesEnabled } from '@/consts/env';
import Button from '@/ds-components/Button';
import type { ConnectorFormType } from '@/types/connector';

import UnifiedTemplateEditor from './UnifiedTemplateEditor';
import styles from './index.module.scss';
import {
  seedUnifiedFromClassic,
  unifiedConnectorFactoryIds,
  type EmailCompiledRow,
  type TemplateEditorMode,
} from './unified';
import { safeJsonParse, safeJsonStringify } from './utils';

type Props = {
  /** The `templates`/`deliveries` form item this editor is rendered for. */
  readonly formItem: ConnectorConfigFormItem;
  /** The owning connector's type; retained for the {@link UnifiedTemplateEditor} prop contract. */
  readonly connectorType: ConnectorType;
  /** The connector factory id (e.g. `mailgun-email`); gates the Unified toggle. */
  readonly connectorFactoryId?: string;
  /** The classic editor content (rendered when not in Unified mode). */
  readonly children: ReactNode;
};

// A flat translation dictionary mirror type, re-declared here to avoid importing the host's private
// `TranslationMap` alias.
type TranslationMap = Record<string, Record<string, string>>;

/**
 * The Classic/Unified editor-mode toggle + render switch (dev-flagged: Mailgun only).
 * Encapsulates reading + persisting `formConfig.templateEditorMode`, the `isDevFeaturesEnabled` +
 * connector-factory-id allowlist gate, the best-effort reverse-compile seed on Classic → Unified,
 * and rendering either the {@link UnifiedTemplateEditor} or the host's classic children.
 *
 * Only `mailgun-email` is allowlisted; SMS connectors keep the classic per-type editor and never
 * show this toggle. Extracted from `ConnectorTemplatesEditor` to keep that host under the shared
 * `max-lines` limit.
 */
function UnifiedEditorModeToggle({ formItem, connectorType, connectorFactoryId, children }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { getValues, setValue } = useFormContext<ConnectorFormType>();

  const isDeliveries = formItem.key === 'deliveries';

  const isUnifiedToggleVisible =
    isDevFeaturesEnabled &&
    connectorFactoryId !== undefined &&
    unifiedConnectorFactoryIds.has(connectorFactoryId);

  const templateEditorModeRaw: unknown = useWatch({ name: 'formConfig.templateEditorMode' });
  const parsedEditorMode =
    typeof templateEditorModeRaw === 'string'
      ? safeJsonParse<TemplateEditorMode>(templateEditorModeRaw)
      : undefined;
  const templateEditorMode: TemplateEditorMode =
    parsedEditorMode === 'unified' ? 'unified' : 'classic';
  const isUnifiedMode = isUnifiedToggleVisible && templateEditorMode === 'unified';

  const switchEditorMode = useCallback(
    (next: TemplateEditorMode) => {
      const applySeed = (seed: ReturnType<typeof seedUnifiedFromClassic>) => {
        setValue('formConfig.unifiedTemplate', safeJsonStringify(seed.template), {
          shouldDirty: true,
        });
        setValue('formConfig.variables', safeJsonStringify(seed.variables), {
          shouldDirty: true,
        });
        setValue('formConfig.unifiedTranslations', safeJsonStringify(seed.translations), {
          shouldDirty: true,
        });
      };

      if (next === 'unified') {
        // Best-effort reverse-compile the classic rows + translations into the unified fields when
        // switching into Unified with no authored unified template yet, so the admin sees their
        // existing content (and the compile-on-edit effect does not clobber the classic mirror).
        const existingUnified = safeJsonParse<unknown>(getValues('formConfig.unifiedTemplate'));

        if (!existingUnified && isDeliveries) {
          // Mailgun reverse-compile (the only allowlisted connector kind).
          const classicRowsRaw = getValues('formConfig.deliveries');
          const classicTranslations =
            safeJsonParse<TranslationMap>(getValues('formConfig.translations')) ?? {};

          const seed = seedUnifiedFromClassic(
            {
              kind: 'email-mailgun',
              deliveries: safeJsonParse<Record<string, EmailCompiledRow>>(classicRowsRaw) ?? {},
            },
            classicTranslations
          );

          applySeed(seed);
        }
      }

      setValue('formConfig.templateEditorMode', safeJsonStringify(next), { shouldDirty: true });
    },
    [getValues, setValue, isDeliveries]
  );

  return (
    <>
      {isUnifiedToggleVisible && (
        <div className={styles.modeToggleRow} role="tablist" aria-label="Template editor mode">
          <Button
            size="medium"
            type={templateEditorMode === 'classic' ? 'primary' : 'outline'}
            title="connector_details.unified_editor.mode_classic"
            data-testid="editor-mode-classic"
            onClick={() => {
              switchEditorMode('classic');
            }}
          />
          <Button
            size="medium"
            type={templateEditorMode === 'unified' ? 'primary' : 'outline'}
            title="connector_details.unified_editor.mode_unified"
            data-testid="editor-mode-unified"
            onClick={() => {
              switchEditorMode('unified');
            }}
          />
        </div>
      )}
      {isUnifiedToggleVisible && isUnifiedMode ? (
        <UnifiedTemplateEditor connectorType={connectorType} />
      ) : (
        children
      )}
    </>
  );
}

export default UnifiedEditorModeToggle;
