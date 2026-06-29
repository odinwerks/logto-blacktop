import { ConnectorConfigFormItemType, type ConnectorConfigFormItem } from '@logto/connector-kit';

import { initFormData, parseFormConfig } from './connector-form';

const translationsItem: ConnectorConfigFormItem = {
  key: 'translations',
  label: 'Translations',
  type: ConnectorConfigFormItemType.Json,
  required: false,
};

describe('parseFormConfig - translations', () => {
  it('parses the translations JSON dictionary and preserves it in the connector config', () => {
    // The inline `ConnectorTemplatesEditor` writes `formConfig.translations` back as a JSON string
    // (via `setValue('formConfig.translations', JSON.stringify(next))`). `parseFormConfig` must
    // surface the parsed dictionary in the PATCHed connector config so edits persist on save.
    const config = parseFormConfig(
      { translations: JSON.stringify({ 'zh-CN': { code: '验证码 {{code}}' } }) },
      [translationsItem]
    );

    expect(config.translations).toEqual({ 'zh-CN': { code: '验证码 {{code}}' } });
  });

  it('keeps the translations field as an empty object when nothing is configured', () => {
    const config = parseFormConfig({ translations: '{}' }, [translationsItem]);

    expect(config.translations).toEqual({});
  });

  it('preserves the translations entry even when its form item is not registered in formItems', () => {
    // Defensive save: a connector may carry a `translations` value even if its `formItems` do not
    // declare the field. `parseFormConfig` must not silently drop it, otherwise localization edits
    // from the inline template editor are lost on save.
    const config = parseFormConfig({ translations: '{"zh-CN":{"code":"验证码"}}' }, []);

    expect(config.translations).toEqual({ 'zh-CN': { code: '验证码' } });
  });

  it('preserves an already-parsed translations object when the form item is absent', () => {
    const config = parseFormConfig({ translations: { en: { greeting: 'Hello' } } }, []);

    expect(config.translations).toEqual({ en: { greeting: 'Hello' } });
  });
});

describe('initFormData - translations', () => {
  it('seeds translations from rawConfig even when the form item is not declared', () => {
    const data = initFormData(
      [{ key: 'templates', label: 'Templates', type: ConnectorConfigFormItemType.Json }],
      { translations: { 'zh-CN': { code: '验证码' } } }
    );

    expect(data.translations).toBe(JSON.stringify({ 'zh-CN': { code: '验证码' } }, null, 2));
  });

  it('omits translations when the rawConfig has no translations value', () => {
    const data = initFormData(
      [{ key: 'templates', label: 'Templates', type: ConnectorConfigFormItemType.Json }],
      { templates: [] }
    );

    expect(data.translations).toBeUndefined();
  });
});
