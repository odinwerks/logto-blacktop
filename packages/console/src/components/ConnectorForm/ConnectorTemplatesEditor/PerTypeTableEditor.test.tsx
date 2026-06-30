import { fireEvent, render } from '@testing-library/react';
import i18next from 'i18next';
import { MemoryRouter } from 'react-router-dom';

import PerTypeTableEditor from './PerTypeTableEditor';

// Mock env module as it reads Vite's import.meta.env
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

// Mock CodeEditor with a textarea for testing
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

// Add translations
i18next.addResourceBundle('en', 'translation', {
  admin_console: {
    connector_details: {
      template_editor: {
        form_mode: 'Form',
        json_mode: 'JSON',
      },
      unified_editor: {
        invalid_json_format: 'The JSON is not valid.',
        json_must_be_object: 'Must be a JSON object.',
        json_values_must_be_strings: 'Values must be strings.',
      },
    },
  },
});

describe('<PerTypeTableEditor />', () => {
  it('overwrites instead of merging parsed JSON when switching from JSON to Form mode', async () => {
    const mockOnChange = jest.fn();
    const initialData = {
      key1: { Generic: 'value1' },
      key2: { Generic: 'value2' },
    };
    const typeColumns = ['Generic'];

    const { getByText, getByTestId } = render(
      <MemoryRouter>
        <PerTypeTableEditor
          data={initialData}
          typeColumns={typeColumns}
          addButtonLabel="connector_details.template_editor.add_key"
          addPromptLabel="Add key"
          jsonModeTitle="JSON Mode"
          onChange={mockOnChange}
        />
      </MemoryRouter>
    );

    // Click JSON tab
    fireEvent.click(getByText('JSON'));

    const jsonEditor = getByTestId('json-editor') as HTMLTextAreaElement;
    expect(jsonEditor).not.toBeNull();
    expect(JSON.parse(jsonEditor.value)).toEqual(initialData);

    // Delete "key2" and rename/modify "key1" in JSON
    const updatedJsonText = JSON.stringify({
      key1: { Generic: 'value1-updated' },
    });
    fireEvent.change(jsonEditor, { target: { value: updatedJsonText } });

    // Click Form tab to switch back
    fireEvent.click(getByText('Form'));

    // Verify onChange was called with ONLY key1 (i.e. key2 was completely removed, not merged)
    expect(mockOnChange).toHaveBeenCalledWith({
      key1: { Generic: 'value1-updated' },
    });
  });
});
