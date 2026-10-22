/**
 * Pins the fork's deliberate self-hosted deltas.
 *
 * Why this file exists: twice now, an upstream merge has silently re-gated a
 * Blacktop unlock. Upstream rewrites the same block with a new mechanism (for
 * example `isCloud` became a license entitlement), so the merge has no conflict
 * to flag and takes upstream's side. The behavioural tests in
 * `libraries/sign-in-experience/*.test.ts`, `routes/sign-in-experience/*.test.ts`
 * and `libraries/quota.test.ts` cover the same behaviour, but those files are
 * upstream-owned: a merge can replace them wholesale, taking the fork's test
 * edits with them.
 *
 * This file is fork-owned and path-unique, so a merge keeps it. It asserts the
 * shape of the unlock, not the whole feature. If it fails after a merge, the
 * merge re-gated something: re-apply the unlock, or change this test
 * deliberately and say why in the commit message.
 *
 * Unlocks pinned here (all from 44fa56b85 / 0a7ee51c8, re-applied in
 * 0e3f8fd73 and 631d5f7ef):
 * - hiding the Logto branding and the Custom UI CSP on self-hosted
 * - no SAML application cap outside Cloud
 * - no admin-tenant JWT customizer gate
 */
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('fork unlocks: self-hosted sign-in experience', () => {
  const library = read('src/libraries/sign-in-experience/index.ts');
  const routes = read('src/routes/sign-in-experience/index.ts');

  it('serves the saved hideLogtoBranding value without a license', () => {
    expect(library).toContain('const { hideLogtoBranding } = publicSignInExperience;');
    expect(library).not.toContain('isHideLogtoBrandingGrantedByLicense');
  });

  it('accepts hideLogtoBranding and customUiCsp without a license', () => {
    // The write path must not consult the self-hosted license for either field.
    expect(routes).not.toContain('licenseQuota.hideLogtoBranding');
    expect(routes).not.toContain('licenseQuota.bringYourUi');
    expect(routes).not.toContain('Hide Logto branding is not supported in this environment');
    expect(routes).not.toContain('Custom UI CSP configuration is not available');
  });
});

describe('fork unlocks: self-hosted quota', () => {
  const quota = read('src/libraries/quota.ts');

  it('enforces no tenant quota outside Cloud, including the SAML application cap', () => {
    expect(quota).not.toContain('assertSelfHostedSamlApplicationsLimit');
    expect(quota).not.toContain('application.saml.reach_oss_limit');
    // The license is the source of the cap; reading it here means the cap is back.
    expect(quota).not.toContain('getSelfHostedSubscription');
  });
});

describe('fork unlocks: admin tenant JWT customizer', () => {
  it('does not refuse a customizer for the admin tenant', () => {
    const source = read('src/routes/logto-config/jwt-customizer.ts');

    expect(source).not.toContain('can_not_create_for_admin_tenant');
  });
});
