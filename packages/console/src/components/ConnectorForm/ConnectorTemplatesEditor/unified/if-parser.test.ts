import { TemplateType } from '@logto/connector-kit';

import { parseIfBlocks, resolveIfBlocks } from './if-parser';

describe('parseIfBlocks', () => {
  it('returns an empty segment list for an empty body', () => {
    expect(parseIfBlocks('')).toEqual({ success: true, segments: [] });
  });

  it('returns a single literal segment for a body with no <If> blocks', () => {
    const result = parseIfBlocks('Your code is {{code}}.');

    expect(result).toEqual({
      success: true,
      segments: [{ kind: 'literal', text: 'Your code is {{code}}.' }],
    });
  });

  it('parses a single <If> block with surrounding literals', () => {
    const result = parseIfBlocks('Hi. <If type="SignIn">Sign in</If> Bye.');

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.segments).toEqual([
        { kind: 'literal', text: 'Hi. ' },
        { kind: 'if', type: 'SignIn', text: 'Sign in' },
        { kind: 'literal', text: ' Bye.' },
      ]);
    }
  });

  it('parses chained sibling <If> blocks', () => {
    const result = parseIfBlocks(
      '<If type="SignIn">Sign in {{code}}</If><If type="Register">Sign up {{code}}</If>'
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.segments).toEqual([
        { kind: 'if', type: 'SignIn', text: 'Sign in {{code}}' },
        { kind: 'if', type: 'Register', text: 'Sign up {{code}}' },
      ]);
    }
  });

  it('matches the type literal case-insensitively (signIn vs SignIn)', () => {
    const result = parseIfBlocks('<If type="signIn">Hi</If>');

    expect(result.success).toBe(true);

    // Unknown type literals are NOT a parse error (the resolver drops them); parseIfBlocks keeps
    // the literal type string as-authored.
    if (result.success) {
      expect(result.segments).toEqual([{ kind: 'if', type: 'signIn', text: 'Hi' }]);
    }
  });

  it('accepts single-quoted type attributes', () => {
    const result = parseIfBlocks("<If type='SignIn'>Hi</If>");

    expect(result.success).toBe(true);
  });

  it('allows multi-line inner content', () => {
    const result = parseIfBlocks('<If type="SignIn">Line 1\nLine 2</If>');

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.segments[0]).toEqual({
        kind: 'if',
        type: 'SignIn',
        text: 'Line 1\nLine 2',
      });
    }
  });

  it('tolerates trailing whitespace before the closing >', () => {
    const result = parseIfBlocks('<If type="SignIn" >Hi</If >');

    expect(result.success).toBe(true);
  });

  it('rejects an empty type attribute with if_empty_type', () => {
    expect(parseIfBlocks('<If type="">Hi</If>')).toEqual({
      success: false,
      errorKey: 'if_empty_type',
    });
  });

  it('rejects a nested <If> with if_nested', () => {
    expect(parseIfBlocks('<If type="SignIn"><If type="Register">Inner</If></If>')).toEqual({
      success: false,
      errorKey: 'if_nested',
    });
  });

  it('rejects extra attributes with if_invalid_attr', () => {
    expect(parseIfBlocks('<If type="SignIn" foo="bar">Hi</If>')).toEqual({
      success: false,
      errorKey: 'if_invalid_attr',
    });
  });

  it('rejects an opening tag with an attribute other than type (no type)', () => {
    expect(parseIfBlocks('<If foo="bar">Hi</If>')).toEqual({
      success: false,
      errorKey: 'if_invalid_attr',
    });
  });

  it('rejects a bare <If> with no type attribute (if_empty_type)', () => {
    expect(parseIfBlocks('<If>Hi</If>')).toEqual({
      success: false,
      errorKey: 'if_empty_type',
    });
  });

  it('rejects an unclosed <If> with if_unclosed', () => {
    expect(parseIfBlocks('<If type="SignIn">Hi without close')).toEqual({
      success: false,
      errorKey: 'if_unclosed',
    });
  });

  it('rejects a self-closing <If> with if_self_closing', () => {
    expect(parseIfBlocks('Hi <If type="SignIn" /> bye.')).toEqual({
      success: false,
      errorKey: 'if_self_closing',
    });
  });

  it('rejects a self-closing <If> with single quotes', () => {
    expect(parseIfBlocks("<If type='SignIn' />")).toEqual({
      success: false,
      errorKey: 'if_self_closing',
    });
  });
});

describe('resolveIfBlocks', () => {
  it('returns the empty string for an empty body', () => {
    expect(resolveIfBlocks('', TemplateType.SignIn)).toBe('');
  });

  it('keeps literal text verbatim when there are no <If> blocks', () => {
    expect(resolveIfBlocks('Your code is {{code}}.', TemplateType.SignIn)).toBe(
      'Your code is {{code}}.'
    );
  });

  it('keeps the matching <If> inner and drops non-matching blocks', () => {
    const body = '<If type="SignIn">Sign in {{code}}</If><If type="Register">Sign up {{code}}</If>';

    expect(resolveIfBlocks(body, TemplateType.SignIn)).toBe('Sign in {{code}}');
    expect(resolveIfBlocks(body, TemplateType.Register)).toBe('Sign up {{code}}');
    expect(resolveIfBlocks(body, TemplateType.ForgotPassword)).toBe('');
  });

  it('keeps shared body text outside any <If> for every type', () => {
    const body = 'Code: {{code}} <If type="SignIn">(sign in)</If>';

    expect(resolveIfBlocks(body, TemplateType.SignIn)).toBe('Code: {{code}} (sign in)');
    expect(resolveIfBlocks(body, TemplateType.Register)).toBe('Code: {{code}} ');
  });

  it('matches the type literal case-insensitively', () => {
    expect(resolveIfBlocks('<If type="signIn">Hi</If>', TemplateType.SignIn)).toBe('Hi');
    expect(resolveIfBlocks('<If type="SIGNIN">Hi</If>', TemplateType.SignIn)).toBe('Hi');
  });

  it('drops blocks whose type literal is not a known TemplateType', () => {
    expect(resolveIfBlocks('<If type="Bogus">Hi</If>', TemplateType.SignIn)).toBe('');
    // The shared body is still kept; only the unknown block is dropped.
    expect(resolveIfBlocks('Shared <If type="Bogus">Hi</If>', TemplateType.SignIn)).toBe('Shared ');
  });

  it('leaves an unclosed <If> verbatim (the pattern cannot pair it)', () => {
    const body = '<If type="SignIn">no close';

    expect(resolveIfBlocks(body, TemplateType.SignIn)).toBe(body);
  });

  it('strips self-closing <If> tags from output', () => {
    expect(resolveIfBlocks('Hi <If type="SignIn" /> bye.', TemplateType.SignIn)).toBe('Hi  bye.');
  });
});
