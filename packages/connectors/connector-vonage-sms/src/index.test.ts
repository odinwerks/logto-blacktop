import { TemplateType } from '@logto/connector-kit';

import createConnector from './index.js';
import { mockedConfig } from './mock.js';

const getConfig = vi.fn().mockResolvedValue(mockedConfig);

const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({}) }));

vi.mock('@vonage/server-sdk', () => {
  class VonageMock {
    sms = { send };
  }

  class AuthMock {
    constructor(public config: unknown) {}
  }

  return { Vonage: VonageMock, Auth: AuthMock };
});

describe('Vonage SMS connector', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('init without throwing errors', async () => {
    await expect(createConnector({ getConfig })).resolves.not.toThrow();
  });

  it('renders localized `{{t.key}}` placeholders from `config.translations`', async () => {
    const connector = await createConnector({ getConfig });
    await connector.sendMessage(
      {
        to: '4512345678',
        type: TemplateType.Generic,
        payload: { code: '123456', locale: 'ka' },
      },
      {
        ...mockedConfig,
        translations: { ka: { greeting: 'გამარჯობა' } },
        templates: [
          { usageType: 'Register', content: 'code {{code}}' },
          { usageType: 'SignIn', content: 'code {{code}}' },
          { usageType: 'ForgotPassword', content: 'code {{code}}' },
          { usageType: 'Generic', content: '{{t.greeting}} {{code}}' },
        ],
      }
    );

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ text: 'გამარჯობა 123456' }));
  });
});
