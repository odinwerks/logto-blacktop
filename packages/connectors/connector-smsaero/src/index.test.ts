import nock from 'nock';

import { TemplateType } from '@logto/connector-kit';

import createConnector from './index.js';
import { mockedConfig } from './mock.js';

const getConfig = vi.fn().mockResolvedValue(mockedConfig);

describe('SMSAero SMS connector', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('init without throwing errors', async () => {
    await expect(createConnector({ getConfig })).resolves.not.toThrow();
  });

  it('renders localized `{{t.key}}` placeholders from `config.translations`', async () => {
    const mockedPost = nock('https://gate.smsaero.ru')
      .post('/v2/sms/send', (body) => {
        expect(body).toMatchObject({ text: 'გამარჯობა 123456' });

        return true;
      })
      .reply(200, { success: true });

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

    expect(mockedPost.isDone()).toBe(true);
  });
});
