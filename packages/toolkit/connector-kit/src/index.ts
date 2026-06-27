import { type Json, type JsonObject } from '@withtyped/server';
import ky, { HTTPError } from 'ky';
import { type ZodType, type ZodTypeDef } from 'zod';

import {
  ConnectorError,
  ConnectorErrorCodes,
  type SendMessagePayload,
  ConnectorType,
  TemplateType,
  jsonGuard,
  jsonObjectGuard,
  tokenResponseGuard,
} from './types/index.js';

export * from './types/index.js';

export function validateConfig<Output, Input = Output>(
  config: unknown,
  guard: ZodType<Output, ZodTypeDef, Input>
): asserts config is Output {
  const result = guard.safeParse(config);

  if (!result.success) {
    throw new ConnectorError(ConnectorErrorCodes.InvalidConfig, result.error);
  }
}

export const parseJson = (
  jsonString: string,
  errorCode: ConnectorErrorCodes = ConnectorErrorCodes.InvalidResponse,
  errorPayload?: unknown
): Json => {
  try {
    return jsonGuard.parse(JSON.parse(jsonString));
  } catch {
    throw new ConnectorError(errorCode, errorPayload ?? jsonString);
  }
};

export const parseJsonObject = (
  ...[jsonString, errorCode = ConnectorErrorCodes.InvalidResponse, errorPayload]: Parameters<
    typeof parseJson
  >
): JsonObject => {
  try {
    return jsonObjectGuard.parse(JSON.parse(jsonString));
  } catch {
    throw new ConnectorError(errorCode, errorPayload ?? jsonString);
  }
};

/**
 * The file paths for storing the mock sms/email connector records. You can use these file paths to
 * read the records for testing.
 */
export const mockConnectorFilePaths = Object.freeze({
  [ConnectorType.Sms]: '/tmp/logto/mock_sms_record.txt',
  [ConnectorType.Email]: '/tmp/logto/mock_email_record.txt',
});

/**
 * Replace all handlebars that match the keys in {@link SendMessagePayload} with the payload
 * values.
 *
 * - If the payload does not contain the root property, the handlebars will not be replaced.
 * - If the payload contains the root property but does not contain the nested property,
 *  the handlebars will be replaced with an empty string.
 *
 * @param template The template to replace the handlebars with.
 * @param payload The payload to replace the handlebars with.
 * @returns The replaced template.
 *
 * @example
 * ```ts
 * replaceSendMessageKeysWithPayload('Your verification code is {{code}}', { code: '123456' });
 * // 'Your verification code is 123456'
 *
 * replaceSendMessageKeysWithPayload('Your application name is {{application.name}}', { application: { name: 'Logto' } });
 * // 'Your application name is Logto'
 *
 * replaceSendMessageKeysWithPayload('Your application name is {{application.name}}', { application: {}});
 * // 'Your application name is '
 * ```
 *
 * @example
 * ```ts
 * replaceSendMessageKeysWithPayload('Your verification code is {{code}}', {});
 * // 'Your verification code is {{code}}'
 *
 * replaceSendMessageKeysWithPayload('Your application name is {{application.name}}', {});
 * // 'Your application name is {{application.name}}'
 * ```
 */
export const replaceSendMessageHandlebars = (
  template: string,
  payload: SendMessagePayload
): string => {
  const regex = /{{\s*([\w.]+)\s*}}/g;

  return template.replaceAll(regex, (handleBar, key: string) => {
    const baseKey = key.split('.')[0];
    // If the root variable does not exist in the payload, return the original key
    if (!(baseKey && baseKey in payload)) {
      return handleBar;
    }

    const value = getValue(payload, key);

    return String(value ?? '');
  });
};

export const getValue = (object: Record<string, unknown>, path: string): unknown | undefined => {
  return path.split('.').reduce<unknown | undefined>((current, part) => {
    // Return undefined if the current value is not an object
    if (!current || typeof current !== 'object') {
      return;
    }

    // eslint-disable-next-line no-restricted-syntax
    return (current as Record<string, unknown>)[part];
  }, object);
};

/**
 * Shared function to get access token by refresh token.
 * This function provides a standard interface for OAuth/OIDC social connectors
 * to exchange a refresh token for an access token.
 * It is used by connectors like Google, GitHub, etc.
 */
type ConnectorConfig = {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
};

export const getAccessTokenByRefreshToken = async (
  { clientId, clientSecret, tokenEndpoint }: ConnectorConfig,
  refreshToken: string
) => {
  const tokenRequestParameters = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const headers = {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  try {
    const httpResponse = await ky
      .post(tokenEndpoint, {
        body: tokenRequestParameters.toString(),
        headers,
      })
      .json();

    const result = tokenResponseGuard.safeParse(httpResponse);

    if (!result.success) {
      throw new ConnectorError(ConnectorErrorCodes.InvalidResponse, result.error);
    }

    return result.data;
  } catch (error: unknown) {
    if (error instanceof HTTPError) {
      const { body: rawBody } = error.response;

      throw new ConnectorError(ConnectorErrorCodes.General, JSON.stringify(rawBody));
    }

    throw error;
  }
};

export function getConfigTemplateByType<Template extends { usageType: string }>(
  type: string,
  config: { templates?: Template[] }
): Template | undefined {
  const { templates } = config;

  if (!templates) {
    return;
  }

  return (
    templates.find((template) => template.usageType === type) ??
    templates.find((template) => template.usageType === TemplateType.Generic)
  );
}

/**
 * Matches a plausible BCP-47-style language tag: a 2–3 letter primary subtag optionally followed by
 * dash-separated subtags (e.g. `en`, `zh-CN`, `pt-BR`). Used to guard the fallback chain so that
 * malformed or empty `locale` strings degrade gracefully without injecting a `t` dict.
 */
const languageTagPattern = /^[A-Za-z]{2,3}(-[\dA-Za-z]{2,8})*$/;

const isPlausibleLanguageTag = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && languageTagPattern.test(value);

/**
 * Returns the parent language tag of a BCP-47 language tag, e.g. `'zh'` for `'zh-CN'`.
 * Returns `undefined` when the tag has no region/script subtag (no dash).
 */
const parentLanguageTag = (tag: string): string | undefined => {
  const dashIndex = tag.indexOf('-');

  if (dashIndex <= 0) {
    return;
  }

  const parent = tag.slice(0, dashIndex);

  return parent || undefined;
};

/**
 * Builds the ordered list of fallback candidates for a given locale, excluding `undefined`/empty
 * entries. Order: exact `locale` → parent tag (if any) → `'en'`.
 */
const localeFallbackCandidates = (locale: string): readonly string[] => {
  const parent = parentLanguageTag(locale);

  return [locale, parent, 'en'].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0
  );
};

/**
 * Resolves the best-matching translation dictionary from a `translations` map using a
 * locale fallback chain:
 *
 * 1. Exact `locale` match (e.g. `ka`)
 * 2. Parent language tag (e.g. `zh-CN` → `zh`)
 * 3. `'en'`
 * 4. First available language in `translations`
 * 5. Otherwise `undefined`
 *
 * Defensive against malformed `locale` strings — never throws. When `locale` is missing or does
 * not look like a language tag, no `t` dict is injected (the caller degrades to literal
 * placeholders rather than silently locale-switching).
 */
const resolveTranslationDict = (
  translations: Record<string, Record<string, string>>,
  locale?: string
): Record<string, string> | undefined => {
  // Only descend the fallback chain for a plausible locale; absent/malformed locales leave `t`
  // unset so behavior stays deterministic and backwards-compatible.
  if (!isPlausibleLanguageTag(locale)) {
    return;
  }

  for (const candidate of localeFallbackCandidates(locale)) {
    if (candidate in translations) {
      return translations[candidate];
    }
  }

  const [firstKey] = Object.keys(translations);

  return firstKey === undefined ? undefined : translations[firstKey];
};

/**
 * Enriches a {@link SendMessagePayload} with a localized translation dictionary (`payload.t`)
 * resolved from a connector's `config.translations` based on `payload.locale`.
 *
 * The resolved `t` dict is consumed by {@link replaceSendMessageHandlebars} to render `{{t.key}}`
 * handlebars in connector templates.
 *
 * Resolution uses the following fallback chain:
 * - Exact `locale` match (e.g. `ka`)
 * - Parent language tag (e.g. `zh-CN` → `zh`)
 * - `'en'`
 * - First available language in `translations`
 * - Otherwise no match → `payload` returned unchanged
 *
 * - If `translations` is undefined/null/empty, returns `payload` unchanged (backward-compatible
 *   no-op).
 * - Never mutates the original `payload`.
 * - Never throws on malformed `locale` strings — returns `payload` unchanged.
 *
 * @param payload The send-message payload, optionally containing a `locale` to resolve against.
 * @param translations A map of language tag → translation dictionary (e.g. connector
 * `config.translations`).
 * @returns A payload with `t` set to the resolved dictionary, or `payload` unchanged when no
 * dictionary could be resolved.
 */
export const getLocalizedPayload = <P extends SendMessagePayload>(
  payload: P,
  translations?: Record<string, Record<string, string>>
): P => {
  if (!translations || Object.keys(translations).length === 0) {
    return payload;
  }

  try {
    const dict = resolveTranslationDict(translations, payload.locale);

    return dict ? { ...payload, t: dict } : payload;
  } catch {
    // Defensive: never throw on malformed input (e.g. prototype-polluted objects).
    return payload;
  }
};
