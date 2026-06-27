import nock from 'nock';

import { TemplateType } from '@logto/connector-kit';

import { endpoint } from './constant.js';
import createConnector from './index.js';
import { mockedConfig } from './mock.js';

const getConfig = vi.fn().mockResolvedValue(mockedConfig);

describe('yunpian SMS connector', () => {
  it('init without throwing errors', async () => {
    await expect(createConnector({ getConfig })).resolves.not.toThrow();
  });

  describe('sendMessage()', async () => {
    const connector = await createConnector({ getConfig });
    const { sendMessage } = connector;

    beforeAll(() => {
      nock.disableNetConnect();
    });

    afterAll(() => {
      nock.enableNetConnect();
    });

    afterEach(() => {
      nock.cleanAll();
    });

    it('should send message successfully', async () => {
      const mockResponse = {
        code: 0,
        msg: '发送成功',
        count: 1,
        fee: 0.05,
        unit: 'RMB',
        mobile: '13800138000',
        sid: 3_310_228_982,
      };

      nock(endpoint).post('').reply(200, mockResponse);

      await expect(
        sendMessage({
          to: '13800138000',
          type: TemplateType.Generic,
          payload: { code: '1234' },
        })
      ).resolves.not.toThrow();
    });

    it('renders localized `{{t.key}}` placeholders from `config.translations`', async () => {
      const scope = nock(endpoint)
        .post('', (body) => {
          expect(body).toMatchObject({ text: 'გამარჯობა 123456' });
          return true;
        })
        .reply(200, { code: 0, msg: '发送成功' });

      await sendMessage(
        {
          to: '8613800138000',
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

      expect(scope.isDone()).toBe(true);
    });
  });
});
