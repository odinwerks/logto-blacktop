import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';

import { conditional, type Optional } from '@silverhand/essentials';

import { EnvSet } from '#src/env-set/index.js';
import { safeParseJson } from '#src/utils/json.js';
import { isRecord } from '#src/utils/type.js';

type InjectedHeaderMapping = Record<string, string>;
type InjectedHeaderValues = Record<string, string>;

export const defaultInjectedHeaderMapping: InjectedHeaderMapping = Object.freeze({
  country: 'x-logto-cf-country',
  city: 'x-logto-cf-city',
  latitude: 'x-logto-cf-latitude',
  longitude: 'x-logto-cf-longitude',
  botScore: 'x-logto-cf-bot-score',
  botVerified: 'x-logto-cf-bot-verified',
});

const normalizeHeaderName = (headerName: string) => headerName.trim().toLowerCase();

/**
 * The request header carrying the shared secret a trusted edge sends to authenticate itself
 * (`INJECTED_HEADERS_TRUSTED_TOKEN`). It is deliberately not part of the configurable mapping.
 */
const trustedEdgeTokenHeader = 'x-logto-injected-token';

const parseInjectedHeaderMapping = (
  rawMapping: Optional<string>
): Optional<InjectedHeaderMapping> => {
  if (!rawMapping?.trim()) {
    return;
  }

  const parsed = safeParseJson(rawMapping);

  if (!isRecord(parsed)) {
    return;
  }

  const entries = Object.entries(parsed).flatMap<[string, string]>(([key, value]) => {
    if (typeof value !== 'string') {
      return [];
    }

    const headerName = normalizeHeaderName(value);

    return headerName ? [[key, headerName]] : [];
  });

  const mapping: InjectedHeaderMapping = Object.fromEntries(entries);
  return mapping;
};

const injectedHeaderMapping =
  parseInjectedHeaderMapping(EnvSet.values.injectedHeaderMappingJson) ??
  defaultInjectedHeaderMapping;

const normalizeHeaderValue = (value: Optional<string | string[]>): Optional<string> => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return undefined;
};

/**
 * Whether this request may legitimately carry injected headers.
 *
 * The mapped headers (`x-logto-cf-*` by default) are only trustworthy when a trusted edge in
 * front of Logto — e.g. the Cloudflare layer on Logto Cloud — overwrites them on every
 * request. Deployments without such an edge let any client send the headers itself and defeat
 * adaptive-MFA geo-velocity / bot-signal checks, so a configured trust signal is required
 * before the headers are consumed at all. Two signals are supported; either match marks the
 * request trusted (see `INJECTED_HEADERS_TRUSTED_*` in `GlobalValues`):
 *
 * 1. Shared-secret header: `x-logto-injected-token` equals `INJECTED_HEADERS_TRUSTED_TOKEN`.
 * 2. Trusted proxy: the direct TCP peer IP (`remoteIp`, never `Forwarded` headers which
 *    clients can spoof) falls inside `INJECTED_HEADERS_TRUSTED_CIDRS`.
 *
 * When neither is configured, every request is untrusted and the injected headers are ignored.
 */
const isTrustedEdge = (headers: IncomingHttpHeaders, remoteIp: Optional<string>): boolean => {
  const { injectedHeadersTrustedToken, injectedHeadersTrustedCidrBlockList } = EnvSet.values;

  if (
    injectedHeadersTrustedToken &&
    normalizeHeaderValue(headers[trustedEdgeTokenHeader]) === injectedHeadersTrustedToken
  ) {
    return true;
  }

  if (injectedHeadersTrustedCidrBlockList && remoteIp) {
    // A direct IPv4 peer is often reported as the IPv4-mapped IPv6 form `::ffff:a.b.c.d`.
    const normalizedIp = remoteIp.toLowerCase().startsWith('::ffff:')
      ? remoteIp.slice('::ffff:'.length)
      : remoteIp;
    const ipVersion = isIP(normalizedIp);

    return (
      ipVersion !== 0 &&
      injectedHeadersTrustedCidrBlockList.check(normalizedIp, ipVersion === 6 ? 'ipv6' : 'ipv4')
    );
  }

  return false;
};

const parseDebugInjectedHeaderValues = (
  rawValues: Optional<string>
): Optional<InjectedHeaderValues> => {
  if (!rawValues?.trim()) {
    return;
  }

  const parsed = safeParseJson(rawValues);

  if (!isRecord(parsed)) {
    return;
  }

  const entries = Object.entries(parsed).flatMap<[string, string]>(([key, value]) => {
    if (typeof value === 'string') {
      return [[key, value]];
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return [[key, String(value)]];
    }

    return [];
  });

  if (entries.length === 0) {
    return;
  }

  return Object.fromEntries(entries);
};

/**
 * Read the edge-injected values (`x-logto-cf-*` by default) from `headers`.
 *
 * @param headers The request headers.
 * @param remoteIp The direct TCP peer IP of the request (`ctx.socket.remoteAddress`), used
 * for the `INJECTED_HEADERS_TRUSTED_CIDRS` check. Do not pass an address derived from
 * `Forwarded` / `X-Forwarded-For`: clients control those headers.
 */
export const getInjectedHeaderValues = (
  headers: IncomingHttpHeaders,
  remoteIp?: string
): Optional<InjectedHeaderValues> => {
  const debugInjectedHeaderValues = conditional(
    EnvSet.values.isDevFeaturesEnabled &&
      parseDebugInjectedHeaderValues(EnvSet.values.debugInjectedHeadersJson)
  );

  if (debugInjectedHeaderValues) {
    return debugInjectedHeaderValues;
  }

  if (!isTrustedEdge(headers, remoteIp)) {
    return;
  }

  const entries = Object.entries(injectedHeaderMapping).flatMap<[string, string]>(
    ([key, headerName]) => {
      const value = normalizeHeaderValue(headers[headerName]);

      return value === undefined ? [] : [[key, value]];
    }
  );

  if (entries.length === 0) {
    return;
  }

  const values: InjectedHeaderValues = Object.fromEntries(entries);
  return values;
};
