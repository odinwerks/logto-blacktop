import { seedUnifiedFromClassic } from './compiler';
import type { SeedUnifiedFromClassicInput } from './types';

// A flat runtime translations dictionary mirror type (the classic shape the reverse-compile reads).
type ClassicTranslations = Record<string, Record<string, string>>;

const mailgunRows = (
  deliveries: Record<string, { subject?: string; html?: string; text?: string }>
): SeedUnifiedFromClassicInput => ({ kind: 'email-mailgun', deliveries });

describe('seedUnifiedFromClassic — Mailgun deliveries', () => {
  it('seeds subject/content/text from per-type deliveries (html → content)', () => {
    // The classic deliveries `html` is the unified `content` body; subject/text seed independently.
    const seed = seedUnifiedFromClassic(
      mailgunRows({
        Generic: { subject: 'Sub {{code}}', html: '<b>G {{code}}</b>', text: 'txt G' },
        SignIn: { subject: 'Sub S', html: '<b>S</b>' },
      }),
      {}
    );

    expect(seed.template).toEqual({
      content: '<If type="Generic"><b>G {{code}}</b></If>\n<If type="SignIn"><b>S</b></If>',
      text: 'txt G',
    });
    expect(seed.unifiedSubjects).toEqual({
      Generic: 'Sub {{code}}',
      SignIn: 'Sub S',
    });
    expect(seed.variables).toEqual({});
  });

  it('carries subject/text only when non-empty, and collapses identical html into a shared body', () => {
    const seed = seedUnifiedFromClassic(
      mailgunRows({
        Generic: { html: 'X {{code}}' },
        SignIn: { html: 'X {{code}}' },
      }),
      {}
    );

    // No subject/text in the classic deliveries → not carried into the unified template.
    expect(seed.template).toEqual({ content: 'X {{code}}' });
    expect('subject' in seed.template).toBe(false);
    expect('text' in seed.template).toBe(false);
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
    // Per `seedField`'s documented semantics, when not every configured type shares identical
    // content the reverse-compile drops the shared body and emits an `<If>` block per configured
    // type (Generic first, then the rest in first-seen order). This faithfully round-trips classic
    // per-type rows that *replace* rather than *add to* the Generic fallback.
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
    // When only one non-Generic type has content (no Generic fallback), `seedField` returns it as a
    // shared body (the single entry trivially satisfies `allSame`). On recompile, every type then
    // gets that content — i.e. the seed promotes a (previously absent) Generic fallback.
    const seed = seedUnifiedFromClassic(mailgunRows({ SignIn: { html: 'Sign in: {{code}}' } }), {});

    expect(seed.template).toEqual({ content: 'Sign in: {{code}}' });
  });

  it('drops unknown usage types (only recognized TemplateType values are seeded)', () => {
    const seed = seedUnifiedFromClassic(
      mailgunRows({
        Generic: { html: 'G' },
        // A custom usage type the enum does not know is not seeded.
        CustomType: { html: 'C' },
      }),
      {}
    );

    expect(seed.template).toEqual({ content: 'G' });
  });
});

describe('seedUnifiedFromClassic — translations', () => {
  it('splits namespaced K__T keys into per-type columns (SignIn/Register/Generic)', () => {
    const classicTranslations: ClassicTranslations = {
      en: {
        title__SignIn: 'Sign in',
        title__Register: 'Sign up',
        title__Generic: 'Hello',
      },
    };

    const seed = seedUnifiedFromClassic(mailgunRows({}), classicTranslations);

    expect(seed.translations).toEqual({
      en: {
        title: { SignIn: 'Sign in', Register: 'Sign up', Generic: 'Hello' },
      },
    });
  });

  it('matches the type suffix case-insensitively (title__signin → SignIn)', () => {
    const classicTranslations: ClassicTranslations = {
      en: { title__signin: 'Sign in' },
    };

    const seed = seedUnifiedFromClassic(mailgunRows({}), classicTranslations);

    expect(seed.translations).toEqual({
      en: { title: { SignIn: 'Sign in' } },
    });
  });

  it('parks a flat classic key (no __T suffix) under the Generic column', () => {
    // A connector authored purely in Classic carries flat translation keys (no per-type suffix).
    // The reverse-compile parks each under `Generic`, so the per-type dimension is lost for these
    // keys (the documented one-way-lossy minimal-plan trade-off).
    const classicTranslations: ClassicTranslations = {
      en: { greeting: 'Hi', farewell: 'Bye' },
    };

    const seed = seedUnifiedFromClassic(mailgunRows({}), classicTranslations);

    expect(seed.translations).toEqual({
      en: {
        greeting: { Generic: 'Hi' },
        farewell: { Generic: 'Bye' },
      },
    });
  });

  it('treats a __-containing key whose suffix is not a TemplateType as a flat key', () => {
    // `splitNamespacedKey` rejects a suffix that does not match a `TemplateType` value (e.g.
    // `custom`), so the whole key is parked under `Generic` rather than mis-split.
    const classicTranslations: ClassicTranslations = {
      en: { greeting__custom: 'Hi' },
    };

    const seed = seedUnifiedFromClassic(mailgunRows({}), classicTranslations);

    expect(seed.translations).toEqual({
      en: { greeting__custom: { Generic: 'Hi' } },
    });
  });

  it('preserves multiple languages and merges a namespaced key alongside a flat key', () => {
    const classicTranslations: ClassicTranslations = {
      en: { title__SignIn: 'Sign in', greeting: 'Hi' },
      zh: { title__SignIn: '登录', greeting: '你好' },
    };

    const seed = seedUnifiedFromClassic(mailgunRows({}), classicTranslations);

    expect(seed.translations).toEqual({
      en: { title: { SignIn: 'Sign in' }, greeting: { Generic: 'Hi' } },
      zh: { title: { SignIn: '登录' }, greeting: { Generic: '你好' } },
    });
  });

  it('aligns camelCase classic flat prefix keys like signInTitle to base key title with per-type translations and avoids duplication', () => {
    const classicTranslations: ClassicTranslations = {
      en: {
        signInTitle: 'Sign in now!',
        registerTitle: 'Sign up now!',
        genericTitle: 'Welcome!',
      },
    };

    const seed = seedUnifiedFromClassic(
      mailgunRows({
        SignIn: { html: '<h1>{{t.signInTitle}}</h1>' },
        Register: { html: '<h1>{{t.registerTitle}}</h1>' },
      }),
      classicTranslations
    );

    expect(seed.template.content).toBe('<h1>{{t.title}}</h1>');
    expect(seed.translations).toEqual({
      en: {
        title: {
          SignIn: 'Sign in now!',
          Register: 'Sign up now!',
          Generic: 'Welcome!',
        },
      },
    });
  });
});

describe('seedUnifiedFromClassic — variables (best-effort, one-way-lossy)', () => {
  it('resets variables to empty even when classic rows inline {{var.X}} placeholders', () => {
    // There is no classic equivalent of the unified variables table, so the reverse-compile always
    // returns `{}`. The `{{var.X}}` placeholders survive in the seeded body as text (the admin
    // re-defines the variables), which the compiler then inlines once a value is provided.
    const seed = seedUnifiedFromClassic(
      mailgunRows({ Generic: { html: 'Hi {{var.name}} {{code}}' } }),
      {}
    );

    expect(seed.template).toEqual({ content: 'Hi {{var.name}} {{code}}' });
    expect(seed.variables).toEqual({});
  });
});
