/**
 * Pins the fork's deliberate self-hosted deltas in the Admin Console.
 *
 * Same reason as `packages/core/src/fork-unlocks.test.ts`: upstream merges
 * rewrite the same blocks and silently re-gate self-hosted behaviour, and the
 * fork's edits to upstream-owned test files go with them. This file is
 * fork-owned, so it survives a merge and fails loudly instead.
 *
 * Unlocks pinned here (44fa56b85, re-applied in 631d5f7ef):
 * - the disposable-email blocklist toggle renders on self-hosted
 * - the branding entitlements (hide branding + Custom UI CSP) stay unlocked
 * - the IdP-initiated SSO tab is offered on self-hosted
 */
import fs from 'node:fs';

import { SsoProviderType } from '@logto/schemas';

import { shouldShowIdpInitiatedAuthTab } from './pages/EnterpriseSsoDetails/utils';

const read = (relativePath: string) =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- the console tsconfig has no Node types; this only reads source text.
  fs.readFileSync(`${process.cwd()}/${relativePath}`, 'utf8');

describe('fork unlocks: sign-in experience console', () => {
  it('renders the disposable-email blocklist toggle on self-hosted', () => {
    const source = read('src/pages/Security/Blocklist/BlocklistForm/index.tsx');

    expect(source).toContain('blockDisposableAddresses');
    // The field used to be wrapped in `{isCloud && (...)}`.
    expect(source).not.toContain('isCloud && (');
  });

  it('keeps both branding entitlements unlocked on self-hosted', () => {
    const source = read('src/pages/SignInExperience/hooks/use-branding-entitlements.ts');

    expect(source).toContain('isHideLogtoBrandingEnabled: true');
    expect(source).toContain('isCustomUiCspEnabled: true');
  });
});

describe('fork unlocks: IdP-initiated SSO tab', () => {
  it('is offered outside Cloud', () => {
    expect(
      shouldShowIdpInitiatedAuthTab({
        isCloud: false,
        providerType: SsoProviderType.SAML,
        isIdpInitiatedSsoEnabled: false,
      })
    ).toBe(true);
  });
});
