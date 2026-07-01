import { ConnectorType } from '@logto/connector-kit';

import {
  buildEmptyTemplateRow,
  contentTypeKeyFor,
  deriveEditorMode,
  extractableFieldsFor,
  isTemplateFilled,
  type ConnectorTemplateMode,
} from './mode';

describe('deriveEditorMode', () => {
  it('returns `sms` for SMS connectors regardless of the template shape', () => {
    expect(
      deriveEditorMode(ConnectorType.Sms, 'templates', [{ usageType: 'Generic', content: '' }])
    ).toBe('sms');
  });

  it('returns `email-content` for SMTP (`{usageType, contentType, subject, content}`)', () => {
    expect(
      deriveEditorMode(ConnectorType.Email, 'templates', [
        { usageType: 'SignIn', contentType: 'text/plain', subject: '', content: '' },
      ])
    ).toBe('email-content');
  });

  it('returns `email-content` for SendGrid (`{usageType, type, subject, content}`)', () => {
    expect(
      deriveEditorMode(ConnectorType.Email, 'templates', [
        { usageType: 'SignIn', type: 'text/plain', subject: '', content: '' },
      ])
    ).toBe('email-content');
  });

  it('returns `email-content` for AWS SES / Aliyun-DM (`{usageType, subject, content}`)', () => {
    expect(
      deriveEditorMode(ConnectorType.Email, 'templates', [
        { usageType: 'SignIn', subject: '', content: '' },
      ])
    ).toBe('email-content');
  });

  it('returns `email-alias` for Postmark (`{usageType, templateAlias}`)', () => {
    expect(
      deriveEditorMode(ConnectorType.Email, 'templates', [
        { usageType: 'SignIn', templateAlias: 'sign-in-template' },
      ])
    ).toBe('email-alias');
  });

  it('falls back to `email-content` when email templates have no rows', () => {
    expect(deriveEditorMode(ConnectorType.Email, 'templates', [])).toBe('email-content');
  });

  it('ignores a non-string `templateAlias` when distinguishing alias mode', () => {
    expect(
      deriveEditorMode(ConnectorType.Email, 'templates', [
        { usageType: 'SignIn', templateAlias: undefined, subject: '', content: '' },
      ])
    ).toBe('email-content');
  });
});

describe('extractableFieldsFor', () => {
  it.each<[ConnectorTemplateMode, readonly string[]]>([
    ['sms', ['content']],
    ['email-content', ['subject', 'content']],
    ['email-alias', []],
  ])('returns %j for mode %s', (mode, expected) => {
    expect(extractableFieldsFor(mode)).toEqual(expected);
  });
});

describe('contentTypeKeyFor', () => {
  it('detects the SMTP `contentType` key', () => {
    expect(contentTypeKeyFor({ contentType: 'text/plain' })).toBe('contentType');
  });

  it('detects the SendGrid/MailJunky `type` key', () => {
    expect(contentTypeKeyFor({ type: 'text/html' })).toBe('type');
  });

  it('prefers `contentType` when both keys are somehow present', () => {
    expect(contentTypeKeyFor({ contentType: 'text/plain', type: 'text/html' })).toBe('contentType');
  });

  it('returns undefined when neither key is present (AWS SES / Aliyun-DM)', () => {
    expect(contentTypeKeyFor({ subject: '', content: '' })).toBeUndefined();
  });

  it('returns undefined for a non-string `contentType`', () => {
    expect(contentTypeKeyFor({ contentType: undefined })).toBeUndefined();
  });

  it('returns undefined for an empty row', () => {
    expect(contentTypeKeyFor({})).toBeUndefined();
  });
});

describe('buildEmptyTemplateRow', () => {
  it('builds an SMS row with only `content`', () => {
    expect(buildEmptyTemplateRow('SignIn', 'sms')).toEqual({
      usageType: 'SignIn',
      content: '',
    });
  });

  it('builds a common email row without a content-type field when the connector has none', () => {
    expect(buildEmptyTemplateRow('SignIn', 'email-content')).toEqual({
      usageType: 'SignIn',
      subject: '',
      content: '',
    });
  });

  it("includes the connector's content-type field (defaulting to text/html) for SMTP", () => {
    expect(buildEmptyTemplateRow('Register', 'email-content', 'contentType')).toEqual({
      usageType: 'Register',
      subject: '',
      content: '',
      contentType: 'text/html',
    });
  });

  it('writes `type` (not `contentType`) when the connector uses that key (SendGrid/MailJunky)', () => {
    expect(buildEmptyTemplateRow('Generic', 'email-content', 'type')).toEqual({
      usageType: 'Generic',
      subject: '',
      content: '',
      type: 'text/html',
    });
  });

  it('builds a Postmark alias row with only `templateAlias`', () => {
    expect(buildEmptyTemplateRow('SignIn', 'email-alias')).toEqual({
      usageType: 'SignIn',
      templateAlias: '',
    });
  });

  it('covers every supported mode without throwing', () => {
    const modes: readonly ConnectorTemplateMode[] = ['sms', 'email-content', 'email-alias'];

    for (const mode of modes) {
      expect(() => buildEmptyTemplateRow('SignIn', mode)).not.toThrow();
    }
  });
});

describe('isTemplateFilled', () => {
  it('treats an SMS row with non-empty content as filled', () => {
    expect(isTemplateFilled({ usageType: 'SignIn', content: 'Your code is {{code}}' }, 'sms')).toBe(
      true
    );
  });

  it('treats an SMS row with empty content as not filled', () => {
    expect(isTemplateFilled({ usageType: 'SignIn', content: '' }, 'sms')).toBe(false);
  });

  it('treats an SMS row with missing content as not filled', () => {
    expect(isTemplateFilled({ usageType: 'SignIn' }, 'sms')).toBe(false);
  });

  it('treats a common-email row as filled when only content is set', () => {
    expect(
      isTemplateFilled({ usageType: 'SignIn', subject: '', content: '<p>hi</p>' }, 'email-content')
    ).toBe(true);
  });

  it('treats a common-email row as filled when only subject is set', () => {
    expect(
      isTemplateFilled({ usageType: 'SignIn', subject: 'Reset', content: '' }, 'email-content')
    ).toBe(true);
  });

  it('treats an empty common-email row (carrying a default contentType) as not filled', () => {
    // A synthetic empty row may carry `contentType: 'text/html'` without any real content; that
    // must NOT count as filled.
    expect(
      isTemplateFilled(
        { usageType: 'SignIn', subject: '', content: '', contentType: 'text/html' },
        'email-content'
      )
    ).toBe(false);
  });

  it('treats a Postmark alias row as filled when templateAlias is set', () => {
    expect(
      isTemplateFilled({ usageType: 'SignIn', templateAlias: 'sign-in-template' }, 'email-alias')
    ).toBe(true);
  });

  it('treats an empty Postmark alias row as not filled', () => {
    expect(isTemplateFilled({ usageType: 'SignIn', templateAlias: '' }, 'email-alias')).toBe(false);
  });

  it('ignores non-string field values', () => {
    expect(
      isTemplateFilled({ usageType: 'SignIn', subject: 42, content: undefined }, 'email-content')
    ).toBe(false);
  });
});
