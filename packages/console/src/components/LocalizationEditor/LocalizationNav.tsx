import type { LanguageTag } from '@logto/language-kit';
import { isLanguageTag, languages as uiLanguageNameMapping } from '@logto/language-kit';
import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Select from '@/ds-components/Select';

import AddLanguageSelector from './AddLanguageSelector';
import LanguageItem from './LanguageItem';
import style from './LocalizationNav.module.scss';
import { LocalizationEditorContext } from './use-localization-editor-context';

type Props = {
  readonly languages: LanguageTag[];
  readonly onSelectAdd?: (languageTag: LanguageTag) => void | Promise<void>;
  readonly addableOptions?: LanguageTag[];
  /**
   * Optional per-language "delete translations" handler. When provided, each language pill renders a
   * trash `IconButton` (inline variant only) that invokes this callback for that language — used by
   * the inline `ConnectorTemplatesEditor` to remove the language's translation dictionary. The
   * modal `LocalizationEditor` does not pass this, so its pills render no trash.
   */
  readonly onDeleteLanguage?: (languageTag: LanguageTag) => void;
  /**
   * `'sidebar'` (default) renders the vertical 185px language rail used inside the modal
   * `LocalizationEditor`. `'inline'` renders a horizontal pill bar that wraps, used by the inline
   * `ConnectorTemplatesEditor` so the inline editor does not reuse the modal's narrow rail.
   */
  readonly variant?: 'sidebar' | 'inline';
};

function LocalizationNav({
  languages,
  onSelectAdd,
  addableOptions,
  onDeleteLanguage,
  variant = 'sidebar',
}: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const {
    selectedLanguage,
    isDirty,
    setConfirmationState,
    setSelectedLanguage,
    setPreSelectedLanguage,
    setPreAddedLanguage,
  } = useContext(LocalizationEditorContext);

  const languageOptions =
    addableOptions ??
    Object.keys(uiLanguageNameMapping).filter(
      (languageTag): languageTag is LanguageTag =>
        isLanguageTag(languageTag) && !languages.includes(languageTag)
    );

  const languageSelectOptions = useMemo(
    () =>
      languageOptions.map((languageTag) => ({
        value: languageTag,
        title: uiLanguageNameMapping[languageTag],
      })),
    [languageOptions]
  );

  const onAddLanguage = async (languageTag: LanguageTag) => {
    if (isDirty) {
      setPreAddedLanguage(languageTag);
      setConfirmationState('try-add-language');

      return;
    }

    await onSelectAdd?.(languageTag);
    setSelectedLanguage(languageTag);
  };

  const onSwitchLanguage = (languageTag: LanguageTag) => {
    if (isDirty) {
      setPreSelectedLanguage(languageTag);
      setConfirmationState('try-switch-language');

      return;
    }

    setSelectedLanguage(languageTag);
  };

  return (
    <div className={variant === 'inline' ? style.inlineNav : style.languageNav}>
      {onSelectAdd &&
        (variant === 'inline' ? (
          // Inline variant: a single searchable `Select` (no separate Add button). Selecting a
          // language from the dropdown immediately adds it, selects it, and opens the translations
          // grid. The DS `Select`'s built-in search box (enabled via `isSearchEnabled`) lets the
          // user type to filter languages — surfacing whether the user is on stale code at a glance.
          <Select
            isSearchEnabled
            className={style.inlineAddLanguageSelect}
            placeholder={t('connector_details.template_editor.add_localizations')}
            options={languageSelectOptions}
            value={undefined}
            onChange={(value) => {
              if (value) {
                void onAddLanguage(value);
              }
            }}
          />
        ) : (
          <AddLanguageSelector options={languageOptions} onSelect={onAddLanguage} />
        ))}
      <div className={style.languageItemList}>
        {languages.map((languageTag) => (
          <LanguageItem
            key={languageTag}
            languageTag={languageTag}
            isSelected={selectedLanguage === languageTag}
            variant={variant}
            onClick={() => {
              onSwitchLanguage(languageTag);
            }}
            onDelete={
              onDeleteLanguage
                ? () => {
                    onDeleteLanguage(languageTag);
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

export default LocalizationNav;
