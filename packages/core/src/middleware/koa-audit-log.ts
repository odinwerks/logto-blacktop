import type { LogContextPayload, LogKey } from '@logto/schemas';
import { LogResult } from '@logto/schemas';
import { generateStandardId } from '@logto/shared';
import { conditional, type Optional, pick } from '@silverhand/essentials';
import type { Context, MiddlewareType } from 'koa';
import type { IRouterParamContext } from 'koa-router';
import { UAParser } from 'ua-parser-js';

import RequestError from '#src/errors/RequestError/index.js';
import type Queries from '#src/tenants/Queries.js';
import { getInjectedHeaderValues } from '#src/utils/injected-header-mapping.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPromise = (value: unknown): value is PromiseLike<UAParser.IResult> =>
  isRecord(value) && typeof value.then === 'function';

const sensitiveDataKeys = Object.freeze(['password', 'secret']);

const sanitise = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((element) => sanitise(element));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, element]) => {
        return [key, sensitiveDataKeys.includes(key) ? '******' : sanitise(element)];
      })
    );
  }

  return value;
};

/**
 * Recursively strip null characters (U+0000) from every string in the value. PostgreSQL rejects
 * null bytes in `jsonb` (error code `22P05`), so leaving them in would make `insertLog` throw. Since
 * logs are inserted in a `finally` block, that throw would replace the original response with a 500.
 */
const nullCharacter = String.fromCodePoint(0);

const stripFromString = (value: string): string =>
  value.includes(nullCharacter) ? value.replaceAll(nullCharacter, '') : value;

const stripNullCharacters = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return stripFromString(value);
  }

  if (Array.isArray(value)) {
    return value.map((element) => stripNullCharacters(element));
  }

  if (isRecord(value)) {
    // Strip from keys as well: PostgreSQL rejects null bytes anywhere in `jsonb`, keys included.
    return Object.fromEntries(
      Object.entries(value).map(([key, element]) => [
        stripFromString(key),
        stripNullCharacters(element),
      ])
    );
  }

  return value;
};

const filterSensitiveData = (data: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      return [key, sensitiveDataKeys.includes(key) ? '******' : sanitise(value)];
    })
  );
};

const removeUndefinedKeys = (object: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

export class LogEntry {
  payload: LogContextPayload;

  constructor(public readonly key: LogKey) {
    this.payload = {
      key,
      result: LogResult.Success,
    };
  }

  /** Update payload by spreading `data` first, then spreading `this.payload`. */
  prepend(data: Readonly<LogPayload>) {
    this.payload = {
      ...removeUndefinedKeys(data),
      ...this.payload,
    };
  }

  /** Update payload by spreading `this.payload` first, then spreading `data`. */
  append(data: Readonly<LogPayload>) {
    this.payload = {
      ...this.payload,
      ...filterSensitiveData(removeUndefinedKeys(data)),
    };
  }
}

export type LogPayload = Partial<LogContextPayload>;

export type LogContext = {
  createLog: (key: LogKey) => LogEntry;
  prependAllLogEntries: (payload: LogPayload) => void;
};

export type WithLogContext<ContextT extends IRouterParamContext = IRouterParamContext & Context> =
  ContextT & LogContext;

/**
 * The factory to create a new audit log middleware function.
 * It will inject a `createLog` function the context to enable audit logging.
 *
 * #### Create a log entry
 *
 * You need to explicitly call `ctx.createLog()` to create a new {@link LogEntry} instance,
 * which accepts a read-only parameter {@link LogKey} thus the log can be categorized and indexed in database.
 *
 * ```ts
 * const log = ctx.createLog('Interaction.Create'); // Key is typed
 * ```
 *
 * Note every time you call `ctx.createLog()`, it will create a new log entry instance for inserting. So multiple log entries may be inserted within one request.
 *
 * Remember to keep the log entry instance properly if you want to collect log data from multiple places.
 *
 * #### Log data
 *
 * To update log payload, call `log.append()`. It will use object spread operators to update payload (i.e. merge with one-level overwrite and shallow copy).
 *
 * ```ts
 * log.append({ applicationId: 'foo' });
 * ```
 *
 * This function can be called multiple times.
 *
 * #### Log context
 *
 * By default, before inserting the logs, it will extract the request context and prepend request IP and User Agent to every log entry:
 *
 * ```ts
 * {
 *   ip: 'request-ip-addr',
 *   userAgent: 'request-user-agent',
 *   userAgentParsed: { ...parsedUserAgent },
 *   ...log.payload,
 * }
 * ```
 *
 * To add more common data to log entries, try to create another middleware function after this one, and call `ctx.prependAllLogEntries()`.
 *
 * @returns An audit log middleware function.
 * @see {@link LogKey} for all available log keys, and {@link LogResult} for result enums.
 * @see {@link LogContextPayload} for the basic type suggestion of log data.
 */
export default function koaAuditLog<StateT, ContextT extends IRouterParamContext, ResponseBodyT>({
  logs: { insertLog },
}: Queries): MiddlewareType<StateT, WithLogContext<ContextT>, ResponseBodyT> {
  // eslint-disable-next-line complexity
  return async (ctx, next) => {
    const entries: LogEntry[] = [];

    ctx.createLog = (key: LogKey) => {
      const entry = new LogEntry(key);
      // eslint-disable-next-line @silverhand/fp/no-mutating-methods
      entries.push(entry);

      return entry;
    };

    ctx.prependAllLogEntries = (payload) => {
      for (const entry of entries) {
        entry.prepend(payload);
      }
    };

    try {
      await next();
    } catch (error: unknown) {
      for (const entry of entries) {
        entry.append({
          result: LogResult.Error,
          error:
            error instanceof RequestError
              ? pick(error, 'message', 'code', 'data')
              : { message: String(error) },
        });
      }
      throw error;
    } finally {
      // Predefined context
      const {
        ip,
        headers: {
          'user-agent': userAgent,
          'sec-ch-ua-model': chUaModel,
          'sec-ch-ua-platform-version': chUaPlatformVersion,
          'sec-ch-ua-platform': chUaPlatform,
          'sec-ch-ua-full-version-list': chUaFullVersionList,
          'sec-ch-ua-mobile': chUaMobile,
        },
      } = ctx.request;
      const signInContext = conditional(getInjectedHeaderValues(ctx.request.headers));
      const userAgentValue: Optional<string> =
        typeof userAgent === 'string' ? userAgent : userAgent?.[0];
      const chHeaders = {
        'sec-ch-ua-model': typeof chUaModel === 'string' ? chUaModel : undefined,
        'sec-ch-ua-platform-version':
          typeof chUaPlatformVersion === 'string' ? chUaPlatformVersion : undefined,
        'sec-ch-ua-platform': typeof chUaPlatform === 'string' ? chUaPlatform : undefined,
        'sec-ch-ua-full-version-list':
          typeof chUaFullVersionList === 'string' ? chUaFullVersionList : undefined,
        'sec-ch-ua-mobile': typeof chUaMobile === 'string' ? chUaMobile : undefined,
      } satisfies Record<string, string | undefined>;
      const hasCh = Object.values(chHeaders).some(Boolean);
      const userAgentParsed: Optional<UAParser.IResult> = conditional(
        (() => {
          if (!userAgentValue) {
            return;
          }

          try {
            const clientHints: Record<string, string> = Object.fromEntries(
              Object.entries(chHeaders).filter(
                (entry): entry is [string, string] => entry[1] !== undefined
              )
            );

            const parser = new UAParser(userAgentValue, undefined, hasCh ? clientHints : undefined);
            const result = parser.getResult();
            if (!hasCh) {
              return result;
            }
            const withHints = result.withClientHints();
            // WithClientHints() may return a PromiseLike when client hints are async; fall back to sync result
            if (isPromise(withHints)) {
              return result;
            }
            return withHints;
          } catch (error: unknown) {
            // eslint-disable-next-line no-console
            console.warn(
              'Failed to parse user-agent:',
              error instanceof Error ? error.message : error
            );
          }
        })()
      );
      const basePayload = removeUndefinedKeys({
        ip,
        userAgent: userAgentValue,
        ...conditional(userAgentParsed && { userAgentParsed }),
        ...conditional(signInContext && { signInContext }),
      });

      await Promise.all(
        entries.map(async ({ payload }) => {
          const fullPayload = { ...basePayload, ...payload };
          const strippedPayload = stripNullCharacters(fullPayload);
          const isPayload = (value: unknown): value is typeof fullPayload => true;
          return insertLog({
            id: generateStandardId(),
            key: payload.key,
            payload: isPayload(strippedPayload) ? strippedPayload : fullPayload,
          });
        })
      );
    }
  };
}
