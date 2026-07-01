import { fireEvent, render, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

import UnifiedLocalizationsTab from './UnifiedLocalizationsTab';
import type { UnifiedTranslations } from './unified';

jest.mock('@/consts/env', () => ({
  isProduction: false,
  isCloud: false,
  isProtectedAppLocalDevEnabled: false,
  isProtectedAppEnabled: false,
  adminEndpoint: undefined,
  isDevFeaturesEnabled: true,
  consoleEmbeddedPricingUrl: undefined,
  inkeepApiKey: undefined,
  postHogKey: undefined,
  postHogHost: undefined,
  postHogUiHost: undefined,
  ossSurveyEndpoint: undefined,
}));

jest.mock('@/ds-components/CodeEditor', () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    error,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    error?: string | boolean;
  }) => (
    <textarea
      data-testid="json-editor"
      value={value}
      data-error={error === undefined ? undefined : String(error)}
      onChange={(event) => {
        onChange?.(event.currentTarget.value);
      }}
    />
  ),
}));

i18next.addResourceBundle('en', 'translation', {
  admin_console: {
    general: {
      cancel: 'Cancel',
    },
    connector_details: {
      template_editor: {
        form_mode: 'Form',
        json_mode: 'JSON',
        key: 'Key',
        value: 'Value',
        add_key: 'Add key',
        delete_language: 'Delete language',
        translations_for_language: 'Translations for {{language}}',
      },
      unified_editor: {
        json_merge_hint: 'Paste JSON.',
        invalid_json_format: 'The JSON is not valid.',
        json_must_be_object: 'Must be a JSON object.',
        json_values_must_be_strings: 'Values must be strings.',
        no_languages: 'No languages configured.',
      },
    },
  },
});

function Harness({ initialTranslations }: { readonly initialTranslations: UnifiedTranslations }) {
  const [translations, setTranslations] = useState(initialTranslations);

  return (
    <MemoryRouter>
      <UnifiedLocalizationsTab translations={translations} onChange={setTranslations} />
      <div data-testid="committed-translations">{JSON.stringify(translations)}</div>
    </MemoryRouter>
  );
}

const getCommittedTranslations = (): UnifiedTranslations => {
  const raw = document.querySelector('[data-testid="committed-translations"]')?.textContent ?? '{}';

  return JSON.parse(raw) as UnifiedTranslations;
};

const getJsonEditor = () =>
  document.querySelector<HTMLTextAreaElement>('[data-testid="json-editor"]');

const getTabByText = (text: string) =>
  Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
    tab.textContent?.trim().startsWith(text)
  );

const getLanguagePill = (languageTag: string) =>
  Array.from(document.querySelectorAll('[role="tab"]')).find((tab) => {
    const text = tab.textContent ?? '';
    return text.includes(languageTag) && !['Form', 'JSON'].some((label) => text.includes(label));
  });

const getAddKeyInput = () => document.querySelector<HTMLInputElement>('[placeholder="Add key"]');

describe('<UnifiedLocalizationsTab />', () => {
  it('does not overwrite one language with another when switching languages in Form mode', () => {
    const initial: UnifiedTranslations = {
      en: { greeting: 'Hello' },
      fr: { greeting: 'Bonjour' },
    };

    render(<Harness initialTranslations={initial} />);

    // Edit the value for the default selected language (en) while in Form mode.
    const valueInput = document.querySelector<HTMLInputElement>(
      'table tbody tr td:nth-child(2) input'
    );
    expect(valueInput).not.toBeNull();

    fireEvent.change(valueInput!, { target: { value: 'Hello updated' } });

    // Switch to the fr language pill.
    fireEvent.click(getLanguagePill('fr')!);

    const committed = getCommittedTranslations();

    // Fr should retain its original value; en should be updated.
    expect(committed.fr).toEqual({ greeting: 'Bonjour' });
    expect(committed.en).toEqual({ greeting: 'Hello updated' });
  });

  it('resets the add-key input when switching languages', () => {
    const initial: UnifiedTranslations = {
      en: { greeting: 'Hello' },
      fr: { greeting: 'Bonjour' },
    };

    render(<Harness initialTranslations={initial} />);

    fireEvent.change(getAddKeyInput()!, { target: { value: 'newKey' } });

    // Switch to the fr language pill.
    fireEvent.click(getLanguagePill('fr')!);

    // The add-key input for the newly selected language should be empty.
    expect(getAddKeyInput()?.value).toBe('');
  });

  it('does not overwrite one language with another when switching languages in JSON mode', async () => {
    const initial: UnifiedTranslations = {
      en: { greeting: 'Hello' },
      fr: { greeting: 'Bonjour' },
    };

    render(<Harness initialTranslations={initial} />);

    // Start in JSON mode for the default selected language (en).
    fireEvent.click(getTabByText('JSON')!);

    await waitFor(() => {
      expect(getJsonEditor()).not.toBeNull();
    });

    // Edit the JSON for en.
    fireEvent.change(getJsonEditor()!, {
      target: { value: '{\n  "greeting": "Hello from JSON"\n}' },
    });

    // Switch to the fr language pill while still in JSON mode.
    fireEvent.click(getLanguagePill('fr')!);

    // Switch back to Form mode. The stale en JSON buffer must not be merged into fr.
    fireEvent.click(getTabByText('Form')!);

    await waitFor(() => {
      expect(getJsonEditor()).toBeNull();
    });

    const committed = getCommittedTranslations();

    // Fr should retain its original value. En was never committed because the user switched away
    // while still in JSON mode; the uncommitted JSON buffer is discarded on language switch.
    expect(committed.fr).toEqual({ greeting: 'Bonjour' });
    expect(committed.en).toEqual({ greeting: 'Hello' });
  });
});
