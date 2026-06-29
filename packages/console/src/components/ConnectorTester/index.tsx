import { ServiceConnector, TemplateType } from '@logto/connector-kit';
import { emailRegEx, phoneInputRegEx } from '@logto/core-kit';
import { languages as uiLanguageNameMapping, type LanguageTag } from '@logto/language-kit';
import { ConnectorType } from '@logto/schemas';
import { parsePhoneNumber } from '@logto/shared/universal';
import { conditional } from '@silverhand/essentials';
import { useEffect, useState } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import Button from '@/ds-components/Button';
import FormField from '@/ds-components/FormField';
import Select, { type Option } from '@/ds-components/Select';
import TextInput from '@/ds-components/TextInput';
import { Tooltip } from '@/ds-components/Tip';
import useApi from '@/hooks/use-api';
import { onKeyDownHandler } from '@/utils/a11y';
import { trySubmitSafe } from '@/utils/form';

import styles from './index.module.scss';

type Props = {
  readonly connectorFactoryId: string;
  readonly connectorType: Exclude<ConnectorType, ConnectorType.Social>;
  readonly className?: string;
  readonly parse: () => unknown;
  readonly updateUsage?: () => void;
  /**
   * Optional "template" selector options. When provided (and non-empty), a "Template" dropdown is
   * rendered beside the recipient field so the test message can be sent for a specific
   * {@link TemplateType} (default `Generic`, preserving the previous behavior). Omitted by callers
   * whose test bar does not surface per-template testing (e.g. the first-time setup guide).
   */
  readonly templateTypes?: Array<Option<TemplateType>>;
  /**
   * The languages configured in the connector's translations dictionary. When provided (and
   * non-empty), a clearable "Language" dropdown is rendered so the test message can be previewed in
   * a localized variant; the selected value is forwarded to the test endpoint as `locale`. Omitted by
   * callers whose connectors have no translations dictionary.
   */
  readonly languages?: readonly LanguageTag[];
};

type FormData = {
  sendTo: string;
};

function ConnectorTester({
  connectorFactoryId,
  connectorType,
  className,
  parse,
  updateUsage,
  templateTypes,
  languages,
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  // Selected test template defaults to `Generic` (the previous "Logto uses the Generic template for
  // testing" behavior). Only meaningful when {@link templateTypes} is provided.
  const [selectedTemplateType, setSelectedTemplateType] = useState<TemplateType>(
    TemplateType.Generic
  );
  // Optional localization to render the test message in; `undefined` sends without a `locale`.
  const [selectedLocale, setSelectedLocale] = useState<LanguageTag>();
  const {
    handleSubmit,
    register,
    formState: {
      errors: { sendTo: inputError },
      isSubmitting,
    },
  } = useForm<FormData>();
  const { trigger } = useFormContext();
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const api = useApi();
  const isSms = connectorType === ConnectorType.Sms;
  const isEmailServiceConnector = connectorFactoryId === ServiceConnector.Email;

  const showTemplateSelector = Boolean(templateTypes && templateTypes.length > 0);
  const showLanguageSelector = Boolean(languages && languages.length > 0);

  useEffect(() => {
    if (!showTooltip) {
      return;
    }

    const tooltipTimeout = setTimeout(() => {
      setShowTooltip(false);
    }, 2000);

    return () => {
      clearTimeout(tooltipTimeout);
    };
  }, [showTooltip]);

  const onSubmit = handleSubmit(
    trySubmitSafe(async (formData) => {
      const isConfigFormValid = await trigger(undefined, { shouldFocus: true });
      if (!isConfigFormValid) {
        return;
      }

      const { sendTo } = formData;

      const data = {
        config: parse(),
        // Forward the selected template type (defaulting to `Generic` — the previous behavior) and the
        // optional localization so the test message renders for the chosen template/language. Both
        // are accepted by the `POST /api/connectors/:factoryId/test` endpoint.
        templateType: selectedTemplateType,
        ...conditional(selectedLocale && { locale: selectedLocale }),
        ...(isSms ? { phone: parsePhoneNumber(sendTo) } : { email: sendTo }),
      };

      await api.post(`api/connectors/${connectorFactoryId}/test`, { json: data }).json();
      updateUsage?.();
      setShowTooltip(true);
    })
  );

  // Register the recipient field once (stable config) so the change handler can both feed
  // react-hook-form's validation and mirror the value up to the parent for per-template testing.
  const sendToRegistration = register('sendTo', {
    required: true,
    pattern: {
      value: isSms ? phoneInputRegEx : emailRegEx,
      message: t('connector_details.send_error_invalid_format'),
    },
  });

  return (
    <div className={className}>
      <div className={styles.fields}>
        <FormField
          title={
            isSms ? 'connector_details.test_sms_sender' : 'connector_details.test_email_sender'
          }
          className={styles.textField}
        >
          <TextInput
            error={Boolean(inputError)}
            type={isSms ? 'tel' : 'email'}
            placeholder={
              isSms
                ? t('connector_details.test_sms_placeholder')
                : t('connector_details.test_email_placeholder')
            }
            onKeyDown={onKeyDownHandler({ Enter: onSubmit })}
            {...sendToRegistration}
            onChange={(event) => {
              void sendToRegistration.onChange(event);
            }}
          />
        </FormField>
        {showTemplateSelector && (
          <FormField title="connector_details.select_template" className={styles.selectorField}>
            <Select<TemplateType>
              size="medium"
              value={selectedTemplateType}
              options={templateTypes ?? []}
              onChange={(value) => {
                if (value) {
                  setSelectedTemplateType(value);
                }
              }}
            />
          </FormField>
        )}
        {showLanguageSelector && (
          <FormField title="connector_details.select_language" className={styles.selectorField}>
            <Select<LanguageTag>
              isClearable
              size="medium"
              value={selectedLocale}
              options={(languages ?? []).map((languageTag) => ({
                value: languageTag,
                title: uiLanguageNameMapping[languageTag],
              }))}
              onChange={(value) => {
                setSelectedLocale(value);
              }}
            />
          </FormField>
        )}
        <Tooltip
          isKeepOpen
          isSuccessful
          anchorClassName={styles.send}
          content={conditional(showTooltip && t('connector_details.test_message_sent'))}
        >
          <Button
            isLoading={isSubmitting}
            title="connector_details.send"
            type="outline"
            onClick={onSubmit}
          />
        </Tooltip>
      </div>
      {!isEmailServiceConnector && (
        <div className={styles.description}>{t('connector_details.test_sender_description')}</div>
      )}
      <div className={styles.error}>{inputError?.message}</div>
    </div>
  );
}

export default ConnectorTester;
