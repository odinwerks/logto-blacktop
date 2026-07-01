import { seedUnifiedFromClassic } from './compiler';
import type { SeedUnifiedFromClassicInput } from './types';

const mailgunRows = (
  deliveries: Record<string, { subject?: string; html?: string; text?: string }>
): SeedUnifiedFromClassicInput => ({ kind: 'email-mailgun', deliveries });

describe('seedUnifiedFromClassic — Mailgun deliveries', () => {
  it('seeds subject/content from per-type deliveries (html → content)', () => {
    const seed = seedUnifiedFromClassic(
      mailgunRows({
        Generic: { subject: 'Sub {{code}}', html: '<b>G {{code}}</b>' },
        SignIn: { subject: 'Sub S', html: '<b>S</b>' },
      }),
      {}
    );

    expect(seed.template).toEqual({
      content: '<If type="Generic"><b>G {{code}}</b></If>\n<If type="SignIn"><b>S</b></If>',
    });
    expect(seed.unifiedSubjects).toEqual({
      Generic: 'Sub {{code}}',
      SignIn: 'Sub S',
    });
    expect(seed.variables).toEqual({});
  });

  it('carries subject only when non-empty, and collapses identical html into a shared body', () => {
    const seed = seedUnifiedFromClassic(
      mailgunRows({
        Generic: { html: 'X {{code}}' },
        SignIn: { html: 'X {{code}}' },
      }),
      {}
    );

    expect(seed.template).toEqual({ content: 'X {{code}}' });
    expect('subject' in seed.template).toBe(false);
  });

  it('returns an empty content body for an empty deliveries record', () => {
    const seed = seedUnifiedFromClassic(mailgunRows({}), {});

    expect(seed.template).toEqual({ content: '' });
    expect(seed.variables).toEqual({});
    expect(seed.translations).toEqual({});
  });

  it('seeds a shared body when only a Generic deliveries row exists (no <If> blocks)', () => {
    const seed = seedUnifiedFromClassic(
      mailgunRows({ Generic: { html: 'Your code is {{code}}.' } }),
      {}
    );

    expect(seed.template).toEqual({ content: 'Your code is {{code}}.' });
    expect(seed.variables).toEqual({});
    expect(seed.translations).toEqual({});
  });

  it('emits per-type <If> blocks (Generic first) when types differ — no shared body', () => {
    const seed = seedUnifiedFromClassic(
      mailgunRows({
        Generic: { html: 'G {{code}}' },
        SignIn: { html: 'S {{code}}' },
        Register: { html: 'R {{code}}' },
      }),
      {}
    );

    expect(seed.template).toEqual({
      content:
        '<If type="Generic">G {{code}}</If>\n<If type="Register">R {{code}}</If>\n<If type="SignIn">S {{code}}</If>',
    });
  });

  it('collapses identical per-type html rows into a shared body (no <If> blocks)', () => {
    const shared = 'Your code is {{code}}.';

    const seed = seedUnifiedFromClassic(
      mailgunRows({
        Generic: { html: shared },
        SignIn: { html: shared },
        Register: { html: shared },
      }),
      {}
    );

    expect(seed.template).toEqual({ content: shared });
  });

  it('seeds a single non-Generic type as a shared body (promotes a fallback)', () => {
    const seed = seedUnifiedFromClassic(mailgunRows({ SignIn: { html: 'Sign in: {{code}}' } }), {});

    expect(seed.template).toEqual({ content: 'Sign in: {{code}}' });
  });

  it('drops unknown usage types (only recognized TemplateType values are seeded)', () => {
    const seed = seedUnifiedFromClassic(
      mailgunRows({
        Generic: { html: 'G' },
        CustomType: { html: 'C' },
      }),
      {}
    );

    expect(seed.template).toEqual({ content: 'G' });
  });
});

describe('seedUnifiedFromClassic — translations (verbatim flat copy)', () => {
  it('copies classic translations flat and verbatim', () => {
    const classicTranslations = {
      en: {
        title__SignIn: 'Sign in',
        title__Register: 'Sign up',
        title__Generic: 'Hello',
        greeting: 'Hi',
      },
    };

    const seed = seedUnifiedFromClassic(mailgunRows({}), classicTranslations);

    expect(seed.translations).toEqual(classicTranslations);
  });
});

describe('seedUnifiedFromClassic — Verbatim Localizations & No Suffix Alignment', () => {
  it('preserves differing translation placeholders verbatim inside If blocks without aligning them', () => {
    const classicTranslations = {
      en: {
        signInTitle: 'Sign In Title',
        registerTitle: 'Register Title',
      },
    };

    const seed = seedUnifiedFromClassic(
      mailgunRows({
        SignIn: { html: '<div>{{t.signInTitle}}</div>' },
        Register: { html: '<div>{{t.registerTitle}}</div>' },
      }),
      classicTranslations
    );

    expect(seed.template.content).toBe(
      '<If type="Register"><div>{{t.registerTitle}}</div></If>\n<If type="SignIn"><div>{{t.signInTitle}}</div></If>'
    );
    expect(seed.variables).toEqual({});
    expect(seed.translations).toEqual(classicTranslations);
  });

  it('keeps flat translations completely verbatim and leaves templates untouched when they are identical', () => {
    const classicTranslations = {
      en: {
        hello: 'Hello',
      },
    };

    const seed = seedUnifiedFromClassic(
      mailgunRows({
        SignIn: { html: '<div>{{t.hello}}</div>' },
        Register: { html: '<div>{{t.hello}}</div>' },
      }),
      classicTranslations
    );

    expect(seed.template.content).toBe('<div>{{t.hello}}</div>');
    expect(seed.variables).toEqual({});
    expect(seed.translations).toEqual(classicTranslations);
  });
});
