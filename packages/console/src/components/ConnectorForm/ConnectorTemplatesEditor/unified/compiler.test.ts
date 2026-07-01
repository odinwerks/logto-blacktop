/* eslint-disable unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import { TemplateType } from '@logto/connector-kit';

import {
  inlineVariables,
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
  const subjectStr = template?.subject ?? (template ? undefined : 'Code {{code}}');

  const resolvedTemplate = {
    ...(content !== undefined ? { content } : {}),
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

  it('replaces {{X}} with the per-type value', () => {
    const variables = { appName: { SignIn: 'Sign-in app', Generic: 'Logto' } };

    expect(inlineVariables('Welcome to {{appName}}', variables, TemplateType.SignIn)).toBe(
      'Welcome to Sign-in app'
    );
  });

  it('falls back to the Generic column when the type column is absent', () => {
    const variables = { appName: { Generic: 'Logto' } };

    expect(inlineVariables('Welcome to {{appName}}', variables, TemplateType.SignIn)).toBe(
      'Welcome to Logto'
    );
  });

  it('falls back to the Generic column when the type column is an empty string', () => {
    const variables = { appName: { SignIn: '', Generic: 'Logto' } };

    expect(inlineVariables('Welcome to {{appName}}', variables, TemplateType.SignIn)).toBe(
      'Welcome to Logto'
    );
  });

  it('leaves the placeholder untouched for an undefined variable key', () => {
    expect(inlineVariables('Hi {{unknown}}', {}, TemplateType.SignIn)).toBe('Hi {{unknown}}');
  });

  it('does not touch {{t.key}} localization placeholders or runtime payload handlebars', () => {
    const variables = { appName: { Generic: 'Logto' } };
    const body = '{{appName}} {{t.greeting}} {{code}}';

    expect(inlineVariables(body, variables, TemplateType.SignIn)).toBe(
      'Logto {{t.greeting}} {{code}}'
    );
  });
});

describe('compileUnified — Mailgun', () => {
  it('emits a deliveries record with subject/html per type', () => {
    const output = compileUnified(
      mailgunInput({
        template: { subject: 'Code {{code}}', content: '<b>{{code}}</b>' },
      })
    );

    expect(output.rows.kind).toBe('email-mailgun');

    const signIn = output.rows.deliveries[TemplateType.SignIn];
    expect(signIn).toEqual({
      subject: 'Code {{code}}',
      html: '<b>{{code}}</b>',
    });
  });

  it('omits subject when the template does not define it', () => {
    const output = compileUnified(mailgunInput({ template: { content: '<b>{{code}}</b>' } }));

    const signIn = output.rows.deliveries[TemplateType.SignIn];
    expect(signIn).toEqual({ html: '<b>{{code}}</b>' });
    expect(signIn?.subject).toBeUndefined();
  });

  it('always emits a Generic deliveries row even when html is empty', () => {
    const output = compileUnified(mailgunInput({ template: { content: '' } }));

    expect(output.rows.deliveries[TemplateType.Generic]).toEqual({ html: '' });
    // Non-Generic empty types are skipped.
    expect(output.rows.deliveries[TemplateType.SignIn]).toBeUndefined();
  });

  it('copies translations verbatim and inlines variables but leaves inline {{t.keyName}} intact', () => {
    const output = compileUnified(
      mailgunInput({
        template: {
          subject: '{{subjectTitle}} {{code}}',
          content: '<b>{{bodyTitle}}</b> {{code}}',
        },
        variables: {
          subjectTitle: { Generic: '{{t.subjectTitleKey}}' },
          bodyTitle: { SignIn: '{{t.signInBodyTitle}}', Generic: '{{t.genericBodyTitle}}' },
        },
        translations: {
          en: {
            subjectTitleKey: 'Your code',
            signInBodyTitle: 'Sign in',
            genericBodyTitle: 'Code',
          },
        },
      })
    );

    const signIn = output.rows.deliveries[TemplateType.SignIn];
    expect(signIn?.subject).toBe('{{t.subjectTitleKey}} {{code}}');
    expect(signIn?.html).toBe('<b>{{t.signInBodyTitle}}</b> {{code}}');

    expect(output.translations).toEqual({
      en: {
        subjectTitleKey: 'Your code',
        signInBodyTitle: 'Sign in',
        genericBodyTitle: 'Code',
      },
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
            unreferencedKey: 'This should survive',
          },
        },
      })
    );

    expect(output.translations.en).toEqual({
      unreferencedKey: 'This should survive',
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
