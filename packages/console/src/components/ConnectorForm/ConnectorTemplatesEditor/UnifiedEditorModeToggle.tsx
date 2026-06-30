import { type ConnectorConfigFormItem, type ConnectorType } from '@logto/connector-kit';
import { type ReactNode, useCallback, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import Button from '@/ds-components/Button';
import ConfirmModal from '@/ds-components/ConfirmModal';
import DangerousRaw from '@/ds-components/DangerousRaw';
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
 * The Classic/Unified editor-mode toggle + render switch (Mailgun only).
 * Encapsulates reading + persisting `formConfig.templateEditorMode`, the
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

  const [pendingMode, setPendingMode] = useState<TemplateEditorMode | undefined>(undefined);

  const isDeliveries = formItem.key === 'deliveries';

  const isUnifiedToggleVisible =
    connectorFactoryId !== undefined && unifiedConnectorFactoryIds.has(connectorFactoryId);

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
              if (templateEditorMode !== 'classic') {
                setPendingMode('classic');
              }
            }}
          />
          <Button
            size="medium"
            type={templateEditorMode === 'unified' ? 'primary' : 'outline'}
            title="connector_details.unified_editor.mode_unified"
            data-testid="editor-mode-unified"
            onClick={() => {
              if (templateEditorMode !== 'unified') {
                setPendingMode('unified');
              }
            }}
          />
        </div>
      )}
      {isUnifiedToggleVisible && isUnifiedMode ? (
        <UnifiedTemplateEditor connectorType={connectorType} />
      ) : (
        children
      )}
      <ConfirmModal
        isOpen={pendingMode !== undefined}
        title={
          pendingMode === 'unified' ? (
            <DangerousRaw>Switch to Unified Mode?</DangerousRaw>
          ) : (
            <DangerousRaw>Switch to Classic Mode?</DangerousRaw>
          )
        }
        confirmButtonText="general.confirm"
        cancelButtonText="general.cancel"
        confirmButtonType="primary"
        onCancel={() => {
          setPendingMode(undefined);
        }}
        onConfirm={() => {
          if (pendingMode) {
            switchEditorMode(pendingMode);
          }
          setPendingMode(undefined);
        }}
      >
        {pendingMode === 'unified' ? (
          <DangerousRaw>
            This will generate a unified template with &lt;If&gt; blocks from your current classic
            templates. Any per-type custom overrides may be altered or lost. Are you sure you want
            to proceed?
          </DangerousRaw>
        ) : (
          <DangerousRaw>
            This will keep your current compiled templates, but you will lose the ability to edit
            them as a single unified template. Your unified source fields will be kept as-is, but
            further edits will happen in Classic mode. Are you sure?
          </DangerousRaw>
        )}
      </ConfirmModal>
    </>
  );
}

export default UnifiedEditorModeToggle;
