import type { LanguageTag } from '@logto/language-kit';
import { languages } from '@logto/language-kit';
import classNames from 'classnames';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import DeleteIcon from '@/assets/icons/delete.svg?react';
import IconButton from '@/ds-components/IconButton';
import { onKeyDownHandler } from '@/utils/a11y';

import style from './LanguageItem.module.scss';

type Props = {
  readonly languageTag: LanguageTag;
  readonly isSelected: boolean;
  readonly onClick: () => void;
  /**
   * Optional per-pill delete handler. When provided on the inline variant, a small trash
   * `IconButton` is rendered at the end of the pill; clicking it deletes this language's
   * translations without also firing the pill's open-grid handler (event propagation is
   * stopped). The sidebar/modal variant never renders the trash even when this is provided.
   */
  readonly onDelete?: () => void;
  /**
   * `'sidebar'` (default) renders the stacked two-line pill used inside the modal
   * `LocalizationEditor`. `'inline'` renders a single-line 38px pill (matching the "+" add button)
   * used by the inline `ConnectorTemplatesEditor` so the pill height matches the inline add control.
   */
  readonly variant?: 'sidebar' | 'inline';
};

function LanguageItem({ languageTag, isSelected, onClick, onDelete, variant = 'sidebar' }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected) {
      itemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected]);

  // Always invoke `onClick` even when the pill is already selected: selecting the same language is
  // a no-op for `setSelectedLanguage` (same primitive value), and the inline connector-templates
  // editor relies on a click always firing to surface its always-visible translation grid.
  const handleSelect = () => {
    onClick();
  };

  // The trash deletes this language's translations; stop propagation so the surrounding
  // pill's select handler (which would re-select the same language) is not invoked.
  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    onDelete?.();
  };

  return (
    <div
      ref={itemRef}
      role="tab"
      tabIndex={0}
      aria-selected={isSelected}
      className={classNames(
        style.languageItem,
        variant === 'inline' && style.inline,
        isSelected && style.selected
      )}
      onClick={handleSelect}
      onKeyDown={onKeyDownHandler(handleSelect)}
    >
      <div className={style.languageName}>{languages[languageTag]}</div>
      <div className={style.languageTag}>{languageTag}</div>
      {variant === 'inline' && onDelete && (
        <IconButton
          size="small"
          className={style.deleteButton}
          aria-label={t('connector_details.template_editor.delete_language')}
          onClick={handleDelete}
        >
          <DeleteIcon />
        </IconButton>
      )}
    </div>
  );
}

export default LanguageItem;
