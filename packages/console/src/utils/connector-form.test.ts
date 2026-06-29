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

describe('parseFormConfig - unified editor fields', () => {
  it('preserves the four unified fields (parsed) even when not registered in formItems', () => {
    const config = parseFormConfig(
      {
        unifiedTemplate: JSON.stringify({ content: 'Code {{code}}' }),
        variables: JSON.stringify({ brand: { Generic: 'Logto' } }),
        unifiedTranslations: JSON.stringify({ en: { greeting: { Generic: 'Hi' } } }),
        templateEditorMode: JSON.stringify('unified'),
      },
      []
    );

    expect(config.unifiedTemplate).toEqual({ content: 'Code {{code}}' });
    expect(config.variables).toEqual({ brand: { Generic: 'Logto' } });
    expect(config.unifiedTranslations).toEqual({ en: { greeting: { Generic: 'Hi' } } });
    expect(config.templateEditorMode).toBe('unified');
  });

  it('preserves an already-parsed unified field object when the form item is absent', () => {
    const config = parseFormConfig(
      { unifiedTemplate: { content: 'Hi' }, templateEditorMode: 'classic' },
      []
    );

    expect(config.unifiedTemplate).toEqual({ content: 'Hi' });
    expect(config.templateEditorMode).toBe('classic');
  });

  it('drops falsy unified field values (matching the empty-input filter)', () => {
    const config = parseFormConfig({ unifiedTemplate: '', templateEditorMode: '' }, []);

    expect(config.unifiedTemplate).toBeUndefined();
    expect(config.templateEditorMode).toBeUndefined();
  });
});

describe('initFormData - unified editor fields', () => {
  it('seeds the four unified fields from rawConfig when not declared in formItems', () => {
    const data = initFormData(
      [{ key: 'templates', label: 'Templates', type: ConnectorConfigFormItemType.Json }],
      {
        unifiedTemplate: { content: 'Code {{code}}' },
        variables: { brand: { Generic: 'Logto' } },
        unifiedTranslations: { en: { greeting: { Generic: 'Hi' } } },
        templateEditorMode: 'unified',
      }
    );

    expect(data.unifiedTemplate).toBe(JSON.stringify({ content: 'Code {{code}}' }, null, 2));
    expect(data.variables).toBe(JSON.stringify({ brand: { Generic: 'Logto' } }, null, 2));
    expect(data.unifiedTranslations).toBe(
      JSON.stringify({ en: { greeting: { Generic: 'Hi' } } }, null, 2)
    );
    expect(data.templateEditorMode).toBe(JSON.stringify('unified', null, 2));
  });

  it('does not override a formItem-declared unified field (defensive seed is skipped)', () => {
    const data = initFormData(
      [{ key: 'templateEditorMode', label: 'Mode', type: ConnectorConfigFormItemType.Text }],
      { templateEditorMode: 'unified' }
    );

    // The formItem path uses the raw config value directly (no JSON.stringify for Text type).
    expect(data.templateEditorMode).toBe('unified');
  });
});
