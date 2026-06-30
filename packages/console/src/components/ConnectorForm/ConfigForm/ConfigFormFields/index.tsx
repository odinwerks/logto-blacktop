import type { ConnectorConfigFormItem } from '@logto/connector-kit';
import { ConnectorConfigFormItemType, ConnectorType } from '@logto/connector-kit';
import { conditional } from '@silverhand/essentials';
import { useCallback, useMemo } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CheckboxGroup } from '@/ds-components/Checkbox';
import CodeEditor from '@/ds-components/CodeEditor';
import DangerousRaw from '@/ds-components/DangerousRaw';
import FormField from '@/ds-components/FormField';
import Select from '@/ds-components/Select';
import Switch from '@/ds-components/Switch';
import TextInput from '@/ds-components/TextInput';
import Textarea from '@/ds-components/Textarea';
import type { ConnectorFormType } from '@/types/connector';
import { formatMultiLineScopeInput, isUnifiedFormField } from '@/utils/connector-form';
import { jsonValidator } from '@/utils/validator';

import ConnectorTemplatesEditor from '../../ConnectorTemplatesEditor';

import styles from './index.module.scss';

type Props = {
  readonly formItems: ConnectorConfigFormItem[];
  readonly connectorType?: ConnectorType;
  readonly connectorFactoryId?: string;
};

function ConfigFormFields({ formItems, connectorType, connectorFactoryId }: Props) {
  const {
    watch,
    register,
    control,
    formState: {
      errors: { formConfig: formConfigErrors },
    },
  } = useFormContext<ConnectorFormType>();
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  const values = watch('formConfig');

  // The inline `ConnectorTemplatesEditor` owns both the `templates`/`deliveries` field and the
  // sibling `translations` field. Mount it only when both are declared, so connectors without
  // localization wired up do not silently drop translation data.
  const hasTranslationsItem = useMemo(
    () => formItems.some((item) => item.key === 'translations'),
    [formItems]
  );

  const showFormItems = useCallback(
    (formItem: ConnectorConfigFormItem) => {
      if (!formItem.showConditions) {
        return true;
      }

      return formItem.showConditions.every(({ expectValue, targetKey }) => {
        const targetValue = values[targetKey];

        return targetValue === expectValue;
      });
    },
    [values]
  );

  const renderFormItem = (item: ConnectorConfigFormItem) => {
    // SMS and email connectors host an inline templates + translations editor: the
    // `templates`/`deliveries` item is rendered by it, and the sibling `translations` item is
    // skipped in the map below (owned entirely by the editor) so it does not surface as its own
    // (empty) form field. Inlining the connector-type check lets TypeScript narrow `connectorType`
    // to a defined `ConnectorType` for the editor's required prop.
    if (
      (connectorType === ConnectorType.Sms || connectorType === ConnectorType.Email) &&
      (item.key === 'templates' || item.key === 'deliveries')
    ) {
      if (!hasTranslationsItem) {
        // TODO: add an i18n key for this message once product copy is finalized.
        return (
          <div className={styles.note}>
            Translation support is not configured for this connector.
          </div>
        );
      }

      return (
        <ConnectorTemplatesEditor
          formItem={item}
          connectorType={connectorType}
          connectorFactoryId={connectorFactoryId}
          formItems={formItems}
        />
      );
    }

    const errorMessage = formConfigErrors?.[item.key]?.message;
    const error =
      typeof errorMessage === 'string' && errorMessage.length > 0
        ? errorMessage
        : Boolean(formConfigErrors?.[item.key]);

    const buildCommonProperties = () => ({
      ...register(`formConfig.${item.key}`, {
        required: item.required,
        valueAsNumber: item.type === ConnectorConfigFormItemType.Number,
        ...conditional(
          // For `scope` input field using multiline text, we need to format the input value.
          item.key === 'scope' &&
            item.type === ConnectorConfigFormItemType.MultilineText && {
              setValueAs: (value) => formatMultiLineScopeInput(String(value)),
            }
        ),
      }),
      placeholder: item.placeholder,
      error,
    });

    if (item.type === ConnectorConfigFormItemType.Text) {
      return (
        <TextInput
          {...buildCommonProperties()}
          // TODO: update connectors form config and remove RegExp check
          isConfidential={item.isConfidential ?? /(Key|Secret)$/.test(item.key)}
        />
      );
    }

    if (item.type === ConnectorConfigFormItemType.MultilineText) {
      return <Textarea rows={5} {...buildCommonProperties()} />;
    }

    if (item.type === ConnectorConfigFormItemType.Number) {
      return <TextInput type="number" {...buildCommonProperties()} />;
    }

    return (
      <Controller
        name={`formConfig.${item.key}`}
        control={control}
        rules={{
          // For switch, "false" will be treated as an empty value, so we need to set required to false.
          required: item.type === ConnectorConfigFormItemType.Switch ? false : item.required,
          validate:
            item.type === ConnectorConfigFormItemType.Json
              ? (value) =>
                  (typeof value === 'string' && jsonValidator(value)) ||
                  t('errors.invalid_json_format')
              : undefined,
        }}
        render={({ field: { onChange, value } }) => {
          if (item.type === ConnectorConfigFormItemType.Switch) {
            return (
              <Switch
                label={item.description}
                checked={typeof value === 'boolean' ? value : false}
                onChange={({ currentTarget: { checked } }) => {
                  onChange(checked);
                }}
              />
            );
          }

          if (item.type === ConnectorConfigFormItemType.Select) {
            return (
              <Select
                options={item.selectItems}
                value={typeof value === 'string' ? value : undefined}
                error={error}
                onChange={onChange}
              />
            );
          }

          if (item.type === ConnectorConfigFormItemType.MultiSelect) {
            return (
              <CheckboxGroup
                options={item.selectItems}
                value={
                  Array.isArray(value) &&
                  value.every((item): item is string => typeof item === 'string')
                    ? value
                    : []
                }
                className={styles.multiSelect}
                onChange={onChange}
              />
            );
          }

          if (item.type === ConnectorConfigFormItemType.Json) {
            return (
              <CodeEditor
                language="json"
                error={error}
                value={typeof value === 'string' ? value : '{}'}
                onChange={onChange}
              />
            );
          }

          // Default (unknown) type is "Text"
          // This will happen when connector's version is ahead of AC
          return (
            <TextInput
              error={error}
              value={typeof value === 'string' ? value : ''}
              onChange={onChange}
            />
          );
        }}
      />
    );
  };

  return (
    <>
      {formItems.map((item) =>
        showFormItems(item) &&
        // SMS/email connectors own their `translations` field + the Unified editor's four
        // defensive fields (`unifiedTemplate`, `variables`, `unifiedTranslations`,
        // `templateEditorMode`) inside `ConnectorTemplatesEditor`; skip the standalone render so
        // they do not surface as their own (empty) form fields. Social connectors have no
        // `translations`/unified items, so the skip is a harmless no-op there.
        !(
          connectorType !== ConnectorType.Social &&
          (item.key === 'translations' || isUnifiedFormField(item.key))
        ) ? (
          <FormField
            key={item.key}
            isRequired={item.required}
            // Tooltip is currently string and does not support i18n.
            tip={item.tooltip}
            title={<DangerousRaw>{item.label}</DangerousRaw>}
          >
            {renderFormItem(item)}
            {
              //  The Switch component displays the description inside the switch box.
              Boolean(item.description && item.type !== ConnectorConfigFormItemType.Switch) && (
                <div className={styles.description}>{item.description}</div>
              )
            }
          </FormField>
        ) : null
      )}
    </>
  );
}

export default ConfigFormFields;
