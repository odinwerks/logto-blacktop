import { assert } from '@silverhand/essentials';

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
import { Auth } from '@vonage/auth';
import { Vonage } from '@vonage/server-sdk';

import { defaultMetadata } from './constant.js';
import { vonageSmsConfigGuard } from './types.js';

const sendMessage =
  (getConfig: GetConnectorConfig): SendMessageFunction =>
  async (data, inputConfig) => {
    const { to, type, payload } = data;
    const config = inputConfig ?? (await getConfig(defaultMetadata.id));
    validateConfig(config, vonageSmsConfigGuard);
    const { apiKey, apiSecret, brandName, translations } = config;
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

    const vonageAuth = new Auth({
      apiKey,
      apiSecret,
    });
    const vonage = new Vonage(vonageAuth);

    try {
      return await vonage.sms.send({
        from: brandName,
        to,
        text: replaceSendMessageHandlebars(template.content, localizedPayload),
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new ConnectorError(ConnectorErrorCodes.General, error.message);
      }

      throw error;
    }
  };

const createVonageSmsConnector: CreateConnector<SmsConnector> = async ({ getConfig }) => {
  return {
    metadata: defaultMetadata,
    type: ConnectorType.Sms,
    configGuard: vonageSmsConfigGuard,
    sendMessage: sendMessage(getConfig),
  };
};

export default createVonageSmsConnector;
