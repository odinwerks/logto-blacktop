/* eslint-disable unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import { TemplateType } from '@logto/connector-kit';

import { dummyPayload } from './dummy-data';
import { renderPreview } from './preview';
import type { PreviewInput } from './types';

const parseIfString = (str: string): Record<string, string> => {
  const matches = [...str.matchAll(/<If type="([^"]+)">([\s\S]*?)<\/If>/gi)];
  if (matches.length === 0) {
    return { Generic: str };
  }
  return Object.fromEntries(
    matches.map((m) => [m[1]!, m[2]!])
  );
};

const mailgunPreviewInput = (overrides: any = {}): PreviewInput => {
  const { template, unifiedSubjects, ...rest } = overrides;
  const content = template?.content ?? (template ? undefined : '<b>{{code}}</b>');
  const text = template?.text;
  const subjectStr = template?.subject ?? (template ? undefined : 'Code {{code}}');

  const resolvedTemplate: PreviewInput['template'] = {
    ...(content !== undefined ? { content } : {}),
    ...(text !== undefined ? { text } : {}),
  };

  const resolvedSubjects = unifiedSubjects ?? (subjectStr !== undefined ? parseIfString(subjectStr) : {});

  return {
    kind: 'email-mailgun',
    template: resolvedTemplate,
    unifiedSubjects: resolvedSubjects,
    variables: {},
    translations: {},
    ...rest,
  };
};

describe('renderPreview — Mailgun', () => {
  it('renders each present field with dummy data', () => {
    expect(renderPreview(mailgunPreviewInput(), TemplateType.SignIn, 'en', dummyPayload)).toEqual({
      subject: 'Code 000000',
      content: '<b>000000</b>',
    });
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

  it('inlines variables per type with Generic fallback', () => {
    const input = mailgunPreviewInput({
      template: { subject: '{{brand}} code {{code}}', content: '<b>{{code}}</b>' },
      variables: { brand: { SignIn: 'Sign-in App', Generic: 'Logto' } },
    });

    expect(renderPreview(input, TemplateType.SignIn, 'en', dummyPayload).subject).toBe(
      'Sign-in App code 000000'
    );
    expect(renderPreview(input, TemplateType.Register, 'en', dummyPayload).subject).toBe(
      'Logto code 000000'
    );
  });

  it('falls back to Generic for variables when the specific column is an empty string', () => {
    const input = mailgunPreviewInput({
      template: { subject: '{{brand}} code {{code}}', content: '<b>{{code}}</b>' },
      variables: { brand: { SignIn: '', Generic: 'Logto' } },
    });

    expect(renderPreview(input, TemplateType.SignIn, 'en', dummyPayload).subject).toBe(
      'Logto code 000000'
    );
  });

  it('resolves {{t.K}} from the preview locale flat dict', () => {
    const input = mailgunPreviewInput({
      template: { subject: '{{t.greeting}} {{code}}', content: '<b>{{code}}</b>' },
      translations: { en: { greeting: 'Welcome back!' } },
    });

    expect(renderPreview(input, TemplateType.SignIn, 'en', dummyPayload).subject).toBe(
      'Welcome back! 000000'
    );
  });

  it('falls back to the parent locale, then en, then the first available language', () => {
    const input = mailgunPreviewInput({
      template: { subject: '{{t.greeting}}', content: '<b>{{code}}</b>' },
      translations: {
        en: { greeting: 'Hello!' },
        ka: { greeting: 'სალამი!' },
        zh: { greeting: '你好!' },
      },
    });

    expect(renderPreview(input, TemplateType.Generic, 'ka', dummyPayload).subject).toBe('სალამი!');
    expect(renderPreview(input, TemplateType.Generic, 'en', dummyPayload).subject).toBe('Hello!');
    // Zh-CN → parent 'zh'.
    expect(renderPreview(input, TemplateType.Generic, 'zh-CN', dummyPayload).subject).toBe('你好!');
    // Unknown locale → 'en' fallback.
    expect(renderPreview(input, TemplateType.Generic, 'fr', dummyPayload).subject).toBe('Hello!');
  });

  it('leaves unknown root handlebars verbatim (matching runtime behavior)', () => {
    const input = mailgunPreviewInput({
      template: { subject: '{{unknown}} {{code}}', content: '<b>{{code}}</b>' },
    });

    expect(renderPreview(input, TemplateType.Generic, 'en', dummyPayload).subject).toBe(
      '{{unknown}} 000000'
    );
  });

  it('leaves {{t.K}} verbatim when no translation key is present (matching runtime behavior)', () => {
    const noTranslations = mailgunPreviewInput({
      template: { subject: 'Hello {{t.missingKey}} {{code}}', content: '<b>{{code}}</b>' },
    });

    expect(renderPreview(noTranslations, TemplateType.SignIn, 'en', dummyPayload).subject).toBe(
      'Hello {{t.missingKey}} 000000'
    );

    // Also the case where a translation dict resolves but does NOT define the requested key:
    const dictWithoutKey = mailgunPreviewInput({
      template: { subject: 'Hello {{t.missingKey}} {{code}}', content: '<b>{{code}}</b>' },
      translations: { en: { greeting: 'Welcome!' } },
    });

    expect(renderPreview(dictWithoutKey, TemplateType.Register, 'en', dummyPayload).subject).toBe(
      'Hello  000000'
    );
  });

  it('applies dummy {{email}} and {{phone}} values', () => {
    const input = mailgunPreviewInput({
      template: { subject: 'To {{email}} / {{phone}} code {{code}}', content: '<b>{{code}}</b>' },
    });

    expect(renderPreview(input, TemplateType.Generic, 'en', dummyPayload).subject).toBe(
      'To user@example.com / +1234567890 code 000000'
    );
  });

  it('omits absent fields from the rendered output', () => {
    const input = mailgunPreviewInput({ template: {} });

    expect(renderPreview(input, TemplateType.Generic, 'en', dummyPayload)).toEqual({});
  });

  it('renders the text part when provided', () => {
    const input = mailgunPreviewInput({
      template: { content: '<b>{{code}}</b>', text: 'Code: {{code}}' },
    });

    expect(renderPreview(input, TemplateType.SignIn, 'en', dummyPayload)).toEqual({
      content: '<b>000000</b>',
      text: 'Code: 000000',
    });
  });
});
/* eslint-enable */
