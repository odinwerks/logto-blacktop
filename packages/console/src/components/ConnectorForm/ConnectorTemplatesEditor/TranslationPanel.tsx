import type { LanguageTag } from '@logto/language-kit';
import { languages as uiLanguageNameMapping } from '@logto/language-kit';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import TranslationGrid from './TranslationGrid';
import styles from './index.module.scss';

type Props = {
  /** The language whose translations are being edited; shown as the panel header (when visible). */
  readonly languageTag: LanguageTag;
  /** Translation keys surfaced in the grid (extracted from `{{t.key}}` placeholders + saved keys). */
  readonly keys: readonly string[];
  /** Saved values for {@link languageTag}; missing keys default to empty. */
  readonly values: Record<string, string>;
  readonly onChange: (key: string, value: string) => void;
  /**
   * Whether to render the panel's language-name header. Defaults to `true` for the inline host.
   * The translation editor modal passes `false` because the modal title already carries the
   * language name, avoiding a redundant duplicate header.
   */
  readonly isHeaderVisible?: boolean;
};

/**
 * Always-visible per-language translations panel: an optional header carrying the selected
 * language's name, followed by the key/value {@link TranslationGrid} (or an empty-state hint when no
 * `{{t.key}}` placeholders exist yet). The panel renders whenever a language is selected — there is
 * no open/close or dismiss behavior. Extracted from {@link ConnectorTemplatesEditor} so the host
 * stays under the file line-count limit, and reused inside the translation editor modal (with
 * `isHeaderVisible={false}`) so the modal title is the single source of the language name.
 */
function TranslationPanel({ languageTag, keys, values, onChange, isHeaderVisible = true }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  return (
    <section className={styles.section}>
      {isHeaderVisible && (
        <div className={styles.translationsPanelHeader}>
          <span className={styles.translationsPanelTitle}>
            {uiLanguageNameMapping[languageTag]}
          </span>
        </div>
      )}
      {keys.length > 0 ? (
        <TranslationGrid keys={keys} values={values} onChange={onChange} />
      ) : (
        <div className={styles.emptyTranslations}>
          {t('connector_details.template_editor.no_translation_keys')}
        </div>
      )}
    </section>
  );
}

export default memo(TranslationPanel);
