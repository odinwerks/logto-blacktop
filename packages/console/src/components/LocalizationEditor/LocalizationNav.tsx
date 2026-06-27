import type { LanguageTag } from '@logto/language-kit';
import { isLanguageTag, languages as uiLanguageNameMapping } from '@logto/language-kit';
import { useContext } from 'react';

import AddLanguageSelector from './AddLanguageSelector';
import LanguageItem from './LanguageItem';
import style from './LocalizationNav.module.scss';
import { LocalizationEditorContext } from './use-localization-editor-context';

type Props = {
  readonly languages: LanguageTag[];
  readonly onSelectAdd?: (languageTag: LanguageTag) => void | Promise<void>;
  readonly addableOptions?: LanguageTag[];
  /**
   * `'sidebar'` (default) renders the vertical 185px language rail used inside the modal
   * `LocalizationEditor`. `'inline'` renders a horizontal pill bar that wraps, used by the inline
   * `ConnectorTemplatesEditor` so the inline editor does not reuse the modal's narrow rail.
   */
  readonly variant?: 'sidebar' | 'inline';
};

function LocalizationNav({ languages, onSelectAdd, addableOptions, variant = 'sidebar' }: Props) {
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
      {onSelectAdd && <AddLanguageSelector options={languageOptions} onSelect={onAddLanguage} />}
      <div className={style.languageItemList}>
        {languages.map((languageTag) => (
          <LanguageItem
            key={languageTag}
            languageTag={languageTag}
            isSelected={selectedLanguage === languageTag}
            onClick={() => {
              onSwitchLanguage(languageTag);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default LocalizationNav;
