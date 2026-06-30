/* eslint-disable unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import { TemplateType } from '@logto/connector-kit';

import {
  flattenTranslationsForType,
  inlineVariables,
  rewriteLocalizations,
  compileUnified,
} from './compiler';
import type { CompileInput } from './types';

const parseIfString = (str: string): Record<string, string> => {
  const matches = [...str.matchAll(/<If type="([^"]+)">([\s\S]*?)<\/If>/gi)];
  if (matches.length === 0) {
    return { Generic: str };
  }
  return Object.fromEntries(
    matches.map((m) => [m[1]!, m[2]!])
  );
};

const mailgunInput = (overrides: any = {}): CompileInput => {
  const { template, unifiedSubjects, ...rest } = overrides;
  const content = template?.content ?? (template ? undefined : 'Your code is {{code}}.');
  const text = template?.text ?? (template ? undefined : undefined);
  const subjectStr = template?.subject ?? (template ? undefined : 'Code {{code}}');

  const resolvedTemplate = {
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

describe('inlineVariables', () => {
  it('returns the empty string for an empty body', () => {
    expect(inlineVariables('', { app: { Generic: 'Logto' } }, TemplateType.SignIn)).toBe('');
  });

  it('replaces {{var.X}} with the per-type value', () => {
    const variables = { appName: { SignIn: 'Sign-in app', Generic: 'Logto' } };

    expect(inlineVariables('Welcome to {{var.appName}}', variables, TemplateType.SignIn)).toBe(
      'Welcome to Sign-in app'
    );
  });

  it('falls back to the Generic column when the type column is absent', () => {
    const variables = { appName: { Generic: 'Logto' } };

    expect(inlineVariables('Welcome to {{var.appName}}', variables, TemplateType.SignIn)).toBe(
      'Welcome to Logto'
    );
  });

  it('falls back to the Generic column when the type column is an empty string', () => {
    const variables = { appName: { SignIn: '', Generic: 'Logto' } };

    expect(inlineVariables('Welcome to {{var.appName}}', variables, TemplateType.SignIn)).toBe(
      'Welcome to Logto'
    );
  });

  it('inlines the empty string for an undefined variable key', () => {
    expect(inlineVariables('Hi {{var.unknown}}', {}, TemplateType.SignIn)).toBe('Hi ');
  });

  it('does not touch {{t.key}} localization placeholders or runtime payload handlebars', () => {
    const variables = { appName: { Generic: 'Logto' } };
    const body = '{{var.appName}} {{t.greeting}} {{code}}';

    expect(inlineVariables(body, variables, TemplateType.SignIn)).toBe(
      'Logto {{t.greeting}} {{code}}'
    );
  });
});

describe('rewriteLocalizations', () => {
  it('returns the empty string for an empty body', () => {
    expect(rewriteLocalizations('', TemplateType.SignIn)).toBe('');
  });

  it('rewrites {{t.K}} to namespaced {{t.K__T}} for the target type', () => {
    expect(rewriteLocalizations('Hello {{t.title}}', TemplateType.SignIn)).toBe(
      'Hello {{t.title__SignIn}}'
    );
  });

  it('rewrites every {{t.K}} occurrence in a multi-key body', () => {
    expect(rewriteLocalizations('{{t.a}} and {{t.b}}', TemplateType.Register)).toBe(
      '{{t.a__Register}} and {{t.b__Register}}'
    );
  });

  it('does not touch {{var.X}} or runtime payload handlebars', () => {
    expect(rewriteLocalizations('{{var.x}} {{code}}', TemplateType.SignIn)).toBe(
      '{{var.x}} {{code}}'
    );
  });
});

describe('flattenTranslationsForType', () => {
  it('emits K__T = per-type value with Generic fallback', () => {
    const translations = {
      en: { greeting: { SignIn: 'Sign in!', Generic: 'Hello!' } },
      ka: { greeting: { Generic: 'სალამი!' } },
    };

    expect(
      flattenTranslationsForType(translations, new Set(['greeting']), TemplateType.SignIn)
    ).toEqual({
      en: { greeting__SignIn: 'Sign in!' },
      ka: { greeting__SignIn: 'სალამი!' },
    });
  });

  it('omits empty values and drops empty per-language dictionaries', () => {
    const translations = {
      en: { greeting: { Generic: 'Hello!' }, missing: { Generic: '' } },
      ka: { greeting: { Generic: '' } },
    };

    expect(
      flattenTranslationsForType(
        translations,
        new Set(['greeting', 'missing']),
        TemplateType.SignIn
      )
    ).toEqual({ en: { greeting__SignIn: 'Hello!' } });
  });

  it('emits the empty object when no keys are referenced', () => {
    expect(
      flattenTranslationsForType(
        { en: { greeting: { Generic: 'Hi' } } },
        new Set(),
        TemplateType.SignIn
      )
    ).toEqual({});
  });
});

describe('compileUnified — Mailgun', () => {
  it('emits a deliveries record with subject/html (and optional text) per type', () => {
    const output = compileUnified(
      mailgunInput({
        template: { subject: 'Code {{code}}', content: '<b>{{code}}</b>', text: 'plain {{code}}' },
      })
    );

    expect(output.rows.kind).toBe('email-mailgun');

    const signIn = output.rows.deliveries[TemplateType.SignIn];
    expect(signIn).toEqual({
      subject: 'Code {{code}}',
      html: '<b>{{code}}</b>',
      text: 'plain {{code}}',
    });
  });

  it('omits subject/text when the template does not define them', () => {
    const output = compileUnified(mailgunInput({ template: { content: '<b>{{code}}</b>' } }));

    const signIn = output.rows.deliveries[TemplateType.SignIn];
    expect(signIn).toEqual({ html: '<b>{{code}}</b>' });
    expect(signIn?.subject).toBeUndefined();
    expect(signIn?.text).toBeUndefined();
  });

  it('always emits a Generic deliveries row even when html is empty', () => {
    const output = compileUnified(mailgunInput({ template: { content: '' } }));

    expect(output.rows.deliveries[TemplateType.Generic]).toEqual({ html: '' });
    // Non-Generic empty types are skipped.
    expect(output.rows.deliveries[TemplateType.SignIn]).toBeUndefined();
  });

  it('rewrites {{t.K}} per field and unions the keys across subject/content/text', () => {
    const output = compileUnified(
      mailgunInput({
        template: {
          subject: '{{t.subjectTitle}} {{code}}',
          content: '<b>{{t.bodyTitle}}</b> {{code}}',
          text: '{{t.bodyTitle}} {{code}}',
        },
        translations: {
          en: {
            subjectTitle: { Generic: 'Your code' },
            bodyTitle: { SignIn: 'Sign in', Generic: 'Code' },
          },
        },
      })
    );

    const signIn = output.rows.deliveries[TemplateType.SignIn];
    expect(signIn?.subject).toBe('{{t.subjectTitle__SignIn}} {{code}}');
    expect(signIn?.html).toBe('<b>{{t.bodyTitle__SignIn}}</b> {{code}}');
    expect(signIn?.text).toBe('{{t.bodyTitle__SignIn}} {{code}}');

    expect(output.translations.en).toEqual({
      subjectTitle__SignIn: 'Your code',
      subjectTitle__Register: 'Your code',
      subjectTitle__ForgotPassword: 'Your code',
      subjectTitle__Generic: 'Your code',
      subjectTitle__OrganizationInvitation: 'Your code',
      subjectTitle__UserPermissionValidation: 'Your code',
      subjectTitle__BindNewIdentifier: 'Your code',
      subjectTitle__MfaVerification: 'Your code',
      subjectTitle__BindMfa: 'Your code',
      bodyTitle__SignIn: 'Sign in',
      bodyTitle__Register: 'Code',
      bodyTitle__ForgotPassword: 'Code',
      bodyTitle__Generic: 'Code',
      bodyTitle__OrganizationInvitation: 'Code',
      bodyTitle__UserPermissionValidation: 'Code',
      bodyTitle__BindNewIdentifier: 'Code',
      bodyTitle__MfaVerification: 'Code',
      bodyTitle__BindMfa: 'Code',
    });
  });

  it('preserves defined but unreferenced translation keys', () => {
    const output = compileUnified(
      mailgunInput({
        template: {
          content: 'No references here.',
        },
        translations: {
          en: {
            unreferencedKey: { Generic: 'This should survive' },
          },
        },
      })
    );

    expect(output.translations.en).toEqual({
      unreferencedKey__SignIn: 'This should survive',
      unreferencedKey__Register: 'This should survive',
      unreferencedKey__ForgotPassword: 'This should survive',
      unreferencedKey__Generic: 'This should survive',
      unreferencedKey__OrganizationInvitation: 'This should survive',
      unreferencedKey__UserPermissionValidation: 'This should survive',
      unreferencedKey__BindNewIdentifier: 'This should survive',
      unreferencedKey__MfaVerification: 'This should survive',
      unreferencedKey__BindMfa: 'This should survive',
    });
  });
});

describe('compileUnified — empty template', () => {
  it('emits a single empty Generic row for an empty Mailgun template', () => {
    const output = compileUnified(mailgunInput({ template: {} }));

    expect(output.rows.deliveries).toEqual({ [TemplateType.Generic]: { html: '' } });
  });
});
/* eslint-enable */
