import {
  ConnectorConfigFormItemType,
  ConnectorType,
  type ConnectorConfigFormItem,
} from '@logto/connector-kit';
import { fireEvent, render, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import Modal from 'react-modal';
import { MemoryRouter } from 'react-router-dom';

import ConnectorTemplatesEditor from '@/components/ConnectorForm/ConnectorTemplatesEditor';
import type { ConnectorFormType } from '@/types/connector';
import { SyncProfileMode } from '@/types/connector';

// The component tree pulls in `@/consts/env` (via icons/DS components), which reads Vite's
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
// Stub it as a `<textarea>` so JSON-mode (and the unified Template tab) stays drivable.
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
    general: { type_to_search: 'Type to search' },
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

// Mailgun email uses a `deliveries` form item (the row the unified editor compiles into).
const deliveriesItem: ConnectorConfigFormItem = {
  key: 'deliveries',
  label: 'Deliveries',
  type: ConnectorConfigFormItemType.Json,
  required: false,
  defaultValue: {},
};

type RenderOptions = {
  readonly deliveries?: unknown;
  readonly connectorFactoryId?: string;
};

const buildDefaultValues = (overrides?: { deliveries?: unknown }): Record<string, unknown> => ({
  syncProfile: SyncProfileMode.OnlyAtRegister,
  jsonConfig: '{}',
  formConfig: {
    deliveries: JSON.stringify(
      overrides?.deliveries ?? {
        Generic: {
          subject: 'Logto generic template {{code}}',
          html: 'Your Logto generic verification code is {{code}}.',
        },
      },
      null,
      2
    ),
    translations: '{}',
  },
  rawConfig: {},
  enableTokenStorage: false,
});

const renderEditor = ({ deliveries, connectorFactoryId }: RenderOptions = {}) => {
  const defaultValues = buildDefaultValues({ deliveries });

  function Harness() {
    const methods = useForm<ConnectorFormType>({ defaultValues });

    return (
      <FormProvider {...methods}>
        <MemoryRouter>
          <ConnectorTemplatesEditor
            formItem={deliveriesItem}
            connectorType={ConnectorType.Email}
            connectorFactoryId={connectorFactoryId}
          />
        </MemoryRouter>
        <CommittedUnifiedProbe />
      </FormProvider>
    );
  }

  const utils = render(<Harness />);

  return {
    ...utils,
    getButtonByText: (text: string) =>
      Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === text
      ),
    getTabByText: (text: string) =>
      Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
        tab.textContent?.includes(text)
      ),
  };
};

// Mirrors the committed `formConfig.templateEditorMode` into the DOM so the toggle test can
// observe the persisted mode.
function CommittedUnifiedProbe() {
  const value: unknown = useWatch({ name: 'formConfig.templateEditorMode' });

  return <div data-testid="committed-mode">{typeof value === 'string' ? value : ''}</div>;
}

describe('<ConnectorTemplatesEditor /> — Unified toggle', () => {
  it('hides the Unified toggle when the connector factory id is not in the allowlist', () => {
    const { getButtonByText } = renderEditor({ connectorFactoryId: 'aliyun-dm' });

    expect(getButtonByText('Classic per-type')).toBeUndefined();
    expect(getButtonByText('Unified')).toBeUndefined();
  });

  it('does NOT show the Unified toggle for the ubill-sms connector factory id', () => {
    // SMS connectors are no longer allowlisted for the Unified editor — the SMS classic per-type
    // editor is the only surface for Ubill-SMS after the SMS unified support was removed.
    const { getButtonByText } = renderEditor({ connectorFactoryId: 'ubill-sms' });

    expect(getButtonByText('Classic per-type')).toBeUndefined();
    expect(getButtonByText('Unified')).toBeUndefined();
  });

  it('shows the Classic/Unified toggle for the Mailgun email connector factory id', () => {
    const { getButtonByText } = renderEditor({ connectorFactoryId: 'mailgun-email' });

    expect(getButtonByText('Classic per-type')).not.toBeUndefined();
    expect(getButtonByText('Unified')).not.toBeUndefined();
  });

  it('switches to the Unified three-tab editor on toggle and seeds from classic deliveries', async () => {
    const { getButtonByText, getTabByText } = renderEditor({ connectorFactoryId: 'mailgun-email' });

    // Classic mode initially: no Unified sub-tabs.
    expect(getTabByText('Variables')).toBeUndefined();

    // Switch to Unified.
    fireEvent.click(getButtonByText('Unified')!);

    // The reverse-compile seed writes a unifiedTemplate (with the Generic html body as `content`)
    // + compiles the mirror; the UnifiedTemplateEditor mounts and renders its three sub-tabs.
    await waitFor(() => {
      expect(getTabByText('Template')).not.toBeUndefined();
      expect(getTabByText('Variables')).not.toBeUndefined();
      expect(getTabByText('Localizations')).not.toBeUndefined();
    });
  });
});
