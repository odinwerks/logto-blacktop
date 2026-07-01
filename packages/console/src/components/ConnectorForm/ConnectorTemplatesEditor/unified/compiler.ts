/* eslint-disable unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import { TemplateType } from '@logto/connector-kit';

import { resolveIfBlocks } from './if-parser';
import type {
  CompileInput,
  CompileOutput,
  CompiledTranslations,
  PerTypeString,
  SeedUnifiedFromClassicInput,
  SeedUnifiedFromClassicOutput,
  VariablesTable,
} from './types';

/**
 * Every supported {@link TemplateType}, cached once for the per-type compile loop. Because
 * `TemplateType` is a string enum (values equal their keys, no numeric reverse mappings),
 * `Object.values` yields exactly the usage-type strings.
 */
const allTemplateTypes: readonly TemplateType[] = Object.values(TemplateType);

/**
 * Matches double-curly variables like `{{varName}}` or `{{variableName}}`.
 * Under v4, there is no `var.` prefix in templates.
 * We must check if `varName in variables` inside the replacing function
 * so we only inline keys that are defined in variables.
 */
const variablePattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu;

/**
 * Resolves a per-type value for `targetType` from a {@link PerTypeString}, falling back to the
 * `Generic` column. Returns the empty string when neither the type nor `Generic` is defined.
 */
export const resolvePerTypeValue = (
  perType: PerTypeString | undefined,
  targetType: TemplateType
): string => {
  const value = perType?.[targetType];
  if (value !== undefined && value !== '') {
    return value;
  }
  return perType?.Generic ?? '';
};

/**
 * Inlines variables matching `{{varName}}` ONLY if `varName` is defined in `variables` table.
 * If the key is not defined, we leave the placeholder untouched (so `{{code}}`, `{{t.key}}`, etc.
 * pass through untouched).
 */
export const inlineVariables = (
  body: string,
  variables: VariablesTable,
  targetType: TemplateType
): string => {
  if (body.length === 0) {
    return '';
  }

  return body.replaceAll(variablePattern, (fullMatch, key: string) => {
    if (key in variables) {
      return resolvePerTypeValue(variables[key], targetType);
    }
    return fullMatch;
  });
};

/**
 * Compiles a single unified template field for `targetType`: resolves `<If>` blocks, then inlines
 * variables. Under v4, no translation rewriting is done.
 */
const compileField = (
  rawField: string | undefined,
  variables: VariablesTable,
  targetType: TemplateType
): string => {
  const raw = rawField ?? '';
  const resolved = resolveIfBlocks(raw, targetType);
  return inlineVariables(resolved, variables, targetType);
};

/**
 * Compiles the unified model into classic deliveries rows. The flat translations dictionary is
 * copied verbatim under Unified v4.
 */
export const compileUnified = (input: CompileInput): CompileOutput => {
  const { template, variables, translations, unifiedSubjects = {} } = input;
  const deliveries: Record<string, { subject?: string; html: string }> = {};

  for (const targetType of allTemplateTypes) {
    const html = compileField(template.content, variables, targetType);
    const rawSubject = resolvePerTypeValue(unifiedSubjects, targetType);
    const subject = compileField(rawSubject, variables, targetType);

    // Skip empty non-Generic rows
    if (html.length === 0 && targetType !== TemplateType.Generic) {
      continue;
    }

    deliveries[targetType] = {
      html,
      ...(subject ? { subject } : {}),
    };
  }

  return {
    rows: { kind: 'email-mailgun', deliveries },
    translations, // flat translation copied verbatim!
  };
};

const findLongestCommonSuffix = (words: string[]): string => {
  if (words.length === 0) {
    return '';
  }
  let suffix = words[0] ?? '';
  for (let i = 1; i < words.length; i++) {
    const word = words[i] ?? '';
    let j = 0;
    const minLen = Math.min(suffix.length, word.length);
    while (j < minLen && suffix[suffix.length - 1 - j] === word[word.length - 1 - j]) {
      j++;
    }
    suffix = suffix.slice(suffix.length - j);
  }
  return suffix;
};

const performGroupedLineDiff = (
  normalizedTemplates: Record<string, string>,
  classicTranslations: CompiledTranslations = {},
  outVariables: VariablesTable = {}
): string => {
  const activeTypes = Object.keys(normalizedTemplates);
  if (activeTypes.length === 0) {
    return '';
  }
  if (activeTypes.length === 1) {
    return Object.values(normalizedTemplates)[0]!;
  }

  const splitTemplates = Object.fromEntries(
    Object.entries(normalizedTemplates).map(([type, html]) => [type, html.split(/\r?\n/)])
  );

  const maxLines = Math.max(...Object.values(splitTemplates).map((lines) => lines.length));
  const resultLines: string[] = [];

  // Accumulator for contiguous differing lines per template type
  const accumulator: Record<string, string[]> = Object.fromEntries(activeTypes.map((t) => [t, []]));
  let hasAccumulated = false;

  const flushAccumulator = () => {
    if (!hasAccumulated) {
      return;
    }

    // Generic first then remaining types in alphabetical order for visual consistency
    const sortedTypes = (activeTypes.filter((t) => t === 'Generic') as string[])
      .concat(activeTypes.filter((t) => t !== 'Generic').sort());

    for (const type of sortedTypes) {
      const accumulatedLines = accumulator[type] ?? [];
      if (accumulatedLines.length > 0) {
        const blockText = accumulatedLines.join('\n');
        resultLines.push(`<If type="${type}">${blockText}</If>`);
        accumulator[type] = [];
      }
    }
    hasAccumulated = false;
  };

  let variableCounter = 0;
  let collisionCounter = 0;
  // Track assigned baseKey -> mapping of { [type]: originalKey }
  const alignedKeysRegistry = new Map<string, Record<string, string>>();

  for (let i = 0; i < maxLines; i++) {
    const linesAtIdx = Object.fromEntries(
      Object.entries(splitTemplates).map(([type, lines]) => [type, lines[i]])
    );

    const nonNullLines = Object.values(linesAtIdx).filter((l) => l !== undefined);
    const allDefined = nonNullLines.length === activeTypes.length;

    // Check identical
    const allIdentical =
      allDefined &&
      nonNullLines.every((line) => line === nonNullLines[0]);

    if (allIdentical) {
      flushAccumulator();
      resultLines.push(nonNullLines[0]!);
      continue;
    }

    // Structural alignment check
    let alignedSkeletonsMatch = false;
    let alignedUnifiedLine: string | null = null;

    if (allDefined) {
      // Find all translations patterns in each line
      const translationPatternLocal = /\{\{\s*t\.([a-zA-Z0-9_.-]+)\s*\}\}/gu;

      // Extract original keys and mask them
      const skeletons: Record<string, string> = {};
      const originalKeysPerTypeAndPlaceholder: Record<string, string[]> = {}; // placeholder_idx -> list of keys for each type

      let firstPlaceholderCount = -1;
      let isStructuralIdentical = true;

      for (const type of activeTypes) {
        const line = linesAtIdx[type]!;
        const matches = [...line.matchAll(translationPatternLocal)];
        const placeholderCount = matches.length;

        if (firstPlaceholderCount === -1) {
          firstPlaceholderCount = placeholderCount;
        } else if (placeholderCount !== firstPlaceholderCount) {
          isStructuralIdentical = false;
          break;
        }

        // Construct skeleton
        let skeleton = line;
        matches.forEach((match, idx) => {
          const key = match[1]!;
          skeleton = skeleton.replace(match[0], `__PLACEHOLDER_${idx}__`);
          if (!originalKeysPerTypeAndPlaceholder[idx]) {
            originalKeysPerTypeAndPlaceholder[idx] = [];
          }
          originalKeysPerTypeAndPlaceholder[idx].push(key);
        });

        skeletons[type] = skeleton;
      }

      // Check skeletons are identical and we have at least one placeholder to align
      if (isStructuralIdentical && firstPlaceholderCount > 0) {
        const skeletonValues = Object.values(skeletons);
        const allSkeletonsIdentical = skeletonValues.every((sk) => sk === skeletonValues[0]);

        if (allSkeletonsIdentical) {
          // Align them!
          alignedSkeletonsMatch = true;
          let unifiedLine = skeletonValues[0]!;

          for (let k = 0; k < firstPlaceholderCount; k++) {
            const originalKeys = originalKeysPerTypeAndPlaceholder[k]!;
            const suffix = findLongestCommonSuffix(originalKeys);

            let baseKey = '';
            if (suffix.length >= 3) {
              baseKey = suffix[0]!.toUpperCase() + suffix.slice(1);
            } else {
              variableCounter++;
              baseKey = `variable${variableCounter}`;
            }

            // Collision check
            while (true) {
              const registeredMapping = alignedKeysRegistry.get(baseKey);
              if (!registeredMapping) {
                break;
              }
              // Check if the registered mapping is identical to our current mapping
              let mappingMatches = true;
              for (let tIdx = 0; tIdx < activeTypes.length; tIdx++) {
                const type = activeTypes[tIdx]!;
                const origKey = originalKeys[tIdx]!;
                if (registeredMapping[type] !== origKey) {
                  mappingMatches = false;
                  break;
                }
              }
              if (mappingMatches) {
                break;
              }
              // It's a collision! Increment and append
              collisionCounter++;
              baseKey = `${baseKey.replace(/\d+$/g, '')}${collisionCounter}`;
            }

            // Record alignment mapping
            const currentMapping: Record<string, string> = {};
            activeTypes.forEach((type, tIdx) => {
              currentMapping[type] = originalKeys[tIdx]!;
            });
            alignedKeysRegistry.set(baseKey, currentMapping);

            // Populate the variable values in outVariables
            if (!outVariables[baseKey]) {
              outVariables[baseKey] = {};
            }
            activeTypes.forEach((type, tIdx) => {
              const originalKey = originalKeys[tIdx]!;
              outVariables[baseKey]![type] = `{{t.${originalKey}}}`;
            });

            // Rewrite placeholder in line: replacing with `{{varName}}` (no t. prefix!)
            unifiedLine = unifiedLine.replace(`__PLACEHOLDER_${k}__`, `{{${baseKey}}}`);
          }

          alignedUnifiedLine = unifiedLine;
        }
      }
    }

    if (alignedSkeletonsMatch && alignedUnifiedLine !== null) {
      flushAccumulator();
      resultLines.push(alignedUnifiedLine);
    } else {
      hasAccumulated = true;
      for (const type of activeTypes) {
        const line = linesAtIdx[type];
        if (line !== undefined) {
          accumulator[type]?.push(line);
        }
      }
    }
  }

  flushAccumulator();
  return resultLines.join('\n');
};

/**
 * Best-effort reverse-compile of a Mailgun connector's classic per-type `deliveries` +
 * `translations` into the unified model. Under v4:
 * 1. Flat translations are copied verbatim.
 * 2. If lines differ only by translation keys, they are aligned into compile-time Variables
 *    referencing those translation keys, e.g., variables[baseKey][type] = '{{t.originalKey}}'.
 */
export const seedUnifiedFromClassic = (
  input: SeedUnifiedFromClassicInput,
  classicTranslations: CompiledTranslations
): SeedUnifiedFromClassicOutput => {
  const isRecognizedType = (type: string): boolean => {
    return type === 'Generic' || allTemplateTypes.includes(type as TemplateType);
  };

  const filteredDeliveries = Object.fromEntries(
    Object.entries(input.deliveries).filter(([type]) => isRecognizedType(type))
  );

  // Seed subjects map (no more HTML-embedded subjects)
  const unifiedSubjects: PerTypeString = {};
  for (const [type, row] of Object.entries(filteredDeliveries)) {
    if (row.subject) {
      unifiedSubjects[type] = row.subject;
    }
  }

  // Pre-normalize all template HTML fields and extract translation values
  const htmlTemplates: Record<string, string> = {};
  for (const [type, row] of Object.entries(filteredDeliveries)) {
    if (row.html) {
      htmlTemplates[type] = row.html;
    }
  }

  // Perform diff to compute unified template content and align translation keys
  const variables: VariablesTable = {};
  const content = performGroupedLineDiff(htmlTemplates, classicTranslations, variables);

  return {
    template: {
      content: content || '',
    },
    variables,
    translations: classicTranslations, // Flat copy verbatim
    unifiedSubjects,
  };
};
/* eslint-enable */
