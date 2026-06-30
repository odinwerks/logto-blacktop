import { type ConnectorConfigFormItem, type ConnectorType } from '@logto/connector-kit';
import classNames from 'classnames';
import { type ReactNode, useCallback, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import ReactModal from 'react-modal';

import Button from '@/ds-components/Button';
import confirmModalStyles from '@/ds-components/ConfirmModal/index.module.scss';
import DangerousRaw from '@/ds-components/DangerousRaw';
import ModalLayout from '@/ds-components/ModalLayout';
import modalStyles from '@/scss/modal.module.scss';
import type { ConnectorFormType } from '@/types/connector';

import UnifiedTemplateEditor from './UnifiedTemplateEditor';
import styles from './index.module.scss';
import {
  compileUnified,
  seedUnifiedFromClassic,
  unifiedConnectorFactoryIds,
  kindForConnectorType,
  type EmailCompiledRow,
  type TemplateEditorMode,
  type UnifiedTemplate,
  type UnifiedTranslations,
  type VariablesTable,
  type PerTypeString,
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

  const handleCancel = useCallback(() => {
    setPendingMode(undefined);
  }, []);

  const handleStartFresh = useCallback(() => {
    if (pendingMode === 'unified') {
      setValue('formConfig.unifiedTemplate', safeJsonStringify({}), { shouldDirty: true });
      setValue('formConfig.variables', safeJsonStringify({}), { shouldDirty: true });
      setValue('formConfig.unifiedTranslations', safeJsonStringify({}), { shouldDirty: true });
      setValue('formConfig.unifiedSubjects', safeJsonStringify({}), { shouldDirty: true });
      setValue('formConfig.templateEditorMode', safeJsonStringify('unified'), {
        shouldDirty: true,
      });
    } else if (pendingMode === 'classic') {
      const rowsField = isDeliveries ? 'formConfig.deliveries' : 'formConfig.templates';
      const emptyRows = isDeliveries ? {} : [];
      setValue(rowsField, safeJsonStringify(emptyRows), { shouldDirty: true });
      setValue('formConfig.translations', safeJsonStringify({}), { shouldDirty: true });
      setValue('formConfig.templateEditorMode', safeJsonStringify('classic'), {
        shouldDirty: true,
      });
    }
    setPendingMode(undefined);
  }, [pendingMode, setValue, isDeliveries]);

  const handleAttemptConversion = useCallback(() => {
    if (pendingMode === 'unified') {
      const classicRowsRaw = getValues(
        isDeliveries ? 'formConfig.deliveries' : 'formConfig.templates'
      );
      const classicTranslations =
        safeJsonParse<TranslationMap>(getValues('formConfig.translations')) ?? {};

      const seed = seedUnifiedFromClassic(
        {
          kind: kindForConnectorType(connectorType),
          deliveries: safeJsonParse<Record<string, EmailCompiledRow>>(classicRowsRaw) ?? {},
        },
        classicTranslations
      );

      setValue('formConfig.unifiedTemplate', safeJsonStringify(seed.template), {
        shouldDirty: true,
      });
      setValue('formConfig.variables', safeJsonStringify(seed.variables), { shouldDirty: true });
      setValue('formConfig.unifiedTranslations', safeJsonStringify(seed.translations), {
        shouldDirty: true,
      });
      setValue('formConfig.unifiedSubjects', safeJsonStringify(seed.unifiedSubjects ?? {}), {
        shouldDirty: true,
      });
      setValue('formConfig.templateEditorMode', safeJsonStringify('unified'), {
        shouldDirty: true,
      });
    } else if (pendingMode === 'classic') {
      const kind = kindForConnectorType(connectorType);
      const template =
        safeJsonParse<UnifiedTemplate>(getValues('formConfig.unifiedTemplate')) ?? {};
      const variables = safeJsonParse<VariablesTable>(getValues('formConfig.variables')) ?? {};
      const translations =
        safeJsonParse<UnifiedTranslations>(getValues('formConfig.unifiedTranslations')) ?? {};
      const unifiedSubjects =
        safeJsonParse<PerTypeString>(getValues('formConfig.unifiedSubjects')) ?? {};

      const compiled = compileUnified({ kind, template, variables, translations, unifiedSubjects });

      const rowData = compiled.rows.deliveries;
      const rowsJson = safeJsonStringify(rowData);
      const translationsJson = safeJsonStringify(compiled.translations);

      const rowsField = isDeliveries ? 'formConfig.deliveries' : 'formConfig.templates';
      setValue(rowsField, rowsJson, { shouldDirty: true });
      setValue('formConfig.translations', translationsJson, { shouldDirty: true });
      setValue('formConfig.templateEditorMode', safeJsonStringify('classic'), {
        shouldDirty: true,
      });
    }
    setPendingMode(undefined);
  }, [pendingMode, getValues, setValue, isDeliveries, connectorType]);

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
      <ReactModal
        shouldCloseOnEsc
        isOpen={pendingMode !== undefined}
        className={classNames(modalStyles.content)}
        overlayClassName={classNames(modalStyles.overlay, confirmModalStyles.overlay)}
        onRequestClose={handleCancel}
      >
        <ModalLayout
          title={
            pendingMode === 'unified' ? (
              <DangerousRaw>Switch to Unified Mode?</DangerousRaw>
            ) : (
              <DangerousRaw>Switch to Classic Mode?</DangerousRaw>
            )
          }
          className={classNames(confirmModalStyles.content)}
          footer={
            <>
              <Button type="default" title="general.cancel" onClick={handleCancel} />
              <Button
                type="outline"
                title={<DangerousRaw>Start Fresh</DangerousRaw>}
                data-testid="toggle-start-fresh"
                onClick={handleStartFresh}
              />
              <Button
                type="primary"
                title={<DangerousRaw>Attempt Conversion</DangerousRaw>}
                data-testid="toggle-attempt-conversion"
                onClick={handleAttemptConversion}
              />
            </>
          }
          onClose={handleCancel}
        >
          {pendingMode === 'unified' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <DangerousRaw>
                This will transition your template editor to Unified Mode. How would you like to
                proceed?
              </DangerousRaw>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <p>
                  <strong>Attempt Conversion:</strong> Best-effort reverse-compile your current
                  classic templates and translations into a single unified template with &lt;If&gt;
                  blocks. Any existing custom overrides may be altered or lost.
                </p>
                <p>
                  <strong>Start Fresh:</strong> Initialize an empty unified template. Your classic
                  templates are preserved in the form config until you save or edit in Unified Mode.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <DangerousRaw>
                This will transition your template editor back to Classic Mode. How would you like
                to proceed?
              </DangerousRaw>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <p>
                  <strong>Attempt Conversion:</strong> Run the compiler on your current unified
                  source to generate classic templates and translations, overwriting any previous
                  classic edits.
                </p>
                <p>
                  <strong>Start Fresh:</strong> Reset your classic templates and translations to
                  empty structures.
                </p>
              </div>
            </div>
          )}
        </ModalLayout>
      </ReactModal>
    </>
  );
}

export default UnifiedEditorModeToggle;
