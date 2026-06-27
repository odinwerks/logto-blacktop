import { assert, trySafe } from '@silverhand/essentials';
import { HTTPError } from 'got';

import type {
  CreateConnector,
  EmailConnector,
  GetConnectorConfig,
  GetI18nEmailTemplate,
  SendMessageFunction,
} from '@logto/connector-kit';
import {
  ConnectorError,
  ConnectorErrorCodes,
  ConnectorType,
  validateConfig,
  parseJson,
  replaceSendMessageHandlebars,
  getConfigTemplateByType,
  getLocalizedPayload,
} from '@logto/connector-kit';

import { defaultMetadata, defaultRegionId } from './constant.js';
import { singleSendMail } from './single-send-mail.js';
import {
  aliyunDmConfigGuard,
  sendEmailResponseGuard,
  sendMailErrorResponseGuard,
} from './types.js';

const sendMessage =
  (
    getConfig: GetConnectorConfig,
    getI18nEmailTemplate?: GetI18nEmailTemplate
  ): SendMessageFunction =>
  async (data, inputConfig) => {
    const { to, type, payload } = data;
    const config = inputConfig ?? (await getConfig(defaultMetadata.id));
    validateConfig(config, aliyunDmConfigGuard);
    const {
      accessKeyId,
      accessKeySecret,
      accountName,
      fromAlias,
      regionId = defaultRegionId,
      translations,
    } = config;

    const customTemplate = await trySafe(async () => getI18nEmailTemplate?.(type, payload.locale));

    const template = customTemplate ?? getConfigTemplateByType(type, config);

    assert(
      template,
      new ConnectorError(
        ConnectorErrorCodes.TemplateNotFound,
        `Cannot find template for type: ${type}`
      )
    );

    // Resolve the per-locale translation dictionary (`payload.t`) from `config.translations` so
    // that `{{t.key}}` placeholders resolve to the end-user's language. A back-compatible no-op when
    // no translations are configured.
    const localizedPayload = getLocalizedPayload(payload, translations);

    try {
      const httpResponse = await singleSendMail(
        {
          AccessKeyId: accessKeyId,
          RegionId: regionId,
          AccountName: accountName,
          ReplyToAddress: 'false',
          AddressType: '1',
          ToAddress: to,
          FromAlias: customTemplate?.sendFrom
            ? replaceSendMessageHandlebars(customTemplate.sendFrom, localizedPayload)
            : fromAlias,
          Subject: replaceSendMessageHandlebars(template.subject, localizedPayload),
          HtmlBody: replaceSendMessageHandlebars(template.content, localizedPayload),
        },
        accessKeySecret
      );

      const result = sendEmailResponseGuard.safeParse(parseJson(httpResponse.body));

      if (!result.success) {
        throw new ConnectorError(ConnectorErrorCodes.InvalidResponse, result.error);
      }

      return result.data;
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

        errorHandler(rawBody);
      }

      throw error;
    }
  };

const errorHandler = (errorResponseBody: string) => {
  const result = sendMailErrorResponseGuard.safeParse(parseJson(errorResponseBody));

  if (!result.success) {
    throw new ConnectorError(ConnectorErrorCodes.InvalidResponse, result.error);
  }

  const { Message: errorDescription, ...rest } = result.data;

  throw new ConnectorError(ConnectorErrorCodes.General, { errorDescription, ...rest });
};

const createAliyunDmConnector: CreateConnector<EmailConnector> = async ({
  getConfig,
  getI18nEmailTemplate,
}) => {
  return {
    metadata: defaultMetadata,
    type: ConnectorType.Email,
    configGuard: aliyunDmConfigGuard,
    sendMessage: sendMessage(getConfig, getI18nEmailTemplate),
  };
};

export default createAliyunDmConnector;
