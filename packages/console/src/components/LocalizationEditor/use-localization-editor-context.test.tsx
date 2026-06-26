import { act, renderHook } from '@testing-library/react';
import { useContext } from 'react';

import useLocalizationEditorContext, {
  LocalizationEditorContext,
} from './use-localization-editor-context';

describe('useLocalizationEditorContext', () => {
  it('exposes a React context object with a Provider and Consumer', () => {
    expect(LocalizationEditorContext).toBeDefined();
    expect(LocalizationEditorContext.Provider).toBeDefined();
    expect(LocalizationEditorContext.Consumer).toBeDefined();
  });

  it('returns the default context state on first render', () => {
    const { result } = renderHook(() => useLocalizationEditorContext());

    expect(result.current.context.selectedLanguage).toBe('en');
    expect(result.current.context.isDirty).toBe(false);
    expect(result.current.context.confirmationState).toBe('none');
    expect(result.current.context.preSelectedLanguage).toBeUndefined();
    expect(result.current.context.preAddedLanguage).toBeUndefined();
    expect(result.current.Provider).toBe(LocalizationEditorContext.Provider);
  });

  it('updates the selected language via the setter', () => {
    const { result } = renderHook(() => useLocalizationEditorContext());

    act(() => {
      result.current.context.setSelectedLanguage('zh-CN');
    });

    expect(result.current.context.selectedLanguage).toBe('zh-CN');
  });

  it('tracks dirty state, confirmation state, and pending selections', () => {
    const { result } = renderHook(() => useLocalizationEditorContext());

    act(() => {
      result.current.context.setIsDirty(true);
      result.current.context.setConfirmationState('try-switch-language');
      result.current.context.setPreSelectedLanguage('fr');
      result.current.context.setPreAddedLanguage('de');
    });

    expect(result.current.context.isDirty).toBe(true);
    expect(result.current.context.confirmationState).toBe('try-switch-language');
    expect(result.current.context.preSelectedLanguage).toBe('fr');
    expect(result.current.context.preAddedLanguage).toBe('de');
  });

  it('produces a new context reference when a tracked value changes', () => {
    const { result } = renderHook(() => useLocalizationEditorContext());
    const firstContext = result.current.context;

    act(() => {
      result.current.context.setIsDirty(true);
    });

    expect(result.current.context).not.toBe(firstContext);
  });

  it('provides a safe default when consumed without a provider', () => {
    const { result } = renderHook(() => useContext(LocalizationEditorContext));

    expect(result.current.selectedLanguage).toBe('en');
    expect(result.current.isDirty).toBe(false);
    expect(result.current.confirmationState).toBe('none');

    // Default setters are no-ops; calling them must not throw or change values.
    act(() => {
      result.current.setSelectedLanguage('zh-CN');
      result.current.setIsDirty(true);
      result.current.setConfirmationState('try-close');
    });

    expect(result.current.selectedLanguage).toBe('en');
    expect(result.current.isDirty).toBe(false);
    expect(result.current.confirmationState).toBe('none');
  });
});
