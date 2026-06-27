import { type EmailTemplate, type EmailTemplateDetails, TemplateType } from '@logto/schemas';

import {
  createEmptyEmailTemplateDetails,
  formatTemplateTypeLabel,
  groupTemplatesByLanguage,
  isDetailsEmpty,
  normalizeDetails,
  templateTypes,
} from './utils';

const buildTemplate = (
  languageTag: string,
  templateType: TemplateType,
  details: EmailTemplateDetails
): EmailTemplate => ({
  tenantId: 'default',
  id: `${languageTag}-${templateType}`,
  languageTag,
  templateType,
  details,
  createdAt: 0,
});

describe('groupTemplatesByLanguage', () => {
  it('returns an empty record for no templates', () => {
    expect(groupTemplatesByLanguage([])).toEqual({});
  });

  it('groups a single template under its languageTag and templateType', () => {
    const template = buildTemplate('zh-CN', TemplateType.SignIn, {
      subject: 'S',
      content: 'C',
    });
    expect(groupTemplatesByLanguage([template])).toEqual({
      'zh-CN': { SignIn: { subject: 'S', content: 'C' } },
    });
  });

  it('distributes templates across languages and types', () => {
    const templates = [
      buildTemplate('en', TemplateType.SignIn, { subject: 's-en', content: 'c-en' }),
      buildTemplate('en', TemplateType.Generic, { subject: 'g-en', content: 'gc-en' }),
      buildTemplate('zh-CN', TemplateType.ForgotPassword, { subject: 's-zh', content: 'c-zh' }),
    ];

    expect(groupTemplatesByLanguage(templates)).toEqual({
      en: {
        SignIn: { subject: 's-en', content: 'c-en' },
        Generic: { subject: 'g-en', content: 'gc-en' },
      },
      'zh-CN': {
        ForgotPassword: { subject: 's-zh', content: 'c-zh' },
      },
    });
  });

  it('keeps the last definition when a (languageTag, templateType) pair repeats', () => {
    const first = buildTemplate('en', TemplateType.SignIn, { subject: 'first', content: 'c1' });
    const second = buildTemplate('en', TemplateType.SignIn, { subject: 'second', content: 'c2' });

    expect(groupTemplatesByLanguage([first, second]).en?.SignIn).toEqual({
      subject: 'second',
      content: 'c2',
    });
  });
});

describe('isDetailsEmpty', () => {
  it('treats missing details as empty', () => {
    expect(isDetailsEmpty()).toBe(true);
  });

  it('is empty when both subject and content are blank', () => {
    expect(isDetailsEmpty({ subject: '  ', content: '' })).toBe(true);
  });

  it('is empty when only content has text', () => {
    expect(isDetailsEmpty({ subject: '', content: 'has body' })).toBe(true);
  });

  it('is not empty when both subject and content have text', () => {
    expect(isDetailsEmpty({ subject: 'Hi', content: 'body' })).toBe(false);
  });
});

describe('normalizeDetails', () => {
  it('drops blank optional fields so they are omitted from the canonical shape', () => {
    expect(
      normalizeDetails({
        subject: 'Hi',
        content: 'body',
        contentType: 'text/html',
        replyTo: '',
        sendFrom: '',
      })
    ).toEqual({ subject: 'Hi', content: 'body', contentType: 'text/html' });
  });

  it('defaults a missing contentType to text/html', () => {
    expect(normalizeDetails({ subject: 'Hi', content: 'body' })).toEqual({
      subject: 'Hi',
      content: 'body',
      contentType: 'text/html',
    });
  });

  it('keeps populated optional fields and preserves text/plain', () => {
    expect(
      normalizeDetails({
        subject: 'Hi',
        content: 'body',
        contentType: 'text/plain',
        replyTo: 'reply@example.com',
        sendFrom: 'from@example.com',
      })
    ).toEqual({
      subject: 'Hi',
      content: 'body',
      contentType: 'text/plain',
      replyTo: 'reply@example.com',
      sendFrom: 'from@example.com',
    });
  });

  it('treats `null`/empty optionals identically for stable dirty comparison', () => {
    const withBlankReplyTo = normalizeDetails({ subject: 'Hi', content: 'body', replyTo: '' });
    const withoutReplyTo = normalizeDetails({ subject: 'Hi', content: 'body' });

    expect(JSON.stringify(withBlankReplyTo)).toBe(JSON.stringify(withoutReplyTo));
  });
});

describe('createEmptyEmailTemplateDetails', () => {
  it('defaults to empty strings and html content type', () => {
    expect(createEmptyEmailTemplateDetails()).toEqual({
      subject: '',
      content: '',
      contentType: 'text/html',
    });
  });
});

describe('formatTemplateTypeLabel', () => {
  it('splits CamelCase enum values into human-readable labels', () => {
    expect(formatTemplateTypeLabel(TemplateType.SignIn)).toBe('Sign In');
    expect(formatTemplateTypeLabel(TemplateType.ForgotPassword)).toBe('Forgot Password');
    expect(formatTemplateTypeLabel(TemplateType.OrganizationInvitation)).toBe(
      'Organization Invitation'
    );
    expect(formatTemplateTypeLabel(TemplateType.BindNewIdentifier)).toBe('Bind New Identifier');
  });

  it('leaves single-word types untouched', () => {
    expect(formatTemplateTypeLabel(TemplateType.Register)).toBe('Register');
    expect(formatTemplateTypeLabel(TemplateType.Generic)).toBe('Generic');
  });
});

describe('templateTypes', () => {
  it('exposes all live template types in declaration order', () => {
    expect(templateTypes).toHaveLength(9);
    expect(templateTypes[0]).toBe(TemplateType.SignIn);
    expect(templateTypes).toContain(TemplateType.BindMfa);
    // The deprecated `Test` value lives on the separate `VerificationCodeType` enum.
    expect((templateTypes as string[]).includes('Test')).toBe(false);
  });
});
