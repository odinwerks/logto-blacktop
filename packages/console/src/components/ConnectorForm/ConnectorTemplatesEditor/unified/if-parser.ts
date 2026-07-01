import { TemplateType } from '@logto/connector-kit';

import type { IfErrorKey, IfSegment, ParseIfResult } from './types';

/**
 * The STRICT `<If type="…">…</If>` pattern used by the lenient {@link resolveIfBlocks} resolver:
 * it matches only well-formed single-type blocks whose opening tag is exactly `<If type="…">`
 * (no other attributes). A malformed opening tag (e.g. `<If type="x" foo="bar">`, `<If foo="b">`)
 * does NOT match, so the resolver leaves the literal text verbatim in the output — safe but
 * visible, and surfaced as a parse error by {@link parseIfBlocks} for the UI banner. The inner is
 * non-greedy (`[\s\S]*?`) so it spans newlines while stopping at the first closing `</If\s*>`;
 * chaining (multiple sibling `<If>`s) works naturally, nesting is not supported (single type
 * only, per task spec §5).
 */
const strictIfBlockPattern = /<If\s+type\s*=\s*["']([^"']*)["']\s*>([\s\S]*?)<\/If\s*>/gu;

/**
 * The LOOSE `<If …>…</If>` pattern used by the strict {@link parseIfBlocks} validator: it matches
 * any `<If>` block regardless of its opening-tag attributes, capturing the opening-tag attribute
 * run (`[^>]*` between `If` and `>`) so the validator can reject extra attributes
 * ({@link IfErrorKey.if_invalid_attr}), missing/empty type ({@link IfErrorKey.if_empty_type}), and
 * nesting ({@link IfErrorKey.if_nested}). The `\b` after `If` avoids matching unrelated tags like
 * `<Iframe` (case-sensitive).
 */
const looseIfBlockPattern = /<If\b([^>]*)>([\s\S]*?)<\/If\s*>/gu;

/**
 * Matches any `<If` opening-tag word occurrence (with or without a matching closer). Used by
 * {@link parseIfBlocks} to detect unclosed `<If>` tags via an opener/closer surplus.
 */
const looseIfOpenerPattern = /<If\b/gu;

/**
 * Non-global `<If` opener probe, used by the nested-block check. Unlike the global
 * {@link looseIfOpenerPattern} (whose `g` flag makes `.test()` stateful and advances `lastIndex`
 * across calls), this stateless pattern is safe inside the parse loop.
 */
const nestedIfProbePattern = /<If\b/u;

/**
 * Matches self-closing `<If type="…" />` tags. These are not supported (they are neither a paired
 * block nor valid standalone content) and must be surfaced as {@link IfErrorKey.if_self_closing}.
 */
const selfClosingIfPattern = /<If\s+type\s*=\s*["'][^"']*["']\s*\/>/gu;

/**
 * Extracts every attribute name from a loose opening-tag attribute run (the text between `If` and
 * `>`), e.g. ` type="SignIn" foo="bar"` → `['type', 'foo']`. Used to reject attributes other than
 * `type`.
 */
const attributeNamesPattern = /([A-Za-z_]\w*)\s*=/gu;

const extractAttributeNames = (attributes: string): string[] =>
  [...attributes.matchAll(attributeNamesPattern)].map((match) => match[1] ?? '');

/**
 * Every supported {@link TemplateType}, cached once. Because `TemplateType` is a string enum
 * (values equal their keys, no numeric reverse mappings), `Object.values` yields exactly the
 * usage-type strings.
 */
const allTemplateTypes: readonly TemplateType[] = Object.values(TemplateType);

const isNonEmptyType = (value: string): boolean => value.trim().length > 0;

/**
 * Computes the structural error key for a single matched `<If>` block (or `undefined` when valid).
 * Module-scoped so it can be passed inline to `.map(…)` without `consistent-function-scoping`/array-
 * callback-reference warnings, and reused by both the first-error scan and (implicitly) the
 * segment-building pass (which only runs when no error was found).
 */
const reduceMatchError = (match: RegExpExecArray): IfErrorKey | undefined => {
  const attributes = match[1] ?? '';
  const inner = match[2] ?? '';
  const attributeNames = extractAttributeNames(attributes);

  if (attributeNames.some((name) => name !== 'type')) {
    return 'if_invalid_attr';
  }

  if (!attributeNames.includes('type')) {
    return 'if_empty_type';
  }

  const typeValue = /\btype\s*=\s*["']([^"']*)["']/u.exec(attributes)?.[1];

  if (!isNonEmptyType(typeValue ?? '')) {
    return 'if_empty_type';
  }

  return nestedIfProbePattern.test(inner) ? 'if_nested' : undefined;
};

/**
 * Parses a unified template body into a flat list of {@link IfSegment}s (literal text + `<If>`
 * blocks). Structural malformations surface as {@link IfErrorKey}s so the editor can render a
 * banner; the parser never throws. Unknown type literals are NOT errors — they become segments
 * whose {@link resolveIfBlocks} materialization drops the block.
 *
 * Validation rules (each maps to a structured error key):
 * - `if_empty_type` — `<If type="">…</If>` (empty type literal) or `<If>` (no type attribute).
 * - `if_invalid_attr` — an opening tag carrying attributes other than `type`
 *   (e.g. `<If type="x" foo="bar">` or `<If foo="bar">`).
 * - `if_nested` — an `<If>` block whose inner contains another `<If …>` (single-type, flat chain
 *   only — nesting is not supported per task spec §5).
 * - `if_unclosed` — an `<If type=…>` opening tag with no matching closing `</If>`.
 */
export const parseIfBlocks = (body: string): ParseIfResult => {
  if (body.length === 0) {
    return { success: true, segments: [] };
  }

  if ([...body.matchAll(selfClosingIfPattern)].length > 0) {
    return { success: false, errorKey: 'if_self_closing' };
  }

  const matches = [...body.matchAll(looseIfBlockPattern)];

  // First pass: collect each match's structural error (if any); the first non-`undefined` one is
  // the parse failure. The segment-building pass only runs when no error was found, so it never
  // has to bail mid-build.
  const firstErrorKey = matches
    .map((match) => reduceMatchError(match))
    .find((error): error is IfErrorKey => error !== undefined);

  if (firstErrorKey) {
    return { success: false, errorKey: firstErrorKey };
  }

  // Second pass: build the literal + if-segment list immutably, tracking the running `lastIndex`
  // in the reducer's accumulator (no `let`/`push`/mutation). A preceding literal segment is
  // inserted when a match does not abut the previous match's end.
  const { segments, lastIndex } = matches.reduce<{ segments: IfSegment[]; lastIndex: number }>(
    (accumulator, match) => {
      const { index } = match;
      const fullMatch = match[0];
      const attributes = match[1] ?? '';
      const inner = match[2] ?? '';
      const typeValue = /\btype\s*=\s*["']([^"']*)["']/u.exec(attributes)?.[1] ?? '';
      const literalSegment: IfSegment[] =
        index > accumulator.lastIndex
          ? [{ kind: 'literal', text: body.slice(accumulator.lastIndex, index) }]
          : [];
      const ifSegment: IfSegment = { kind: 'if', type: typeValue, text: inner };

      return {
        segments: [...accumulator.segments, ...literalSegment, ifSegment],
        lastIndex: index + fullMatch.length,
      };
    },
    { segments: [], lastIndex: 0 }
  );

  const trailingSegment: IfSegment[] =
    lastIndex < body.length ? [{ kind: 'literal', text: body.slice(lastIndex) }] : [];

  // Unclosed detection: compare the total loose `<If` opener count against the number of
  // fully-paired matches. A surplus means an opening tag with no matching `</If>`.
  const openingCount = (body.match(looseIfOpenerPattern) ?? []).length;

  if (openingCount > matches.length) {
    return { success: false, errorKey: 'if_unclosed' };
  }

  return { success: true, segments: [...segments, ...trailingSegment] };
};

/**
 * The case-insensitive {@link TemplateType} value matching a type literal, or `undefined` when the
 * literal does not correspond to a known usage type. Used so the resolver drops unknown types
 * (e.g. `<If type="Bogus">`) rather than leaking the literal `<If>` tags into the compiled output.
 */
const matchTemplateType = (typeLiteral: string): TemplateType | undefined =>
  allTemplateTypes.find((value) => value.toLowerCase() === typeLiteral.trim().toLowerCase());

/**
 * Materializes a unified body for a specific {@link TemplateType}: keeps the inner of `<If
 * type="T">` blocks whose type matches `targetType` (case-insensitively, against the
 * {@link TemplateType} enum), drops all other `<If>` blocks (including unknown type literals), and
 * concatenates the literal segments verbatim. Returns the empty string for empty input.
 *
 * Lenient by design (the compiler/preview resolver). Structural errors are surfaced separately by
 * {@link parseIfBlocks} for the UI banner; the resolver never throws — a malformed opening tag
 * (extra attributes, unclosed) does not match {@link strictIfBlockPattern} and is left verbatim in
 * the output (safe but visible; the UI banner flags it).
 */
export const resolveIfBlocks = (body: string, targetType: TemplateType): string => {
  if (body.length === 0) {
    return '';
  }

  // Always strip self-closing `<If>` tags so they can never leak into rendered output, even when
  // the parser's structural error is ignored by a caller.
  const normalized = body.replaceAll(selfClosingIfPattern, '');

  return normalized.replaceAll(
    strictIfBlockPattern,
    (fullMatch, typeLiteral: string, inner: string) => {
      const matched = matchTemplateType(typeLiteral);

      // Unknown type literal → drop the whole block (do not leak `<If>` literal text into a sent
      // message). A known type that does not match `targetType` → also drop. A matching type → keep
      // the inner verbatim.
      if (!matched || matched !== targetType) {
        return '';
      }

      return inner;
    }
  );
};
