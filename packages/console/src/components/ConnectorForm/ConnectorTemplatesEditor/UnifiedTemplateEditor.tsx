import { type ConnectorType } from '@logto/connector-kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import TabNav, { TabNavItem } from '@/ds-components/TabNav';
import type { ConnectorFormType } from '@/types/connector';

import UnifiedLocalizationsTab from './UnifiedLocalizationsTab';
import UnifiedTemplateTab from './UnifiedTemplateTab';
import UnifiedVariablesTab from './UnifiedVariablesTab';
import styles from './index.module.scss';
import {
  compileUnified,
  dummyPayload,
  kindForConnectorType,
  type UnifiedTemplate,
  type UnifiedTranslations,
  type VariablesTable,
} from './unified';
import { safeJsonParse, safeJsonStringify } from './utils';

type Props = {
  /** The owning connector's type (always `Email` for the allowlisted Mailgun connector). */
  readonly connectorType: ConnectorType;
};

type TabKey = 'template' | 'variables' | 'localizations';

const EMPTY_TEMPLATE: UnifiedTemplate = {};
const EMPTY_VARIABLES: VariablesTable = {};
const EMPTY_TRANSLATIONS: UnifiedTranslations = {};

/**
 * The dev-flagged Unified template editor for Mailgun. A three-tab host (Template /
 * Variables / Localizations) that owns four defensive `formConfig` fields
 * (`unifiedTemplate`, `variables`, `unifiedTranslations`, `templateEditorMode`) and compiles them
 * on edit into the existing `deliveries` + `translations` mirror fields the Mailgun connector
 * already consumes — so the persisted + runtime contract is byte-for-byte unchanged and the send
 * path needs zero changes.
 *
 * The compile-on-edit effect re-runs `compileUnified` whenever the unified source changes and
 * writes the compiled rows + flat translations to the mirror fields ONLY when they differ from the
 * form's current mirror value — so loading a saved unified connector (whose compiled mirror
 * already matches the recompiled output) does not spuriously dirty the form. The effect is skipped
 * entirely when the unified template is empty, so toggling Classic → Unified with no authored
 * unified content does not clobber the classic per-type rows (the {@link UnifiedEditorModeToggle}
 * seeds the unified fields best-effort from the classic rows first).
 */
function UnifiedTemplateEditor({ connectorType }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { setValue, getValues, formState } = useFormContext<ConnectorFormType>();
  const { isSubmitting } = formState;
  const [activeTab, setActiveTab] = useState<TabKey>('template');

  const kind = kindForConnectorType(connectorType);

  const rowsField: FieldPath<ConnectorFormType> = 'formConfig.deliveries';

  const templateRaw: unknown = useWatch({ name: 'formConfig.unifiedTemplate' });
  const variablesRaw: unknown = useWatch({ name: 'formConfig.variables' });
  const translationsRaw: unknown = useWatch({ name: 'formConfig.unifiedTranslations' });

  const template = useMemo<UnifiedTemplate>(
    () => safeJsonParse<UnifiedTemplate>(templateRaw) ?? EMPTY_TEMPLATE,
    [templateRaw]
  );
  const variables = useMemo<VariablesTable>(
    () => safeJsonParse<VariablesTable>(variablesRaw) ?? EMPTY_VARIABLES,
    [variablesRaw]
  );
  const translations = useMemo<UnifiedTranslations>(
    () => safeJsonParse<UnifiedTranslations>(translationsRaw) ?? EMPTY_TRANSLATIONS,
    [translationsRaw]
  );

  const compiled = useMemo(
    () => compileUnified({ kind, template, variables, translations }),
    [kind, template, variables, translations]
  );

  const hasUnifiedContent = useMemo(
    () => Object.values(template).some((value) => typeof value === 'string' && value.length > 0),
    [template]
  );

  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const flushRef = useRef<() => void>();
  const containerRef = useRef<HTMLDivElement>(null);

  const writeBack = useCallback(() => {
    if (!hasUnifiedContent) {
      return;
    }

    // `compiled.rows` is the `CompiledRows` wrapper; emit the inner `deliveries` record the
    // Mailgun connector consumes.
    const rowData = compiled.rows.deliveries;
    const rowsJson = safeJsonStringify(rowData);
    const translationsJson = safeJsonStringify(compiled.translations);
    const currentRows = getValues(rowsField);
    const currentTranslations = getValues('formConfig.translations');

    // Only write (and dirty the form) when the compiled output differs from the form's current
    // mirror value — so loading a saved unified connector (whose mirror already matches the
    // deterministic recompile) does not spuriously dirty the form.
    if (rowsJson !== (typeof currentRows === 'string' ? currentRows : '')) {
      setValue(rowsField, rowsJson, { shouldDirty: true });
    }

    if (translationsJson !== (typeof currentTranslations === 'string' ? currentTranslations : '')) {
      setValue('formConfig.translations', translationsJson, { shouldDirty: true });
    }
  }, [compiled, hasUnifiedContent, rowsField, setValue, getValues]);

  useEffect(() => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    flushRef.current = writeBack;
  }, [writeBack]);

  useEffect(() => {
    if (!hasUnifiedContent) {
      return;
    }

    // Only queue a debounce when the compiled output differs from the form's current mirror value.
    // On initial mount / loading, they are identical, so this prevents scheduling a timer on load.
    const rowData = compiled.rows.deliveries;
    const rowsJson = safeJsonStringify(rowData);
    const translationsJson = safeJsonStringify(compiled.translations);
    const currentRows = getValues(rowsField);
    const currentTranslations = getValues('formConfig.translations');

    if (
      rowsJson === (typeof currentRows === 'string' ? currentRows : '') &&
      translationsJson === (typeof currentTranslations === 'string' ? currentTranslations : '')
    ) {
      return;
    }

    // eslint-disable-next-line @silverhand/fp/no-mutation
    debounceTimerRef.current = setTimeout(() => {
      writeBack();
      // eslint-disable-next-line @silverhand/fp/no-mutation
      debounceTimerRef.current = undefined;
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        // eslint-disable-next-line @silverhand/fp/no-mutation
        debounceTimerRef.current = undefined;
      }
    };
  }, [compiled, hasUnifiedContent, writeBack, getValues, rowsField]);

  // Flush on form submit event
  useEffect(() => {
    const form = containerRef.current?.closest('form');
    if (!form) {
      return;
    }

    const handleSubmit = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        // eslint-disable-next-line @silverhand/fp/no-mutation
        debounceTimerRef.current = undefined;
      }
      flushRef.current?.();
    };

    form.addEventListener('submit', handleSubmit);
    return () => {
      form.removeEventListener('submit', handleSubmit);
    };
  }, []);

  // Flush when react-hook-form reports isSubmitting is true
  useEffect(() => {
    if (isSubmitting) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        // eslint-disable-next-line @silverhand/fp/no-mutation
        debounceTimerRef.current = undefined;
      }
      flushRef.current?.();
    }
  }, [isSubmitting]);

  const onTemplateChange = (next: UnifiedTemplate) => {
    setValue('formConfig.unifiedTemplate', safeJsonStringify(next), { shouldDirty: true });
  };

  const onVariablesChange = (next: VariablesTable) => {
    setValue('formConfig.variables', safeJsonStringify(next), { shouldDirty: true });
  };

  const onTranslationsChange = (next: UnifiedTranslations) => {
    setValue('formConfig.unifiedTranslations', safeJsonStringify(next), { shouldDirty: true });
  };

  return (
    <div ref={containerRef} className={styles.unifiedHost}>
      <TabNav>
        <TabNavItem
          isActive={activeTab === 'template'}
          onClick={() => {
            setActiveTab('template');
          }}
        >
          {t('connector_details.unified_editor.tab_template')}
        </TabNavItem>
        <TabNavItem
          isActive={activeTab === 'variables'}
          onClick={() => {
            setActiveTab('variables');
          }}
        >
          {t('connector_details.unified_editor.tab_variables')}
        </TabNavItem>
        <TabNavItem
          isActive={activeTab === 'localizations'}
          onClick={() => {
            setActiveTab('localizations');
          }}
        >
          {t('connector_details.unified_editor.tab_localizations')}
        </TabNavItem>
      </TabNav>
      {activeTab === 'template' && (
        <UnifiedTemplateTab
          kind={kind}
          template={template}
          variables={variables}
          translations={translations}
          dummyPayload={dummyPayload}
          onTemplateChange={onTemplateChange}
        />
      )}
      {activeTab === 'variables' && (
        <UnifiedVariablesTab variables={variables} onChange={onVariablesChange} />
      )}
      {activeTab === 'localizations' && (
        <UnifiedLocalizationsTab translations={translations} onChange={onTranslationsChange} />
      )}
    </div>
  );
}

export default UnifiedTemplateEditor;
