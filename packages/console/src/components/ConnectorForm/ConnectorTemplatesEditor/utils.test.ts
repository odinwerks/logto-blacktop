import { extractTranslationKeys, safeJsonParse, safeJsonStringify } from './utils';

describe('extractTranslationKeys', () => {
  it('collects unique keys preserving first-seen order', () => {
    const templates = [
      { content: 'Hello {{t.greeting}}, your code is {{code}}' },
      { content: '{{t.greeting}} — {{t.farewell}}' },
    ];

    expect(extractTranslationKeys(templates)).toEqual(['greeting', 'farewell']);
  });

  it('ignores non-`t` handlebars such as `{{code}}`', () => {
    expect(extractTranslationKeys([{ content: '{{code}} {{t.x}}' }])).toEqual(['x']);
  });

  it('tolerates whitespace around the handlebars (matches the runtime resolver)', () => {
    expect(extractTranslationKeys([{ content: '{{ t.greeting }}' }])).toEqual(['greeting']);
  });

  it('ignores malformed keys with no alphanumeric characters', () => {
    expect(extractTranslationKeys([{ content: '{{t.}} {{t..}} {{t.__}} {{t.real}}' }])).toEqual([
      'real',
    ]);
  });

  it('handles missing, empty, or non-string content', () => {
    expect(
      extractTranslationKeys([
        { content: undefined },
        { content: '' },
        // A template with no `content` field at all — `content` is optional, so this is valid.
        {},
        { content: '{{t.only}}' },
      ])
    ).toEqual(['only']);
  });

  it('deduplicates keys across templates', () => {
    expect(
      extractTranslationKeys([{ content: '{{t.one}}' }, { content: '{{t.one}} {{t.two}}' }])
    ).toEqual(['one', 'two']);
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON objects', () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses valid JSON arrays', () => {
    expect(safeJsonParse<number[]>('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('returns undefined for invalid JSON', () => {
    expect(safeJsonParse('{not json')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(safeJsonParse('')).toBeUndefined();
  });

  it('returns undefined for a whitespace-only string', () => {
    expect(safeJsonParse('   ')).toBeUndefined();
  });

  it('returns undefined for non-string input', () => {
    const undefinedValue: unknown = undefined;

    expect(safeJsonParse(123)).toBeUndefined();
    expect(safeJsonParse(null)).toBeUndefined();
    expect(safeJsonParse(undefinedValue)).toBeUndefined();
  });
});

describe('safeJsonStringify', () => {
  it('stringifies a plain object (round-trips through JSON.parse)', () => {
    expect(JSON.parse(safeJsonStringify({ a: 1 }))).toEqual({ a: 1 });
  });

  it('stringifies an array', () => {
    expect(JSON.parse(safeJsonStringify([1, 2, 3]))).toEqual([1, 2, 3]);
  });

  it('returns "{}" for undefined', () => {
    const undefinedValue: unknown = undefined;

    expect(safeJsonStringify(undefinedValue)).toBe('{}');
  });

  it('returns "{}" for a non-serializable value (BigInt)', () => {
    expect(safeJsonStringify({ a: 1n })).toBe('{}');
  });
});
