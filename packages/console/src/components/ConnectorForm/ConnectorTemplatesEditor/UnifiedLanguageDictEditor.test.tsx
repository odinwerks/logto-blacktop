import { fireEvent, render, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

import UnifiedLanguageDictEditor from './UnifiedLanguageDictEditor';

// The component tree pulls in `@/consts/env` (via DS components), which reads Vite's
// `import.meta.env`. Jest does not define that, so mock the env module.
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

// `CodeEditor` pulls in `react-syntax-highlighter` (ESM) that Jest cannot transform by default.
// Stub it as a `<textarea>` so JSON-mode tests can drive `value`/`onChange`.
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
      },
    },
  },
});

// A controlled harness so tests can observe the committed dictionary after edits.
function Harness({ initialDict }: { readonly initialDict: Record<string, string> }) {
  const [dict, setDict] = useState(initialDict);

  return (
    <MemoryRouter>
      <UnifiedLanguageDictEditor languageTag="en" dict={dict} onChange={setDict} />
      <div data-testid="committed-dict">{JSON.stringify(dict)}</div>
    </MemoryRouter>
  );
}

const getCommittedDict = (): Record<string, string> => {
  const raw = document.querySelector('[data-testid="committed-dict"]')?.textContent ?? '{}';

  return JSON.parse(raw) as Record<string, string>;
};

const getJsonEditor = () =>
  document.querySelector<HTMLTextAreaElement>('[data-testid="json-editor"]');

const getRowInputs = () =>
  Array.from(document.querySelectorAll<HTMLTableRowElement>('table tbody tr')).map((row) => ({
    key: row.querySelectorAll<HTMLInputElement>('input')[0],
    value: row.querySelectorAll<HTMLInputElement>('input')[1],
  }));

const getValueInputs = () => getRowInputs().map(({ value }) => value);

const getKeyInputs = () => getRowInputs().map(({ key }) => key);

const getDeleteButtons = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('table tbody button'));

const getAddKeyInput = () => document.querySelector<HTMLInputElement>('[placeholder="Add key"]');

const getAddKeyButton = () =>
  Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === '+'
  );

const getTabByText = (text: string) =>
  Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
    tab.textContent?.includes(text)
  );

describe('<UnifiedLanguageDictEditor />', () => {
  it('renders flat key/value rows in Form mode', () => {
    render(
      <Harness initialDict={{ signInTitle: 'Sign in', signInDescription: 'Enter your code' }} />
    );

    const keys = getKeyInputs().map((input) => input?.value ?? '');
    const values = getValueInputs().map((input) => input?.value ?? '');

    expect(keys).toEqual(expect.arrayContaining(['signInTitle', 'signInDescription']));
    expect(values).toEqual(expect.arrayContaining(['Sign in', 'Enter your code']));
  });

  it('edits a value in Form mode and commits a flat dictionary', () => {
    render(<Harness initialDict={{ signInTitle: 'Sign in' }} />);

    fireEvent.change(getValueInputs()[0]!, { target: { value: 'Log in' } });

    expect(getCommittedDict()).toEqual({ signInTitle: 'Log in' });
  });

  it('edits a key in Form mode and commits a flat dictionary', () => {
    render(<Harness initialDict={{ oldKey: 'value' }} />);

    fireEvent.change(getKeyInputs()[0]!, { target: { value: 'newKey' } });

    expect(getCommittedDict()).toEqual({ newKey: 'value' });
  });

  it('adds a new key/value row in Form mode', () => {
    render(<Harness initialDict={{}} />);

    fireEvent.change(getAddKeyInput()!, { target: { value: 'greeting' } });
    fireEvent.click(getAddKeyButton()!);

    expect(getCommittedDict()).toEqual({ greeting: '' });
  });

  it('does not add a row when the key is empty or already exists', () => {
    render(<Harness initialDict={{ existing: 'value' }} />);

    fireEvent.change(getAddKeyInput()!, { target: { value: '' } });
    fireEvent.click(getAddKeyButton()!);

    fireEvent.change(getAddKeyInput()!, { target: { value: 'existing' } });
    fireEvent.click(getAddKeyButton()!);

    expect(getCommittedDict()).toEqual({ existing: 'value' });
  });

  it('deletes a key/value row in Form mode', () => {
    render(<Harness initialDict={{ keep: 'a', remove: 'b' }} />);

    fireEvent.click(getDeleteButtons()[1]!);

    expect(getCommittedDict()).toEqual({ keep: 'a' });
  });

  it('seeds the JSON editor with canonical flat JSON', async () => {
    render(<Harness initialDict={{ signInTitle: 'Sign in' }} />);

    fireEvent.click(getTabByText('JSON')!);

    await waitFor(() => {
      expect(getJsonEditor()).not.toBeNull();
    });

    expect(getJsonEditor()!.value).toBe('{\n  "signInTitle": "Sign in"\n}');
  });

  it('replaces the dictionary with parsed JSON on JSON -> Form switch', async () => {
    render(<Harness initialDict={{ signInTitle: 'Sign in' }} />);

    fireEvent.click(getTabByText('JSON')!);

    await waitFor(() => {
      expect(getJsonEditor()).not.toBeNull();
    });

    fireEvent.change(getJsonEditor()!, {
      target: { value: '{\n  "signInTitle": "From JSON",\n  "greeting": "Hello"\n}' },
    });

    fireEvent.click(getTabByText('Form')!);

    await waitFor(() => {
      expect(getCommittedDict()).toEqual({ signInTitle: 'From JSON', greeting: 'Hello' });
    });
  });

  it('removes keys deleted in JSON mode on JSON -> Form switch', async () => {
    render(<Harness initialDict={{ keep: 'a', remove: 'b' }} />);

    fireEvent.click(getTabByText('JSON')!);

    await waitFor(() => {
      expect(getJsonEditor()).not.toBeNull();
    });

    fireEvent.change(getJsonEditor()!, {
      target: { value: '{\n  "keep": "a updated"\n}' },
    });

    fireEvent.click(getTabByText('Form')!);

    await waitFor(() => {
      expect(getCommittedDict()).toEqual({ keep: 'a updated' });
    });
  });

  it('rejects wrapped { Value: ... } JSON in JSON mode', async () => {
    render(<Harness initialDict={{}} />);

    fireEvent.click(getTabByText('JSON')!);

    await waitFor(() => {
      expect(getJsonEditor()).not.toBeNull();
    });

    fireEvent.change(getJsonEditor()!, {
      target: { value: '{ "signInTitle": { "Value": "wrapped" } }' },
    });

    fireEvent.click(getTabByText('Form')!);

    await waitFor(() => {
      expect(getJsonEditor()!.dataset.error).toBeTruthy();
    });

    // The dictionary stays empty because the JSON was invalid (values must be strings).
    expect(getCommittedDict()).toEqual({});
  });

  it('never emits { Value: ... } in the committed dictionary', () => {
    const { rerender } = render(<Harness initialDict={{ signInTitle: 'Sign in' }} />);

    expect(getCommittedDict()).toEqual({ signInTitle: 'Sign in' });

    fireEvent.change(getValueInputs()[0]!, { target: { value: 'Updated' } });
    rerender(<Harness initialDict={getCommittedDict()} />);

    const json = JSON.stringify(getCommittedDict());
    expect(json).not.toContain('"Value"');
    expect(getCommittedDict()).toEqual({ signInTitle: 'Updated' });
  });
});
