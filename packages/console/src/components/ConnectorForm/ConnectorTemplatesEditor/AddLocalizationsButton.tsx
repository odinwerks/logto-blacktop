import type { LanguageTag } from '@logto/language-kit';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Plus from '@/assets/icons/plus.svg?react';
import SearchIcon from '@/assets/icons/search.svg?react';
import Button from '@/ds-components/Button';
import DynamicT from '@/ds-components/DynamicT';
import OverlayScrollbar from '@/ds-components/OverlayScrollbar';
import TextInput from '@/ds-components/TextInput';
import { onKeyDownHandler } from '@/utils/a11y';

import styles from './AddLocalizationsButton.module.scss';

/** A selectable language entry, mirroring the shape used by the ds-components `Select`. */
type Option = {
  readonly value: LanguageTag;
  readonly title: string;
};

type Props = {
  /** Languages not yet configured (the host excludes already-present languages). */
  readonly options: readonly Option[];
  /** Invoked with the chosen language as soon as it is clicked in the list. */
  readonly onApply: (languageTag: LanguageTag) => void;
  readonly isDisabled?: boolean;
};

/**
 * "Add localizations" trigger button that opens a small popover containing a searchable language
 * picker. Clicking a language immediately applies it: the host adds the language, the popover
 * closes, and the translation modal opens for that language.
 *
 * The picker is a self-contained searchable list (not the ds-components `Select`) so the whole
 * popover — trigger, search box, dropdown list — lives inside one container node. A document-level
 * click-outside listener can therefore close the popover without conflicting with a portaled
 * dropdown (the `Select`/`Dropdown` render their items through a `react-modal` portal that lives
 * outside the container, which would race against a competing outside-click handler). The visual
 * pattern mirrors {@link AddLanguageSelector}.
 */
function AddLocalizationsButton({ options, onApply, isDisabled }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchInputValue('');
  }, []);

  const filteredOptions = searchInputValue
    ? options.filter(({ value, title }) => {
        const query = searchInputValue.toLocaleLowerCase();

        return (
          value.toLocaleLowerCase().includes(query) || title.toLocaleLowerCase().includes(query)
        );
      })
    : options;

  // While the popover is open, focus the search box and dismiss on an outside click. The listener
  // is attached in the effect (not inline) so the document reference is cleaned up on close/unmount.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();

    const clickOutsideHandler = ({ target }: MouseEvent) => {
      if (target instanceof HTMLElement && !containerRef.current?.contains(target)) {
        close();
      }
    };

    document.addEventListener('mousedown', clickOutsideHandler);

    return () => {
      document.removeEventListener('mousedown', clickOutsideHandler);
    };
  }, [isOpen, close]);

  // Apply immediately on click: add the language, close the popover (the host opens the modal).
  const handleSelect = useCallback(
    (languageTag: LanguageTag) => {
      onApply(languageTag);
      close();
    },
    [onApply, close]
  );

  return (
    <div ref={containerRef} className={styles.container}>
      <Button
        className={styles.trigger}
        icon={<Plus />}
        title="connector_details.template_editor.add_localizations"
        type="outline"
        size="medium"
        data-testid="add-localizations-trigger"
        disabled={isDisabled}
        onClick={() => {
          setIsOpen((previous) => !previous);
        }}
      />
      {isOpen && (
        <div className={styles.popover}>
          <TextInput
            ref={searchInputRef}
            className={styles.search}
            icon={<SearchIcon />}
            placeholder={t('general.type_to_search')}
            value={searchInputValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setSearchInputValue(event.target.value);
            }}
          />
          <OverlayScrollbar className={styles.dropdown}>
            {filteredOptions.length === 0 ? (
              <div className={styles.placeholder}>
                <DynamicT forKey="errors.empty" />
              </div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  role="tab"
                  tabIndex={0}
                  className={styles.item}
                  onKeyDown={onKeyDownHandler(() => {
                    handleSelect(option.value);
                  })}
                  onClick={() => {
                    handleSelect(option.value);
                  }}
                >
                  <div className={styles.languageName}>{option.title}</div>
                  <div className={styles.languageTag}>{option.value}</div>
                </div>
              ))
            )}
          </OverlayScrollbar>
        </div>
      )}
    </div>
  );
}

export default AddLocalizationsButton;
