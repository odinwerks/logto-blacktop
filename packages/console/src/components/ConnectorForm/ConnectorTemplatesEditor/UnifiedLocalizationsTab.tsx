import {
  isLanguageTag,
  languages as uiLanguageNameMapping,
  type LanguageTag,
} from '@logto/language-kit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import LanguageItem from '@/components/LocalizationEditor/LanguageItem';

import AddLocalizationsButton from './AddLocalizationsButton';
import UnifiedLanguageDictEditor from './UnifiedLanguageDictEditor';
import styles from './index.module.scss';
import type { UnifiedTranslations } from './unified';

/** A per-language dictionary in the unified translations model. */
type LanguageDict = Record<string, string>;

type Props = {
  readonly translations: UnifiedTranslations;
  readonly onChange: (next: UnifiedTranslations) => void;
};

/**
 * Derives the sorted, validated language tags present in a unified translations table. The sibling
 * `deriveLanguages` helper is typed for a flat `TranslationMap` (`Record<string, Record<string,
 * string>>`); the unified table's inner value is a `PerTypeString`, so the helper is inlined here
 * with the wider `UnifiedTranslations` shape (only the outer language keys matter).
 */
const deriveUnifiedLanguages = (translations: UnifiedTranslations): LanguageTag[] =>
  Object.keys(translations)
    .filter((tag): tag is LanguageTag => isLanguageTag(tag))
    .slice()
    .sort();

/**
 * The Localizations tab of the unified editor: a language-pills row (reusing the shared
 * `LanguageItem` + `AddLocalizationsButton`) plus an inline per-type grid editor for the selected
 * language's `Record<key, PerTypeString>` dictionary ({@link UnifiedLanguageDictEditor}).
 *
 * At compile time the compiler flattens each language's per-type values into the namespaced
 * `{{t.K__T}}` runtime keys (see `flattenTranslationsForType`), so per-type localized overrides
 * here are honored at send time with zero send-path changes.
 */
function UnifiedLocalizationsTab({ translations, onChange }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const languages = useMemo(() => deriveUnifiedLanguages(translations), [translations]);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageTag | undefined>(languages[0]);

  // Keep the selected language valid as the configured language set changes.
  useEffect(() => {
    if (languages.length > 0 && (!selectedLanguage || !languages.includes(selectedLanguage))) {
      setSelectedLanguage(languages[0]);
    }

    if (languages.length === 0) {
      setSelectedLanguage(undefined);
    }
  }, [languages, selectedLanguage]);

  const availableLanguageOptions = useMemo(
    () =>
      Object.keys(uiLanguageNameMapping)
        .filter(
          (languageTag): languageTag is LanguageTag =>
            isLanguageTag(languageTag) && !languages.includes(languageTag)
        )
        .map((languageTag) => ({ value: languageTag, title: uiLanguageNameMapping[languageTag] })),
    [languages]
  );

  const selectedDict = useMemo<LanguageDict>(
    () => (selectedLanguage ? (translations[selectedLanguage] ?? {}) : {}),
    [translations, selectedLanguage]
  );

  const onAddLanguage = useCallback(
    (languageTag: LanguageTag) => {
      if (languageTag in translations) {
        return;
      }

      onChange({ ...translations, [languageTag]: {} });
      setSelectedLanguage(languageTag);
    },
    [translations, onChange]
  );

  const onDeleteLanguage = useCallback(
    (languageTag: LanguageTag) => {
      const next = Object.fromEntries(
        Object.entries(translations).filter(([existing]) => existing !== languageTag)
      );
      onChange(next);
      setSelectedLanguage(deriveUnifiedLanguages(next)[0]);
    },
    [translations, onChange]
  );

  const onDictChange = useCallback(
    (next: LanguageDict) => {
      if (!selectedLanguage) {
        return;
      }

      onChange({ ...translations, [selectedLanguage]: next });
    },
    [translations, onChange, selectedLanguage]
  );

  return (
    <div className={styles.section}>
      <div className={styles.languagesRow}>
        {languages.map((languageTag) => (
          <LanguageItem
            key={languageTag}
            languageTag={languageTag}
            isSelected={selectedLanguage === languageTag}
            variant="inline"
            onClick={() => {
              setSelectedLanguage(languageTag);
            }}
            onDelete={() => {
              onDeleteLanguage(languageTag);
            }}
          />
        ))}
        <AddLocalizationsButton options={availableLanguageOptions} onApply={onAddLanguage} />
      </div>
      {selectedLanguage ? (
        <UnifiedLanguageDictEditor
          languageTag={selectedLanguage}
          dict={selectedDict}
          onChange={onDictChange}
        />
      ) : (
        <div className={styles.note}>{t('connector_details.unified_editor.no_languages')}</div>
      )}
    </div>
  );
}

export default UnifiedLocalizationsTab;
