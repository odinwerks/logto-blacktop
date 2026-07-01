import {
  ConnectorConfigFormItemType,
  ConnectorType,
  type ConnectorConfigFormItem,
} from '@logto/connector-kit';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import Modal from 'react-modal';
import { MemoryRouter } from 'react-router-dom';

import ConnectorTemplatesEditor from '@/components/ConnectorForm/ConnectorTemplatesEditor';
import type { ConnectorFormType } from '@/types/connector';
import { SyncProfileMode } from '@/types/connector';

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

jest.mock('@/hooks/use-api', () => {
  return () => ({
    get: jest.fn(),
    post: jest.fn(() => ({
      json: jest.fn().mockResolvedValue({}),
    })),
    put: jest.fn(),
    delete: jest.fn(),
  });
});

jest.mock('@/ds-components/CodeEditor', () => ({
  __esModule: true,
  default: ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <textarea
      data-testid="json-editor"
      value={value}
      onChange={(event) => {
        onChange?.(event.currentTarget.value);
      }}
    />
  ),
}));

i18next.addResourceBundle('en', 'translation', {
  admin_console: {
    general: {
      type_to_search: 'Type to search',
      confirm: 'Confirm',
      cancel: 'Cancel',
    },
    connector_details: {
      template_editor: {
        template_translations_available: 'Template translations available',
        delivery_templates: 'Delivery templates',
        form_mode: 'Form',
        json_mode: 'JSON',
        key: 'Key',
        add_localizations: 'Add localizations',
        add_key: 'Add key',
        delete_language: 'Delete language',
        content_placeholder: 'Use {{code}}.',
      },
      unified_editor: {
        mode_classic: 'Classic per-type',
        mode_unified: 'Unified',
        tab_template: 'Template',
        tab_variables: 'Variables',
        tab_localizations: 'Localizations',
        add_variable: 'Add variable',
        variable_key_prompt: 'Enter variable key',
        delete_variable: 'Delete variable',
        no_variables: 'No variables yet.',
        no_languages: 'No languages yet.',
        parse_error: 'The template has invalid <If> blocks.',
        preview: 'Preview',
        preview_as_type: 'Preview as type',
        preview_language: 'Preview language',
      },
    },
  },
});

Modal.setAppElement(document.body);

const deliveriesItem: ConnectorConfigFormItem = {
  key: 'deliveries',
  label: 'Deliveries',
  type: ConnectorConfigFormItemType.Json,
  required: false,
  defaultValue: {},
};

const buildDefaultValues = (): Record<string, unknown> => ({
  syncProfile: SyncProfileMode.OnlyAtRegister,
  jsonConfig: '{}',
  formConfig: {
    deliveries: JSON.stringify(
      {
        Generic: {
          subject: 'Logto generic template {{code}}',
          html: 'Your Logto generic verification code is {{code}}.',
        },
      },
      null,
      2
    ),
    templates: JSON.stringify([], null, 2),
    translations: '{}',
    templateEditorMode: JSON.stringify('unified'),
  },
  rawConfig: {},
  enableTokenStorage: false,
});

function CommittedDeliveriesProbe() {
  const value: unknown = useWatch({ name: 'formConfig.deliveries' });

  return <div data-testid="committed-deliveries">{typeof value === 'string' ? value : ''}</div>;
}

const renderEditor = () => {
  const defaultValues = buildDefaultValues();

  function Harness() {
    const methods = useForm<ConnectorFormType>({ defaultValues });

    return (
      <FormProvider {...methods}>
        <MemoryRouter>
          <form
            onSubmit={methods.handleSubmit(() => {
              /* Noop */
            })}
          >
            <ConnectorTemplatesEditor
              formItem={deliveriesItem}
              connectorType={ConnectorType.Email}
              connectorFactoryId="mailgun-email"
            />
          </form>
          <CommittedDeliveriesProbe />
        </MemoryRouter>
      </FormProvider>
    );
  }

  const utils = render(<Harness />);

  return {
    ...utils,
    getTabByText: (text: string) =>
      Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
        tab.textContent?.includes(text)
      ),
    getDeliveries: () => {
      return document.querySelector('[data-testid="committed-deliveries"]')?.textContent ?? '';
    },
  };
};

describe('<UnifiedTemplateEditor />', () => {
  it('does not write malformed <If> tags into deliveries while a parse error is present', async () => {
    jest.useFakeTimers();

    const { getTabByText, getDeliveries, container } = renderEditor();

    await waitFor(() => {
      expect(getTabByText('Template')).not.toBeUndefined();
    });

    const initialDeliveries = getDeliveries();
    const input = container.querySelector('textarea');
    expect(input).not.toBeNull();

    act(() => {
      fireEvent.change(input!, {
        target: { value: '<If type="SignIn"><If type="Register">inner</If></If>' },
      });
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(getDeliveries()).toBe(initialDeliveries);

    jest.useRealTimers();
  });

  it('writes an empty Generic row when the unified content is cleared after editing', async () => {
    jest.useFakeTimers();

    const { getTabByText, getDeliveries, container } = renderEditor();

    await waitFor(() => {
      expect(getTabByText('Template')).not.toBeUndefined();
    });

    const input = container.querySelector('textarea');
    expect(input).not.toBeNull();

    act(() => {
      fireEvent.change(input!, { target: { value: 'Hello {{code}}' } });
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(getDeliveries()).toContain('Hello {{code}}');

    act(() => {
      fireEvent.change(input!, { target: { value: '' } });
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Auto-seeding preserves the classic subject in `unifiedSubjects`, so clearing the content
    // leaves an empty `html` while the seeded subject remains.
    expect(JSON.parse(getDeliveries())).toEqual({
      Generic: { html: '', subject: 'Logto generic template {{code}}' },
    });

    jest.useRealTimers();
  });
});
