import { assert } from '@silverhand/essentials';
import { got, HTTPError } from 'got';

import type {
  GetConnectorConfig,
  SendMessageFunction,
  CreateConnector,
  SmsConnector,
} from '@logto/connector-kit';
import {
  ConnectorError,
  ConnectorErrorCodes,
  validateConfig,
  ConnectorType,
  replaceSendMessageHandlebars,
  getConfigTemplateByType,
  getLocalizedPayload,
} from '@logto/connector-kit';

import { defaultMetadata, endpoint } from './constant.js';
import type { PublicParameters } from './types.js';
import { twilioSmsConfigGuard } from './types.js';

// Phone number validity is checked upstream; only normalize a missing "+" for Twilio E.164 input.
const toE164PhoneNumber = (phoneNumber: string) =>
  phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

const sendMessage =
  (getConfig: GetConnectorConfig): SendMessageFunction =>
  async (data, inputConfig) => {
    const { to, type, payload } = data;
    const config = inputConfig ?? (await getConfig(defaultMetadata.id));
    validateConfig(config, twilioSmsConfigGuard);
    const { accountSID, authToken, fromMessagingServiceSID, disableRiskCheck, translations } =
      config;
    const template = getConfigTemplateByType(type, config);

    assert(
      template,
      new ConnectorError(
        ConnectorErrorCodes.TemplateNotFound,
        `Cannot find template for type: ${type}`
      )
    );

    // Resolve the per-locale translation dictionary (`payload.t`) from `config.translations` so
    // that `{{t.key}}` placeholders in the template resolve to the end-user's language. When no
    // translations are configured, this is a backward-compatible no-op (payload unchanged).
    const localizedPayload = getLocalizedPayload(payload, translations);

    const parameters: PublicParameters = {
      To: toE164PhoneNumber(to),
      MessagingServiceSid: fromMessagingServiceSID,
      Body: replaceSendMessageHandlebars(template.content, localizedPayload),
      RiskCheck: disableRiskCheck ? 'disable' : 'enable',
    };

    try {
      return await got.post(endpoint.replaceAll('{{accountSID}}', accountSID), {
        headers: {
          Authorization:
            'Basic ' + Buffer.from([accountSID, authToken].join(':')).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(parameters).toString(),
      });
    } catch (error: unknown) {
      if (error instanceof HTTPError) {
        const {
          response: { body: rawBody },
        } = error;
        assert(
          typeof rawBody === 'string',
          new ConnectorError(
            ConnectorErrorCodes.InvalidResponse,
            `Invalid response raw body type: ${typeof rawBody}`
          )
        );

        throw new ConnectorError(ConnectorErrorCodes.General, rawBody);
      }

      throw error;
    }
  };

const createTwilioSmsConnector: CreateConnector<SmsConnector> = async ({ getConfig }) => {
  return {
    metadata: defaultMetadata,
    type: ConnectorType.Sms,
    configGuard: twilioSmsConfigGuard,
    sendMessage: sendMessage(getConfig),
  };
};

export default createTwilioSmsConnector;
