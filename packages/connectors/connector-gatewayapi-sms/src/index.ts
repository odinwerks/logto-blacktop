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

import { defaultMetadata } from './constant.js';
import { gatewayApiSmsConfigGuard, type GatewayApiSmsPayload } from './types.js';

const sendMessage =
  (getConfig: GetConnectorConfig): SendMessageFunction =>
  async (data, inputConfig) => {
    const { to, type, payload } = data;
    const config = inputConfig ?? (await getConfig(defaultMetadata.id));
    validateConfig(config, gatewayApiSmsConfigGuard);
    const { endpoint, apiToken, sender, translations } = config;
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

    const encodedAuth = Buffer.from(`${apiToken}:`).toString('base64');
    const body: GatewayApiSmsPayload = {
      sender,
      message: replaceSendMessageHandlebars(template.content, localizedPayload),
      recipients: [{ msisdn: to }],
    };

    try {
      return await got.post(endpoint, {
        headers: {
          Authorization: `Basic ${encodedAuth}`,
        },
        json: body,
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

const createGatewayApiSmsConnector: CreateConnector<SmsConnector> = async ({ getConfig }) => {
  return {
    metadata: defaultMetadata,
    type: ConnectorType.Sms,
    configGuard: gatewayApiSmsConfigGuard,
    sendMessage: sendMessage(getConfig),
  };
};

export default createGatewayApiSmsConnector;
