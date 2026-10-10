import type { ConnectorConfigFormItem } from '@logto/connector-kit';
import { ConnectorConfigFormItemType, ConnectorType } from '@logto/connector-kit';
import { render } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import type { ConnectorFormType } from '@/types/connector';

import ConfigFormFields from '.';

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

// `use-cloud-api` pulls in the ESM-only `@logto/react`/`@logto/client` SDK stack that jest cannot
// resolve (reached via `utils/subscription` ← `FeatureTag` ← `CardTitle` ← `ModalLayout`). The
// components under test never call cloud APIs, so stub the module boundary.
jest.mock('@/cloud/hooks/use-cloud-api', () => ({
  tryReadResponseErrorBody: jest.fn(),
  toastResponseError: jest.fn(),
  useCloudApi: jest.fn(),
  createTenantApi: jest.fn(),
  useAuthedCloudApi: jest.fn(),
}));

jest.mock('@/ds-components/FormField', () => ({
  __esModule: true,
  default: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/ds-components/CodeEditor', () => ({
  __esModule: true,
  default: () => <textarea data-testid="json-field" />,
}));

jest.mock('../../ConnectorTemplatesEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="connector-templates-editor" />,
}));

const jsonItem = (key: string): ConnectorConfigFormItem => ({
  key,
  label: key,
  type: ConnectorConfigFormItemType.Json,
  required: false,
});

const translationsItem = jsonItem('translations');
const deliveriesItem = jsonItem('deliveries');

function Wrapper({ children }: { readonly children: React.ReactNode }) {
  const methods = useForm<ConnectorFormType>();

  return (
    <MemoryRouter>
      <FormProvider {...methods}>{children}</FormProvider>
    </MemoryRouter>
  );
}

describe('<ConfigFormFields /> unified template editor mount', () => {
  it('mounts ConnectorTemplatesEditor for an SMS connector with translations + deliveries items', () => {
    const { getByTestId } = render(
      <ConfigFormFields
        formItems={[deliveriesItem, translationsItem]}
        connectorType={ConnectorType.Sms}
        connectorFactoryId="twilio-sms"
      />,
      { wrapper: Wrapper }
    );

    expect(getByTestId('connector-templates-editor')).not.toBeNull();
  });

  it('falls back to the plain JSON field when no translations item is declared', () => {
    const { queryByTestId, getByTestId } = render(
      <ConfigFormFields
        formItems={[deliveriesItem]}
        connectorType={ConnectorType.Sms}
        connectorFactoryId="twilio-sms"
      />,
      { wrapper: Wrapper }
    );

    expect(queryByTestId('connector-templates-editor')).toBeNull();
    expect(getByTestId('json-field')).not.toBeNull();
  });

  it('does not mount the editor for a Social connector', () => {
    const { queryByTestId, getAllByTestId } = render(
      <ConfigFormFields
        formItems={[deliveriesItem, translationsItem]}
        connectorType={ConnectorType.Social}
        connectorFactoryId="google"
      />,
      { wrapper: Wrapper }
    );

    expect(queryByTestId('connector-templates-editor')).toBeNull();
    // Both items render as plain JSON fields (the `translations` skip only applies to SMS/email).
    expect(getAllByTestId('json-field')).toHaveLength(2);
  });
});
