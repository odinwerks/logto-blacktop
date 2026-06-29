import type { LanguageTag } from '@logto/language-kit';
import { languages as uiLanguageNameMapping } from '@logto/language-kit';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from 'react-modal';

import { LocalizationEditorContext } from '@/components/LocalizationEditor/use-localization-editor-context';
import Button from '@/ds-components/Button';
import CodeEditor from '@/ds-components/CodeEditor';
import DangerousRaw from '@/ds-components/DangerousRaw';
import ModalLayout from '@/ds-components/ModalLayout';
import TabNav, { TabNavItem } from '@/ds-components/TabNav';
import modalStyles from '@/scss/modal.module.scss';

import styles from './TranslationEditorModal.module.scss';
import TranslationPanel from './TranslationPanel';
import type { TranslationsParseResult } from './utils';
import { mergeTranslations, parseTranslationsJson, serializeTranslations } from './utils';

type Props = {
  readonly languageTag: LanguageTag;
  /** Template-derived keys (host `allKeys`). Union'd with draft keys so JSON-pasted keys surface. */
  readonly keys: readonly string[];
  /** Live seed for the draft (translations[languageTag] ?? {}). Read once on mount. */
  readonly values: Record<string, string>;
  /** Commit the draft for `languageTag` back into the form field and close. */
  readonly onApply: (languageTag: LanguageTag, draft: Record<string, string>) => void;
  /** Request close (X / Esc / overlay). Host decides the dirty-confirm. */
  readonly onRequestClose: () => void;
};

type Mode = 'form' | 'json';

type JsonErrorKey = Extract<TranslationsParseResult, { success: false }>['errorKey'];

// Maps the parser's structured `errorKey` to the user-facing i18n key. Kept as a lookup so the
// parser stays a pure function while the modal owns presentation. `as const` preserves the literal
// key union so `t()` accepts it (a generic `string` would not typecheck against `TFuncKey`).
const errorKeyToPhraseKey = {
  invalid_json_format: 'connector_details.template_editor.invalid_json_format',
  json_must_be_object: 'connector_details.template_editor.json_must_be_object',
  json_values_must_be_strings: 'connector_details.template_editor.json_values_must_be_strings',
} as const;

/**
 * A draft-and-apply modal for editing one language's translation dictionary with a Form / JSON
 * toggle.
 *
 * Single source of truth: the local `draft` (seeded from `values` on mount; the modal is
 * conditionally rendered by the host so each open reseeds cleanly). The JSON editor's text is a
 * derived buffer:
 *
 * - **Form edits** mutate `draft` only; an effect re-derives `jsonText` from the draft while in Form
 *   mode (so switching to JSON always reflects the latest form values).
 * - **Switch Form → JSON**: the buffer is explicitly re-seeded from the draft, then the mode flips.
 *   The re-derivation effect does not run while in JSON mode, so the user's typing is never
 *   clobbered.
 * - **JSON typing** updates `jsonText` only and live-parses to set/clear `jsonError`; the draft and
 *   the form field are never touched from JSON mode.
 * - **Switch JSON → Form**: the buffer is parsed and merged into the draft on success (the effect
 *   re-syncs `jsonText`); on failure the switch is blocked and the error stays surfaced.
 * - **Apply** (footer) runs the JSON→Form parse+merge first when in JSON mode (invalid JSON blocks
 *   Apply and keeps the modal open), then commits the draft to the form via `onApply`.
 *
 * Closing (X / Esc / overlay) is routed through `onRequestClose`; the host surfaces a dirty-confirm
 * (`ConfirmModal`) when the draft has unsaved changes, so the modal itself stays open during the
 * confirm. `isDirty` is mirrored into the shared `LocalizationEditorContext`.
 */
function TranslationEditorModal({ languageTag, keys, values, onApply, onRequestClose }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { setIsDirty } = useContext(LocalizationEditorContext);

  const [draft, setDraft] = useState<Record<string, string>>(() => values);
  const [mode, setMode] = useState<Mode>('form');
  const [jsonText, setJsonText] = useState<string>(() => serializeTranslations(values));
  const [jsonErrorKey, setJsonErrorKey] = useState<JsonErrorKey>();

  // Rule 1: while in Form mode, keep the JSON buffer derived from the draft so switching to JSON
  // always shows the latest form values (and a stale JSON buffer from a previous JSON session can
  // never leak in). Does not run while in JSON mode, so the user's in-progress typing is preserved.
  useEffect(() => {
    if (mode === 'form') {
      setJsonText(serializeTranslations(draft));
    }
  }, [draft, mode]);

  // Union the template-derived keys with the draft's own keys so a key pasted via JSON (that no
  // template references yet) still appears as its own row in the Form grid, sorted for stable order.
  const gridKeys = useMemo(
    () => [...new Set([...keys, ...Object.keys(draft)])].slice().sort(),
    [keys, draft]
  );

  // Resolve the parser's `errorKey` to a user-facing message via the `as const` lookup. Because the
  // lookup keys are literal i18n leaf keys, `t()` resolves each to a `string` directly, satisfying
  // the `CodeEditor` `error?: string | boolean` prop without a cast.
  const jsonErrorMessage = jsonErrorKey ? t(errorKeyToPhraseKey[jsonErrorKey]) : undefined;

  // Live-parse JSON as the user types so the error surfaces immediately and Apply is gated. The
  // draft is never touched from JSON mode (per the single-source-of-truth rule).
  const onJsonChange = useCallback(
    (next: string) => {
      setJsonText(next);
      setIsDirty(true);
      const result = parseTranslationsJson(next);

      setJsonErrorKey(result.success ? undefined : result.errorKey);
    },
    [setIsDirty]
  );

  const onFormChange = useCallback(
    (key: string, value: string) => {
      setDraft((previous) => ({ ...previous, [key]: value }));
      setIsDirty(true);
    },
    [setIsDirty]
  );

  // Rule 2: Form → JSON re-seeds the JSON buffer from the latest draft (guarantees freshness even
  // if a previous JSON buffer existed), clears any stale error, then flips the mode.
  const switchToJson = useCallback(() => {
    setJsonText(serializeTranslations(draft));
    setJsonErrorKey(undefined);
    setMode('json');
  }, [draft]);

  // Rule 4: JSON → Form parses + merges the buffer into the draft on success (the rule-1 effect
  // then re-syncs `jsonText`); on failure the switch is blocked and the error stays surfaced so the
  // user cannot hide invalid JSON by switching tabs.
  const switchToForm = useCallback(() => {
    const result = parseTranslationsJson(jsonText);

    if (!result.success) {
      setJsonErrorKey(result.errorKey);

      return;
    }

    setDraft((previous) => mergeTranslations(previous, result.data));
    setJsonErrorKey(undefined);
    setMode('form');
  }, [jsonText]);

  // Rule 5: Apply commits the draft to the form. In JSON mode the buffer is parsed + merged first
  // (invalid JSON blocks Apply and keeps the modal open with the error surfaced). The merged
  // result is passed directly to `onApply` rather than via `setDraft` (which updates
  // asynchronously) so the host writes the very latest values.
  const onApplyClick = useCallback(() => {
    if (mode === 'json') {
      const result = parseTranslationsJson(jsonText);

      if (!result.success) {
        setJsonErrorKey(result.errorKey);

        return;
      }

      onApply(languageTag, mergeTranslations(draft, result.data));

      return;
    }

    onApply(languageTag, draft);
  }, [draft, jsonText, languageTag, mode, onApply]);

  return (
    <Modal
      shouldCloseOnEsc
      isOpen
      className={modalStyles.content}
      overlayClassName={modalStyles.overlay}
      onRequestClose={onRequestClose}
    >
      <ModalLayout
        size="large"
        title="connector_details.template_editor.edit_translations"
        subtitle={
          <DangerousRaw>
            {t('connector_details.template_editor.translations_for_language', {
              language: uiLanguageNameMapping[languageTag],
            })}
          </DangerousRaw>
        }
        footer={
          <>
            <Button
              title="general.cancel"
              data-testid="translation-modal-cancel"
              onClick={onRequestClose}
            />
            <Button
              type="primary"
              title="connector_details.template_editor.apply"
              data-testid="translation-modal-apply"
              disabled={Boolean(jsonErrorKey)}
              onClick={onApplyClick}
            />
          </>
        }
        className={styles.scrollableBody}
        onClose={onRequestClose}
      >
        <TabNav className={styles.toggle}>
          <TabNavItem isActive={mode === 'form'} onClick={switchToForm}>
            {t('connector_details.template_editor.form_mode')}
          </TabNavItem>
          <TabNavItem isActive={mode === 'json'} onClick={switchToJson}>
            {t('connector_details.template_editor.json_mode')}
          </TabNavItem>
        </TabNav>
        {mode === 'form' ? (
          <TranslationPanel
            isHeaderVisible={false}
            languageTag={languageTag}
            keys={gridKeys}
            values={draft}
            onChange={onFormChange}
          />
        ) : (
          <CodeEditor
            language="json"
            shouldWrap={false}
            value={jsonText}
            error={jsonErrorMessage}
            placeholder={t('connector_details.template_editor.json_merge_hint')}
            onChange={onJsonChange}
          />
        )}
      </ModalLayout>
    </Modal>
  );
}

export default TranslationEditorModal;
