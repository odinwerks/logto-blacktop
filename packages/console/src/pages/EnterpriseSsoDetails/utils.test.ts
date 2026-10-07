import { SsoProviderType } from '@logto/schemas';

import { shouldShowIdpInitiatedAuthTab } from './utils';

describe('shouldShowIdpInitiatedAuthTab', () => {
  it('returns true for Cloud SAML connectors when IdP-initiated SSO is entitled', () => {
    expect(
      shouldShowIdpInitiatedAuthTab({
        isCloud: true,
        providerType: SsoProviderType.SAML,
        isIdpInitiatedSsoEnabled: true,
      })
    ).toBe(true);
  });

  it('returns true for OSS SAML connectors', () => {
    expect(
      shouldShowIdpInitiatedAuthTab({
        isCloud: false,
        providerType: SsoProviderType.SAML,
        isIdpInitiatedSsoEnabled: false,
      })
    ).toBe(true);
  });

  it('returns false for non-SAML connectors', () => {
    expect(
      shouldShowIdpInitiatedAuthTab({
        isCloud: false,
        providerType: SsoProviderType.OIDC,
        isIdpInitiatedSsoEnabled: false,
      })
    ).toBe(false);
  });
});
