import { TemplateType } from '@logto/connector-kit';

import { dummyPayload } from './dummy-data';
import { renderPreview } from './preview';
import type { PreviewInput } from './types';

const ubillPreviewInput = (overrides: Partial<PreviewInput> = {}): PreviewInput => ({
  kind: 'sms-ubill',
  template: { content: 'Your code is {{code}}.' },
  variables: {},
  translations: {},
  ...overrides,
});

describe('renderPreview — Ubill SMS', () => {
  it('applies dummy payload {{code}} to the content field', () => {
    expect(renderPreview(ubillPreviewInput(), TemplateType.SignIn, 'en', dummyPayload)).toEqual({
      content: 'Your code is 000000.',
    });
  });

  it('resolves <If> blocks for the selected type', () => {
    const input = ubillPreviewInput({
      template: {
        content:
          '<If type="SignIn">Sign in: {{code}}</If><If type="Register">Sign up: {{code}}</If>',
      },
    });

    expect(renderPreview(input, TemplateType.SignIn, 'en', dummyPayload)).toEqual({
      content: 'Sign in: 000000',
    });
    expect(renderPreview(input, TemplateType.Register, 'en', dummyPayload)).toEqual({
      content: 'Sign up: 000000',
    });
  });

  it('inlines variables per type with Generic fallback', () => {
    const input = ubillPreviewInput({
      template: { content: '{{var.brand}} code {{code}}' },
      variables: { brand: { SignIn: 'Sign-in App', Generic: 'Logto' } },
    });

    expect(renderPreview(input, TemplateType.SignIn, 'en', dummyPayload).content).toBe(
      'Sign-in App code 000000'
    );
    expect(renderPreview(input, TemplateType.Register, 'en', dummyPayload).content).toBe(
      'Logto code 000000'
    );
  });

  it('resolves {{t.K}} from the preview locale dict (per-type with Generic fallback)', () => {
    const input = ubillPreviewInput({
      template: { content: '{{t.greeting}} {{code}}' },
      translations: { en: { greeting: { SignIn: 'Welcome back!', Generic: 'Hello!' } } },
    });

    expect(renderPreview(input, TemplateType.SignIn, 'en', dummyPayload).content).toBe(
      'Welcome back! 000000'
    );
    expect(renderPreview(input, TemplateType.Register, 'en', dummyPayload).content).toBe(
      'Hello! 000000'
    );
  });

  it('falls back to the parent locale, then en, then the first available language', () => {
    const input = ubillPreviewInput({
      template: { content: '{{t.greeting}}' },
      translations: {
        en: { greeting: { Generic: 'Hello!' } },
        ka: { greeting: { Generic: 'სალამი!' } },
        zh: { greeting: { Generic: '你好!' } },
      },
    });

    expect(renderPreview(input, TemplateType.Generic, 'ka', dummyPayload).content).toBe('სალამი!');
    expect(renderPreview(input, TemplateType.Generic, 'en', dummyPayload).content).toBe('Hello!');
    // Zh-CN → parent 'zh'.
    expect(renderPreview(input, TemplateType.Generic, 'zh-CN', dummyPayload).content).toBe('你好!');
    // Unknown locale → 'en' fallback.
    expect(renderPreview(input, TemplateType.Generic, 'fr', dummyPayload).content).toBe('Hello!');
  });

  it('leaves unknown root handlebars verbatim (matching runtime behavior)', () => {
    const input = ubillPreviewInput({ template: { content: '{{unknown}} {{code}}' } });

    expect(renderPreview(input, TemplateType.Generic, 'en', dummyPayload).content).toBe(
      '{{unknown}} 000000'
    );
  });

  it('leaves {{t.K}} verbatim when no translation key is present (matching runtime behavior)', () => {
    // Runtime: `getLocalizedPayload` only injects a `t` dict when one can be resolved; when it
    // doesn't, `replaceSendMessageHandlebars` sees no `t` root → `{{t.missingKey}}` survives
    // verbatim. Preview must match: when the resolved dict has no values for the requested key,
    // the literal placeholder survives rather than being replaced with an empty string.
    const noTranslations = ubillPreviewInput({
      template: { content: 'Hello {{t.missingKey}} {{code}}' },
    });

    expect(renderPreview(noTranslations, TemplateType.SignIn, 'en', dummyPayload).content).toBe(
      'Hello {{t.missingKey}} 000000'
    );

    // Also the case where a translation dict resolves but does NOT define the requested key:
    // the per-type dict has entries (so `t` would be `{}`), but `t.missingKey` is still absent.
    const dictWithoutKey = ubillPreviewInput({
      template: { content: 'Hello {{t.missingKey}} {{code}}' },
      translations: { en: { greeting: { SignIn: 'Welcome!' } } },
    });

    expect(renderPreview(dictWithoutKey, TemplateType.Register, 'en', dummyPayload).content).toBe(
      'Hello {{t.missingKey}} 000000'
    );
  });

  it('applies dummy {{email}} and {{phone}} values', () => {
    const input = ubillPreviewInput({
      template: { content: 'To {{email}} / {{phone}} code {{code}}' },
    });

    expect(renderPreview(input, TemplateType.Generic, 'en', dummyPayload).content).toBe(
      'To user@example.com / +1234567890 code 000000'
    );
  });

  it('omits absent fields from the rendered output', () => {
    const input = ubillPreviewInput({ template: {} });

    expect(renderPreview(input, TemplateType.Generic, 'en', dummyPayload)).toEqual({});
  });
});

const mailgunPreviewInput = (overrides: Partial<PreviewInput> = {}): PreviewInput => ({
  kind: 'email-mailgun',
  template: { subject: 'Code {{code}}', content: '<b>{{code}}</b>', text: 'plain {{code}}' },
  variables: {},
  translations: {},
  ...overrides,
});

describe('renderPreview — Mailgun', () => {
  it('renders each present field with dummy data', () => {
    expect(renderPreview(mailgunPreviewInput(), TemplateType.SignIn, 'en', dummyPayload)).toEqual({
      subject: 'Code 000000',
      content: '<b>000000</b>',
      text: 'plain 000000',
    });
  });

  it('omits the text field when the template does not define it', () => {
    const input = mailgunPreviewInput({
      template: { subject: 'S {{code}}', content: '<b>{{code}}</b>' },
    });
    const result = renderPreview(input, TemplateType.SignIn, 'en', dummyPayload);

    expect(result.text).toBeUndefined();
    expect(result.subject).toBe('S 000000');
  });

  it('resolves <If> blocks per field for the selected type', () => {
    const input = mailgunPreviewInput({
      template: {
        subject: '<If type="SignIn">Sign in code {{code}}</If>',
        content: '<If type="SignIn">Sign in <b>{{code}}</b></If>',
      },
    });

    expect(renderPreview(input, TemplateType.SignIn, 'en', dummyPayload)).toEqual({
      subject: 'Sign in code 000000',
      content: 'Sign in <b>000000</b>',
    });
    expect(renderPreview(input, TemplateType.Register, 'en', dummyPayload)).toEqual({
      subject: '',
      content: '',
    });
  });
});
