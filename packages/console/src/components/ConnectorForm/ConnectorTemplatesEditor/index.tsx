import type { ConnectorConfigFormItem } from '@logto/connector-kit';
import { isLanguageTag, type LanguageTag } from '@logto/language-kit';
import { deduplicate } from '@silverhand/essentials';
import { memo, useCallback, useMemo } from 'react';
import { useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import LocalizationNav from '@/components/LocalizationEditor/LocalizationNav';
import useLocalizationEditorContext from '@/components/LocalizationEditor/use-localization-editor-context';
import Textarea from '@/ds-components/Textarea';
import type { ConnectorFormType } from '@/types/connector';

import TranslationGrid from './TranslationGrid';
import styles from './index.module.scss';
import { extractTranslationKeys, safeJsonParse, safeJsonStringify } from './utils';

type Props = {
  /** The `templates` form item this editor is rendered for (SMS connectors only). */
  readonly formItem: ConnectorConfigFormItem;
};

type SmsTemplate = {
  usageType: string;
  content: string;
};

type TranslationMap = Record<string, Record<string, string>>;

// The sibling `translations` form item is rendered as `null` by `ConfigFormFields` and owned
// entirely by this editor, so its react-hook-form path is fixed.
const TRANSLATIONS_FIELD: FieldPath<ConnectorFormType> = 'formConfig.translations';

type TemplateRowProps = {
  readonly usageType: string;
  readonly value: string;
  readonly onContentChange: (usageType: string, content: string) => void;
};

/**
 * Memoized per-template content editor. Only the edited template row's `value` changes on a given
 * keystroke (the nearest stable `onContentChange` is threaded down from the host), so the other
 * rows skip re-rendering.
 */
const TemplateContentRow = memo(({ usageType, value, onContentChange }: TemplateRowProps) => {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  return (
    <div className={styles.templateRow}>
      <span className={styles.usageType}>{usageType}</span>
      <Textarea
        rows={2}
        className={styles.translationValue}
        value={value}
        placeholder={t('connector_details.template_editor.content_placeholder')}
        onChange={(event) => {
          onContentChange(usageType, event.currentTarget.value);
        }}
      />
    </div>
  );
});

/**
 * Inline connector templates editor for SMS connectors.
 *
 * Owns two JSON form fields on the connector config form:
 * - `formConfig.templates` — the array of `{ usageType, content }` templates. Each template's
 *   `content` supports `{{code}}`-style payload handlebars and `{{t.key}}` localization
 *   placeholders (resolved at send time via `getLocalizedPayload` + `replaceSendMessageHandlebars`).
 * - `formConfig.translations` — a `Record<LanguageTag, Record<string, string>>` translation
 *   dictionary consumed by `getLocalizedPayload`.
 *
 * Changes are written back immediately as pretty-printed JSON strings via react-hook-form's
 * `setValue` (marking the form dirty) so the connector's Save flow persists them unchanged.
 *
 * Reuses the Phase 0 `LocalizationNav` + `useLocalizationEditorContext` shell for the per-language
 * translation switcher instead of the full modal `LocalizationEditor` (this editor is inline within
 * the config form, not a portal).
 */
function ConnectorTemplatesEditor({ formItem }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { watch, getValues, setValue } = useFormContext<ConnectorFormType>();
  const { context, Provider } = useLocalizationEditorContext();
  const { selectedLanguage } = context;

  // Resolve the templates field path from the form item this editor was rendered for (`formItem.key`
  // is always `'templates'` for SMS connectors). The cast bridges react-hook-form's literal
  // `FieldPath` union with a runtime-derived key.
  const templatesField = useMemo(
    // eslint-disable-next-line no-restricted-syntax -- `formItem.key` is a runtime string; react-hook-form's `FieldPath` is a literal union that cannot be derived from a dynamic key without a cast.
    () => `formConfig.${formItem.key}` as FieldPath<ConnectorFormType>,
    [formItem.key]
  );

  const templatesRaw = watch(templatesField);
  const translationsRaw = watch(TRANSLATIONS_FIELD);

  const templates = useMemo<SmsTemplate[]>(
    () => safeJsonParse<SmsTemplate[]>(templatesRaw) ?? [],
    [templatesRaw]
  );
  const translations = useMemo<TranslationMap>(
    () => safeJsonParse<TranslationMap>(translationsRaw) ?? {},
    [translationsRaw]
  );

  // Keys surfaced in the translations grid: every `{{t.key}}` referenced by any template, unioned
  // with every key already defined in any language's dictionary. Sorted for stable ordering.
  const allKeys = useMemo(() => {
    const fromTemplates = extractTranslationKeys(templates);
    const fromTranslations = Object.values(translations).flatMap((dictionary) =>
      Object.keys(dictionary)
    );

    return deduplicate([...fromTemplates, ...fromTranslations])
      .slice()
      .sort();
  }, [templates, translations]);

  const languages = useMemo<LanguageTag[]>(
    () =>
      deduplicate(Object.keys(translations))
        .filter((languageTag): languageTag is LanguageTag => isLanguageTag(languageTag))
        .slice()
        .sort(),
    [translations]
  );

  const writeTemplates = useCallback(
    (next: SmsTemplate[]) => {
      setValue(templatesField, safeJsonStringify(next), { shouldDirty: true });
    },
    [setValue, templatesField]
  );

  const writeTranslations = useCallback(
    (next: TranslationMap) => {
      setValue(TRANSLATIONS_FIELD, safeJsonStringify(next), { shouldDirty: true });
    },
    [setValue]
  );

  // Stable across keystrokes (reads the latest form value via `getValues` instead of closing over
  // the reactive `templates` snapshot), so memoized template rows re-render only when their own
  // `value` prop changes.
  const onTemplateContentChange = useCallback(
    (usageType: string, content: string) => {
      const current = safeJsonParse<SmsTemplate[]>(getValues(templatesField)) ?? [];
      writeTemplates(
        current.map((template) =>
          template.usageType === usageType ? { ...template, content } : template
        )
      );
    },
    [getValues, templatesField, writeTemplates]
  );

  const onAddLanguage = useCallback(
    (languageTag: LanguageTag) => {
      if (languageTag in translations) {
        return;
      }
      writeTranslations({ ...translations, [languageTag]: {} });
    },
    [translations, writeTranslations]
  );

  // Stable across keystrokes within the same language (closes over `selectedLanguage`, not the
  // reactive `translations` snapshot), so memoized translation cells re-render minimally.
  const onTranslationChange = useCallback(
    (key: string, value: string) => {
      const currentTranslations =
        safeJsonParse<TranslationMap>(getValues(TRANSLATIONS_FIELD)) ?? {};
      const currentLanguage = currentTranslations[selectedLanguage] ?? {};
      writeTranslations({
        ...currentTranslations,
        [selectedLanguage]: { ...currentLanguage, [key]: value },
      });
    },
    [getValues, selectedLanguage, writeTranslations]
  );

  return (
    <Provider value={context}>
      <div className={styles.editor}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            {t('connector_details.template_editor.usage_templates')}
          </h3>
          <div className={styles.templates}>
            {templates.map(({ usageType, content }) => (
              <TemplateContentRow
                key={usageType}
                usageType={usageType}
                value={content}
                onContentChange={onTemplateContentChange}
              />
            ))}
          </div>
        </section>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            {t('connector_details.template_editor.translations_title')}
          </h3>
          <LocalizationNav languages={languages} onSelectAdd={onAddLanguage} />
          <TranslationGrid
            keys={allKeys}
            values={translations[selectedLanguage] ?? {}}
            onChange={onTranslationChange}
          />
        </section>
      </div>
    </Provider>
  );
}

export default ConnectorTemplatesEditor;
