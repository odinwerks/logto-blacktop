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
  readonly templateEditorMode?: string;
};

const buildDefaultValues = (overrides?: {
  deliveries?: unknown;
  templateEditorMode?: string;
}): Record<string, unknown> => ({
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
    templateEditorMode: overrides?.templateEditorMode,
  },
  rawConfig: {},
  enableTokenStorage: false,
});

const renderEditor = ({
  deliveries,
  connectorFactoryId,
  templateEditorMode,
}: RenderOptions = {}) => {
  const defaultValues = buildDefaultValues({ deliveries, templateEditorMode });

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
              connectorFactoryId={connectorFactoryId}
            />
          </form>
        </MemoryRouter>
        <CommittedUnifiedProbe />
        <CommittedDeliveriesProbe />
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
    getDeliveries: () => {
      return document.querySelector('[data-testid="committed-deliveries"]')?.textContent ?? '';
    },
  };
};

// Mirrors the committed `formConfig.templateEditorMode` into the DOM so the toggle test can
// observe the persisted mode.
function CommittedUnifiedProbe() {
  const value: unknown = useWatch({ name: 'formConfig.templateEditorMode' });

  return <div data-testid="committed-mode">{typeof value === 'string' ? value : ''}</div>;
}

function CommittedDeliveriesProbe() {
  const value: unknown = useWatch({ name: 'formConfig.deliveries' });

  return <div data-testid="committed-deliveries">{typeof value === 'string' ? value : ''}</div>;
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

    // Confirm the modal
    fireEvent.click(getButtonByText('Confirm')!);

    // The reverse-compile seed writes a unifiedTemplate (with the Generic html body as `content`)
    // + compiles the mirror; the UnifiedTemplateEditor mounts and renders its three sub-tabs.
    await waitFor(() => {
      expect(getTabByText('Template')).not.toBeUndefined();
      expect(getTabByText('Variables')).not.toBeUndefined();
      expect(getTabByText('Localizations')).not.toBeUndefined();
    });
  });

  it('switches to the Unified three-tab editor on toggle, shows confirmation modal, cancels, then confirms', async () => {
    const { getButtonByText, getTabByText } = renderEditor({ connectorFactoryId: 'mailgun-email' });

    // Classic mode initially: no Unified sub-tabs.
    expect(getTabByText('Variables')).toBeUndefined();

    // Click Unified.
    fireEvent.click(getButtonByText('Unified')!);

    // Confirmation modal should be visible.
    await waitFor(() => {
      expect(document.body.textContent).toContain('Switch to Unified Mode?');
      expect(document.body.textContent).toContain(
        'This will generate a unified template with <If> blocks'
      );
    });

    // Click Cancel.
    fireEvent.click(getButtonByText('Cancel')!);

    // Should not have switched.
    expect(getTabByText('Variables')).toBeUndefined();

    // Click Unified again.
    fireEvent.click(getButtonByText('Unified')!);

    // Click Confirm.
    fireEvent.click(getButtonByText('Confirm')!);

    // Now it should have switched.
    await waitFor(() => {
      expect(getTabByText('Template')).not.toBeUndefined();
      expect(getTabByText('Variables')).not.toBeUndefined();
      expect(getTabByText('Localizations')).not.toBeUndefined();
    });
  });

  it('switches to the Classic editor on toggle, shows confirmation modal, cancels, then confirms', async () => {
    // Render initially in unified mode
    const { getButtonByText, getTabByText } = renderEditor({
      connectorFactoryId: 'mailgun-email',
      templateEditorMode: JSON.stringify('unified'),
    });

    // Unified mode initially: Unified sub-tabs are visible.
    await waitFor(() => {
      expect(getTabByText('Variables')).not.toBeUndefined();
    });

    // Click Classic.
    fireEvent.click(getButtonByText('Classic per-type')!);

    // Confirmation modal should be visible.
    await waitFor(() => {
      expect(document.body.textContent).toContain('Switch to Classic Mode?');
      expect(document.body.textContent).toContain('This will keep your current compiled templates');
    });

    // Click Cancel.
    fireEvent.click(getButtonByText('Cancel')!);

    // Should still be in Unified mode.
    expect(getTabByText('Variables')).not.toBeUndefined();

    // Click Classic again.
    fireEvent.click(getButtonByText('Classic per-type')!);

    // Click Confirm.
    fireEvent.click(getButtonByText('Confirm')!);

    // Should have switched back to classic.
    await waitFor(() => {
      expect(getTabByText('Variables')).toBeUndefined();
    });
  });

  it('debounces the compiled write-back by 250ms and flushes immediately on submit', async () => {
    jest.useFakeTimers();

    const { getTabByText, getDeliveries, container } = renderEditor({
      connectorFactoryId: 'mailgun-email',
      templateEditorMode: JSON.stringify('unified'),
    });

    // Make sure we are in unified mode
    await waitFor(() => {
      expect(getTabByText('Template')).not.toBeUndefined();
    });

    const initialDeliveries = getDeliveries();
    expect(initialDeliveries).toContain('Logto generic template');

    // Find the subject input field and edit it.
    const input = container.querySelector('input');
    expect(input).not.toBeNull();

    act(() => {
      fireEvent.change(input!, { target: { value: 'A completely new subject' } });
    });

    // Flush any initial microtasks and effect scheduling
    act(() => {
      jest.advanceTimersByTime(0);
    });

    // The deliveries mirror field should NOT have updated immediately due to debounce.
    expect(getDeliveries()).toBe(initialDeliveries);

    // If we advance time by 100ms, it still should not have updated.
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(getDeliveries()).toBe(initialDeliveries);

    // If we advance time by another 150ms (total 250ms), it should update!
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(getDeliveries()).not.toBe(initialDeliveries);
    expect(getDeliveries()).toContain('A completely new subject');

    // Now test that submitting flushes immediately
    act(() => {
      fireEvent.change(input!, { target: { value: 'Yet another subject edit' } });
    });

    // Flush hook-form update microtasks so it schedules the new timer
    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(getDeliveries()).not.toContain('Yet another subject edit');

    // Simulate form submission
    const form = container.querySelector('form');
    expect(form).not.toBeNull();

    act(() => {
      fireEvent.submit(form!);
    });

    // It should have flushed and updated immediately without any time advancing!
    expect(getDeliveries()).toContain('Yet another subject edit');

    jest.useRealTimers();
  });
});
