import type { ConnectorConfigFormItem, ConnectorType } from '@logto/connector-kit';
import {
  isLanguageTag,
  languages as uiLanguageNameMapping,
  type LanguageTag,
} from '@logto/language-kit';
import { deduplicate } from '@silverhand/essentials';
import { useCallback, useEffect, useMemo } from 'react';
import { useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import AddLanguageSelector from '@/components/LocalizationEditor/AddLanguageSelector';
import LocalizationNav from '@/components/LocalizationEditor/LocalizationNav';
import useLocalizationEditorContext from '@/components/LocalizationEditor/use-localization-editor-context';
import Textarea from '@/ds-components/Textarea';
import type { ConnectorFormType } from '@/types/connector';

import AliasTemplateRow from './AliasTemplateRow';
import DeliveryTemplateRow from './DeliveryTemplateRow';
import EmailTemplateRow, { type EmailContentType } from './EmailTemplateRow';
import TranslationGrid from './TranslationGrid';
import styles from './index.module.scss';
import {
  buildEmptyTemplateRow,
  contentTypeKeyFor,
  deriveEditorMode,
  extractableFieldsFor,
} from './mode';
import {
  ensureAllTemplateTypes,
  extractTranslationKeys,
  safeJsonParse,
  safeJsonStringify,
  sortTemplatesByFillStatus,
} from './utils';

type Props = {
  /** The `templates`/`deliveries` form item this editor is rendered for. */
  readonly formItem: ConnectorConfigFormItem;
  /** The owning connector's type; drives SMS vs. email rendering. */
  readonly connectorType: ConnectorType;
};

/**
 * A connector template row in its normalized, mode-agnostic form. `usageType` is always present;
 * the remaining fields are provider-specific (`content`, `subject`, `contentType`/`type`,
 * `html`/`text`, `templateAlias`, …) and are read/written verbatim by the editor.
 */
type TemplateRow = { usageType: string } & Record<string, unknown>;

type TranslationMap = Record<string, Record<string, string>>;

// The sibling `translations` form item is rendered as `null` by `ConfigFormFields` and owned
// entirely by this editor, so its react-hook-form path is fixed.
const TRANSLATIONS_FIELD: FieldPath<ConnectorFormType> = 'formConfig.translations';

/**
 * Inline, mode-aware connector templates editor shared by SMS and email connectors.
 *
 * Owns two JSON form fields on the connector config form:
 * - `formConfig.templates` (or `formConfig.deliveries` for Mailgun) — the provider-specific
 *   template rows. Localizable string fields (`content`, `subject`, `html`, `text`) support
 *   `{{code}}` payload handlebars and `{{t.key}}` localization placeholders (resolved at send time
 *   via `getLocalizedPayload` + `replaceSendMessageHandlebars`).
 * - `formConfig.translations` — a `Record<LanguageTag, Record<string, string>>` dictionary
 *   consumed by `getLocalizedPayload`.
 *
 * The row shape is derived from the connector type + form-item key + row contents (see
 * {@link deriveEditorMode}): SMS, common email, Mailgun `deliveries`, or Postmark aliases.
 * Auto-detects every supported {@link TemplateType} (see {@link ensureAllTemplateTypes}) so the
 * editor always shows the full delivery-template set, without polluting the saved config (synthetic
 * rows persist only once edited).
 *
 * Layout (compact, inline within the owning "Parameter configuration" card — no nested cards):
 * - "Template translations available": language pills + Add-language control (or a prominent
 *   "Add localizations" button when no language exists yet).
 * - "Delivery templates": a single bordered container holding every usage type, each separated by a
 *   divider. Email content uses a `CodeEditor`; SMS uses a `Textarea`; `Subject` is email-only.
 * - The per-language translation grid appears below the templates box once a language is selected.
 *
 * Changes are written back immediately as pretty-printed JSON via react-hook-form's `setValue`
 * (marking the form dirty). Reuses the Phase 0 `LocalizationNav` (inline bar) +
 * `useLocalizationEditorContext` shell instead of the full modal `LocalizationEditor`.
 */
function ConnectorTemplatesEditor({ formItem, connectorType }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { watch, getValues, setValue } = useFormContext<ConnectorFormType>();
  const { context, Provider } = useLocalizationEditorContext();
  const { selectedLanguage, setSelectedLanguage } = context;

  // Resolve the templates/deliveries field path from the form item this editor was rendered for
  // (`formItem.key` is `'templates'` or `'deliveries'`). The cast bridges react-hook-form's literal
  // `FieldPath` union with a runtime-derived key.
  const templatesField = useMemo(
    // eslint-disable-next-line no-restricted-syntax -- `formItem.key` is a runtime string; react-hook-form's `FieldPath` is a literal union that cannot be derived from a dynamic key without a cast.
    () => `formConfig.${formItem.key}` as FieldPath<ConnectorFormType>,
    [formItem.key]
  );

  const templatesRaw = watch(templatesField);
  const translationsRaw = watch(TRANSLATIONS_FIELD);

  const isDeliveries = formItem.key === 'deliveries';

  // Parse raw JSON into rows. `deliveries` is a `Record<usageType, config>`; normalize it to a row
  // array for rendering and write it back as a record on edit (the `as` shape asserts live inside
  // `safeJsonParse`, mirroring the SMS precedent).
  const parsedRows = useMemo<TemplateRow[]>(() => {
    if (isDeliveries) {
      const record = safeJsonParse<Record<string, Record<string, unknown>>>(templatesRaw) ?? {};

      return Object.entries(record).map(([usageType, config]) => ({ usageType, ...config }));
    }

    return safeJsonParse<TemplateRow[]>(templatesRaw) ?? [];
  }, [templatesRaw, isDeliveries]);

  const mode = useMemo(
    () => deriveEditorMode(connectorType, formItem.key, parsedRows),
    [connectorType, formItem.key, parsedRows]
  );

  // The content-type field key (`contentType` for SMTP, `type` for SendGrid/MailJunky) is uniform
  // across a connector's rows; derive it once from the configured rows so the selector writes back
  // to the correct key. Computed from `parsedRows` (not the auto-detected display rows) so a
  // connector with no configured rows degrades to "no selector" deterministically.
  const contentTypeKey = useMemo<'contentType' | 'type' | undefined>(
    () => contentTypeKeyFor(parsedRows[0]),
    [parsedRows]
  );

  // Display rows: the configured rows plus an empty row for every supported template type that the
  // connector does not yet define (see {@link ensureAllTemplateTypes}). Synthetic rows are
  // display-only until one of their fields is edited, so existing configs are never polluted.
  const templates = useMemo<TemplateRow[]>(
    () =>
      ensureAllTemplateTypes(parsedRows, (usageType) =>
        buildEmptyTemplateRow(usageType, mode, contentTypeKey)
      ),
    [parsedRows, mode, contentTypeKey]
  );

  // Render order: filled templates surfaced first, `Generic` parked between filled and empty, and
  // empty (unused) templates pushed last — so the templates actually in use read at the top of the
  // box. Applied only for rendering; the canonical `templates` order still feeds
  // `extractTranslationKeys`/`allKeys` so translation-key first-seen order is unaffected.
  const sortedTemplates = useMemo(
    () => sortTemplatesByFillStatus(templates, mode),
    [templates, mode]
  );

  const translations = useMemo<TranslationMap>(
    () => safeJsonParse<TranslationMap>(translationsRaw) ?? {},
    [translationsRaw]
  );

  // Keys surfaced in the translations grid: every `{{t.key}}` referenced by any template's
  // localizable fields, unioned with every key already defined in any language's dictionary.
  // Sorted for stable ordering.
  const allKeys = useMemo(() => {
    const fromTemplates = extractTranslationKeys(templates, extractableFieldsFor(mode));
    const fromTranslations = Object.values(translations).flatMap((dictionary) =>
      Object.keys(dictionary)
    );

    return deduplicate([...fromTemplates, ...fromTranslations])
      .slice()
      .sort();
  }, [templates, translations, mode]);

  const languages = useMemo<LanguageTag[]>(
    () =>
      deduplicate(Object.keys(translations))
        .filter((languageTag): languageTag is LanguageTag => isLanguageTag(languageTag))
        .slice()
        .sort(),
    [translations]
  );

  // Keep a language selected so the translation grid is visible whenever languages exist: when the
  // (context-default) selected language is not among the configured languages, fall back to the
  // first one. Runs once per language-set change; idempotent.
  useEffect(() => {
    if (languages.length > 0 && !languages.includes(selectedLanguage)) {
      const firstLanguage = languages[0];

      if (firstLanguage) {
        setSelectedLanguage(firstLanguage);
      }
    }
  }, [languages, selectedLanguage, setSelectedLanguage]);

  const writeTemplates = useCallback(
    (next: unknown) => {
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

  // Generic, stable single-field write-back. Reads the latest form value via `getValues` instead of
  // closing over the reactive `templates` snapshot, so memoized rows re-render only when their own
  // value prop changes. Mailgun `deliveries` writes back to the record (preserving all other keys);
  // array connectors write back to the matching row, appending a freshly-built empty row when the
  // edited usage type was auto-detected (synthetic) and not yet in the persisted config.
  const updateTemplateField = useCallback(
    (usageType: string, field: string, value: string) => {
      if (isDeliveries) {
        const current =
          safeJsonParse<Record<string, Record<string, unknown>>>(getValues(templatesField)) ?? {};
        // Seed a never-persisted deliveries usage type with its empty Mailgun shape (no `usageType`
        // key — the record is keyed by it) so the row's optional fields stay visible after edit.
        const currentRow = usageType in current ? current[usageType] : { subject: '', html: '' };

        writeTemplates({ ...current, [usageType]: { ...currentRow, [field]: value } });

        return;
      }

      const current = safeJsonParse<TemplateRow[]>(getValues(templatesField)) ?? [];
      // Update matching row(s) in place, or — when the edited usage type was auto-detected
      // (synthetic) — append a provider-appropriate empty row carrying the connector's
      // content-type (if any) so the field is consistent on re-render.
      writeTemplates(
        current.some((row) => row.usageType === usageType)
          ? current.map((row) => (row.usageType === usageType ? { ...row, [field]: value } : row))
          : [
              ...current,
              { ...buildEmptyTemplateRow(usageType, mode, contentTypeKey), [field]: value },
            ]
      );
    },
    [getValues, templatesField, writeTemplates, isDeliveries, mode, contentTypeKey]
  );

  // Per-field stable change handlers (a single memoized object keyed by field, closing over only
  // the stable `updateTemplateField`), so memoized rows see referentially-stable callbacks across
  // keystrokes. `onContentTypeChange` has a distinct signature (it also carries the field key) so
  // it stays standalone.
  const fieldHandlers = useMemo(() => {
    const handler = (field: string) => (usageType: string, value: string) => {
      updateTemplateField(usageType, field, value);
    };

    return {
      content: handler('content'),
      subject: handler('subject'),
      html: handler('html'),
      text: handler('text'),
      alias: handler('templateAlias'),
    };
  }, [updateTemplateField]);

  const onContentTypeChange = useCallback(
    (usageType: string, key: 'contentType' | 'type', contentType: EmailContentType) => {
      updateTemplateField(usageType, key, contentType);
    },
    [updateTemplateField]
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

  const renderTemplateRows = () => {
    if (mode === 'sms') {
      return sortedTemplates.map(({ usageType, content }) => (
        <div key={usageType} className={styles.templateRow}>
          <div className={styles.templateRowHeader}>
            <span className={styles.usageType}>{usageType}</span>
            <div className={styles.headerDivider} />
          </div>
          <Textarea
            rows={2}
            className={styles.translationValue}
            value={typeof content === 'string' ? content : ''}
            placeholder={t('connector_details.template_editor.content_placeholder')}
            onChange={(event) => {
              fieldHandlers.content(usageType, event.currentTarget.value);
            }}
          />
        </div>
      ));
    }

    if (mode === 'email-alias') {
      return sortedTemplates.map(({ usageType, templateAlias }) => (
        <AliasTemplateRow
          key={usageType}
          usageType={usageType}
          templateAlias={typeof templateAlias === 'string' ? templateAlias : ''}
          onAliasChange={fieldHandlers.alias}
        />
      ));
    }

    if (mode === 'email-deliveries') {
      return sortedTemplates.map((row) => (
        <DeliveryTemplateRow
          key={row.usageType}
          usageType={row.usageType}
          subject={typeof row.subject === 'string' ? row.subject : ''}
          html={typeof row.html === 'string' ? row.html : ''}
          text={typeof row.text === 'string' ? row.text : ''}
          isTemplateVariant={'template' in row}
          showSubject={typeof row.subject === 'string'}
          showText={typeof row.text === 'string'}
          onSubjectChange={fieldHandlers.subject}
          onHtmlChange={fieldHandlers.html}
          onTextChange={fieldHandlers.text}
        />
      ));
    }

    // Email-content
    return sortedTemplates.map((row) => {
      const rawContentType = contentTypeKey ? row[contentTypeKey] : undefined;

      return (
        <EmailTemplateRow
          key={row.usageType}
          usageType={row.usageType}
          subject={typeof row.subject === 'string' ? row.subject : ''}
          content={typeof row.content === 'string' ? row.content : ''}
          contentType={
            rawContentType === 'text/plain' || rawContentType === 'text/html'
              ? rawContentType
              : 'text/html'
          }
          contentTypeKey={contentTypeKey ?? 'contentType'}
          showContentType={Boolean(contentTypeKey)}
          onSubjectChange={fieldHandlers.subject}
          onContentChange={fieldHandlers.content}
          onContentTypeChange={onContentTypeChange}
        />
      );
    });
  };

  const hasSelectedLanguage = languages.includes(selectedLanguage);

  return (
    <Provider value={context}>
      <div className={styles.editor}>
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>
            {t('connector_details.template_editor.template_translations_available')}
          </h4>
          {languages.length === 0 ? (
            <div className={styles.emptyAddLanguage}>
              <AddLanguageSelector
                // Every UI language not already present (mirrors LocalizationNav's computation).
                options={Object.keys(uiLanguageNameMapping).filter(
                  (languageTag): languageTag is LanguageTag =>
                    isLanguageTag(languageTag) && !languages.includes(languageTag)
                )}
                buttonTitle="connector_details.template_editor.add_localizations"
                onSelect={(languageTag) => {
                  onAddLanguage(languageTag);
                  setSelectedLanguage(languageTag);
                }}
              />
            </div>
          ) : (
            <LocalizationNav variant="inline" languages={languages} onSelectAdd={onAddLanguage} />
          )}
        </section>
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>
            {t('connector_details.template_editor.delivery_templates')}
          </h4>
          <div className={styles.templates}>{renderTemplateRows()}</div>
        </section>
        {hasSelectedLanguage &&
          (allKeys.length > 0 ? (
            <TranslationGrid
              keys={allKeys}
              values={translations[selectedLanguage] ?? {}}
              onChange={onTranslationChange}
            />
          ) : (
            <div className={styles.emptyTranslations}>
              {t('connector_details.template_editor.no_translation_keys')}
            </div>
          ))}
      </div>
    </Provider>
  );
}

export default ConnectorTemplatesEditor;
