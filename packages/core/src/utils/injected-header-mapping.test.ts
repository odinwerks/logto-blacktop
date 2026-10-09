import type { IncomingHttpHeaders } from 'node:http';
import { BlockList } from 'node:net';

import { createMockUtils } from '@logto/shared/esm';

const { jest } = import.meta;

const { mockEsm } = createMockUtils(jest);

type TrustedEdgeConfig = {
  injectedHeadersTrustedToken?: string;
  injectedHeadersTrustedCidrBlockList?: BlockList;
};

const loadGetInjectedHeaderValues = async ({
  injectedHeaderMappingJson,
  debugInjectedHeadersJson,
  isDevFeaturesEnabled = true,
  injectedHeadersTrustedToken,
  injectedHeadersTrustedCidrBlockList,
}: {
  injectedHeaderMappingJson?: string;
  debugInjectedHeadersJson?: string;
  isDevFeaturesEnabled?: boolean;
} & TrustedEdgeConfig = {}) => {
  jest.resetModules();
  mockEsm('#src/env-set/index.js', () => ({
    EnvSet: {
      values: {
        injectedHeaderMappingJson,
        debugInjectedHeadersJson,
        isDevFeaturesEnabled,
        injectedHeadersTrustedToken,
        injectedHeadersTrustedCidrBlockList,
      },
    },
  }));

  const { getInjectedHeaderValues } = await import('./injected-header-mapping.js');

  return getInjectedHeaderValues;
};

const trustedViaToken = {
  injectedHeadersTrustedToken: 'edge-secret',
} satisfies TrustedEdgeConfig;

const trustedTokenHeaders: IncomingHttpHeaders = {
  'x-logto-injected-token': 'edge-secret',
};

const buildCidrBlockList = (entries: string[]): BlockList => {
  const list = new BlockList();

  for (const entry of entries) {
    const [address, prefix] = entry.split('/');

    if (prefix === undefined) {
      list.addAddress(address ?? '', address?.includes(':') ? 'ipv6' : 'ipv4');
      continue;
    }

    list.addSubnet(address ?? '', Number(prefix), address?.includes(':') ? 'ipv6' : 'ipv4');
  }

  return list;
};

describe('getInjectedHeaderValues', () => {
  it('should use default mapping when no custom mapping is provided', async () => {
    const getInjectedHeaderValues = await loadGetInjectedHeaderValues(trustedViaToken);
    const headers: IncomingHttpHeaders = {
      ...trustedTokenHeaders,
      'x-logto-cf-country': 'US',
      'x-logto-cf-city': 'New York',
    };

    expect(getInjectedHeaderValues(headers)).toEqual({
      country: 'US',
      city: 'New York',
    });
  });

  it('should use custom mapping and normalize header names', async () => {
    const getInjectedHeaderValues = await loadGetInjectedHeaderValues({
      injectedHeaderMappingJson: JSON.stringify({
        country: 'X-Custom-Country',
        score: ' x-custom-score ',
      }),
      ...trustedViaToken,
    });
    const headers: IncomingHttpHeaders = {
      ...trustedTokenHeaders,
      'x-custom-country': 'JP',
      'x-custom-score': ['1', '2'],
    };

    expect(getInjectedHeaderValues(headers)).toEqual({
      country: 'JP',
      score: '1, 2',
    });
  });

  it('should fall back to default mapping when mapping JSON is invalid', async () => {
    const getInjectedHeaderValues = await loadGetInjectedHeaderValues({
      injectedHeaderMappingJson: 'not-json',
      ...trustedViaToken,
    });
    const headers: IncomingHttpHeaders = {
      ...trustedTokenHeaders,
      'x-logto-cf-country': 'US',
    };

    expect(getInjectedHeaderValues(headers)).toEqual({ country: 'US' });
  });

  it('should use debug injected headers when enabled', async () => {
    const getInjectedHeaderValues = await loadGetInjectedHeaderValues({
      debugInjectedHeadersJson: JSON.stringify({ country: 'FR', botScore: 10 }),
    });
    const headers: IncomingHttpHeaders = {
      'x-logto-cf-country': 'US',
    };

    expect(getInjectedHeaderValues(headers)).toEqual({ country: 'FR', botScore: '10' });
  });

  it('should ignore debug injected headers when dev features disabled', async () => {
    const getInjectedHeaderValues = await loadGetInjectedHeaderValues({
      debugInjectedHeadersJson: JSON.stringify({ country: 'FR' }),
      isDevFeaturesEnabled: false,
      ...trustedViaToken,
    });
    const headers: IncomingHttpHeaders = {
      ...trustedTokenHeaders,
      'x-logto-cf-country': 'US',
    };

    expect(getInjectedHeaderValues(headers)).toEqual({ country: 'US' });
  });

  describe('trusted-edge gate', () => {
    const cfHeaders: IncomingHttpHeaders = {
      'x-logto-cf-country': 'US',
      'x-logto-cf-bot-score': '30',
    };

    it('should ignore injected headers when no trust signal is configured', async () => {
      const getInjectedHeaderValues = await loadGetInjectedHeaderValues();

      expect(getInjectedHeaderValues(cfHeaders, '10.0.0.1')).toBeUndefined();
    });

    it('should consume headers when the shared-secret header matches', async () => {
      const getInjectedHeaderValues = await loadGetInjectedHeaderValues(trustedViaToken);

      expect(getInjectedHeaderValues({ ...trustedTokenHeaders, ...cfHeaders })).toEqual({
        country: 'US',
        botScore: '30',
      });
    });

    it('should ignore headers when the shared-secret header is absent or wrong', async () => {
      const getInjectedHeaderValues = await loadGetInjectedHeaderValues(trustedViaToken);

      expect(getInjectedHeaderValues(cfHeaders)).toBeUndefined();
      expect(
        getInjectedHeaderValues({ ...cfHeaders, 'x-logto-injected-token': 'wrong' })
      ).toBeUndefined();
    });

    it('should consume headers from a trusted proxy CIDR match', async () => {
      const getInjectedHeaderValues = await loadGetInjectedHeaderValues({
        injectedHeadersTrustedCidrBlockList: buildCidrBlockList(['10.0.0.0/8', 'fd00::/8']),
      });

      expect(getInjectedHeaderValues(cfHeaders, '10.1.2.3')).toEqual({
        country: 'US',
        botScore: '30',
      });
      expect(getInjectedHeaderValues(cfHeaders, 'fd00::1')).toEqual({
        country: 'US',
        botScore: '30',
      });
    });

    it('should consume headers from an IPv4-mapped IPv6 trusted peer', async () => {
      const getInjectedHeaderValues = await loadGetInjectedHeaderValues({
        injectedHeadersTrustedCidrBlockList: buildCidrBlockList(['10.0.0.0/8']),
      });

      expect(getInjectedHeaderValues(cfHeaders, '::ffff:10.1.2.3')).toEqual({
        country: 'US',
        botScore: '30',
      });
    });

    it('should ignore headers when the peer is outside the trusted CIDRs', async () => {
      const getInjectedHeaderValues = await loadGetInjectedHeaderValues({
        injectedHeadersTrustedCidrBlockList: buildCidrBlockList(['10.0.0.0/8']),
      });

      expect(getInjectedHeaderValues(cfHeaders, '192.168.1.1')).toBeUndefined();
      expect(getInjectedHeaderValues(cfHeaders)).toBeUndefined();
    });
  });
});
