import { ConnectorType } from '@logto/connector-kit';

import type { PerTypeString } from './types';
import { typeColumns } from './types';
import {
  fieldsForKind,
  kindForConnectorType,
  mergePerTypeTable,
  parsePerTypeTableJson,
} from './utils';

describe('fieldsForKind', () => {
  it('returns subject/content/text for the Mailgun kind', () => {
    expect(fieldsForKind('email-mailgun')).toEqual(['subject', 'content', 'text']);
  });
});

describe('kindForConnectorType', () => {
  it('maps Email to the email-mailgun kind', () => {
    expect(kindForConnectorType(ConnectorType.Email)).toBe('email-mailgun');
  });
});

describe('parsePerTypeTableJson', () => {
  it('yields an empty table for empty/whitespace text (merge-safe)', () => {
    expect(parsePerTypeTableJson('   ', typeColumns)).toEqual({ success: true, data: {} });
    expect(parsePerTypeTableJson('', typeColumns)).toEqual({ success: true, data: {} });
  });

  it('parses a valid per-type table into the cleaned shape', () => {
    const parsed = parsePerTypeTableJson(
      JSON.stringify({ greeting: { Generic: 'Hi', SignIn: 'Sign in' } }),
      typeColumns
    );

    expect(parsed).toEqual({
      success: true,
      data: { greeting: { Generic: 'Hi', SignIn: 'Sign in' } },
    });
  });

  it('drops empty-string cells and columns not in the typeColumns set', () => {
    const parsed = parsePerTypeTableJson(
      JSON.stringify({
        greeting: { Generic: 'Hi', SignIn: '', NotAType: 'dropped' },
      }),
      typeColumns
    );

    expect(parsed).toEqual({ success: true, data: { greeting: { Generic: 'Hi' } } });
  });

  it('drops empty-string top-level keys', () => {
    const parsed = parsePerTypeTableJson(
      JSON.stringify({ '': { Generic: 'x' }, greeting: { Generic: 'Hi' } }),
      typeColumns
    );

    expect(parsed).toEqual({ success: true, data: { greeting: { Generic: 'Hi' } } });
  });

  it('rejects invalid JSON with invalid_json_format', () => {
    const parsed = parsePerTypeTableJson('{ not json', typeColumns);

    expect(parsed).toEqual({ success: false, errorKey: 'invalid_json_format' });
  });

  it('rejects a non-object top-level value with json_must_be_object', () => {
    const parsed = parsePerTypeTableJson('["a", "b"]', typeColumns);

    expect(parsed).toEqual({ success: false, errorKey: 'json_must_be_object' });
  });

  it('rejects a non-object per-key value with json_must_be_object', () => {
    const parsed = parsePerTypeTableJson(JSON.stringify({ greeting: 'plain string' }), typeColumns);

    expect(parsed).toEqual({ success: false, errorKey: 'json_must_be_object' });
  });

  it('rejects a non-string cell value with json_values_must_be_strings', () => {
    const parsed = parsePerTypeTableJson(
      JSON.stringify({ greeting: { Generic: 1234 } }),
      typeColumns
    );

    expect(parsed).toEqual({ success: false, errorKey: 'json_values_must_be_strings' });
  });

  it('reports the first structural error and stops building', () => {
    // The reducer short-circuits on the first error: a non-string cell (json_values_must_be_strings)
    // is reported, and a later non-object value is never reached.
    const parsed = parsePerTypeTableJson(
      JSON.stringify({ a: { Generic: 1 }, b: 'not-object' }),
      typeColumns
    );

    expect(parsed).toEqual({ success: false, errorKey: 'json_values_must_be_strings' });
  });
});

describe('mergePerTypeTable', () => {
  it('overrides existing keys with parsed values and preserves unmentioned current keys', () => {
    const current: Record<string, PerTypeString> = {
      a: { Generic: '1' },
      b: { Generic: '2' },
    };
    const parsed: Record<string, PerTypeString> = { a: { SignIn: 'new' } };

    expect(mergePerTypeTable(current, parsed)).toEqual({
      a: { SignIn: 'new' },
      b: { Generic: '2' },
    });
  });

  it('returns a new object and does not mutate its inputs', () => {
    const current = { a: { Generic: '1' } };
    const parsed = { b: { Generic: '2' } };
    const merged = mergePerTypeTable(current, parsed);

    expect(merged).toEqual({ a: { Generic: '1' }, b: { Generic: '2' } });
    expect(current).toEqual({ a: { Generic: '1' } });
    expect(parsed).toEqual({ b: { Generic: '2' } });
  });
});
