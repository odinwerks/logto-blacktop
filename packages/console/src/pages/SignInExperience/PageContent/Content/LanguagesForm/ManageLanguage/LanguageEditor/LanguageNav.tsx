import type { LanguageTag } from '@logto/language-kit';
import { isLanguageTag, languages as uiLanguageNameMapping } from '@logto/language-kit';
import { useContext } from 'react';

import AddLanguageSelector from '@/components/LocalizationEditor/AddLanguageSelector';
import LanguageItem from '@/components/LocalizationEditor/LanguageItem';
import { LocalizationEditorContext } from '@/components/LocalizationEditor/use-localization-editor-context';
import useUiLanguages from '@/hooks/use-ui-languages';

import style from './LanguageNav.module.scss';

function LanguageNav() {
  const { languages, addLanguage } = useUiLanguages();

  const {
    selectedLanguage,
    isDirty,
    setConfirmationState,
    setSelectedLanguage,
    setPreSelectedLanguage,
    setPreAddedLanguage,
  } = useContext(LocalizationEditorContext);

  const languageOptions = Object.keys(uiLanguageNameMapping).filter(
    (languageTag): languageTag is LanguageTag =>
      isLanguageTag(languageTag) && !languages.includes(languageTag)
  );

  const onAddLanguage = async (languageTag: LanguageTag) => {
    if (isDirty) {
      setPreAddedLanguage(languageTag);
      setConfirmationState('try-add-language');

      return;
    }

    await addLanguage(languageTag);
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
    <div className={style.languageNav}>
      <AddLanguageSelector options={languageOptions} onSelect={onAddLanguage} />
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

export default LanguageNav;
