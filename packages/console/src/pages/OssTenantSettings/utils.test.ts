import {
  shouldShowOssTenantLicenseTab,
  shouldShowOssTenantMembersTab,
  shouldShowOssTenantSettingsTab,
} from './utils';

describe('shouldShowOssTenantMembersTab', () => {
  it('returns true for OSS', () => {
    expect(shouldShowOssTenantMembersTab({ isCloud: false })).toBe(true);
  });

  it('returns false for cloud', () => {
    expect(shouldShowOssTenantMembersTab({ isCloud: true })).toBe(false);
  });
});

describe('shouldShowOssTenantLicenseTab', () => {
  it('shows the tab on a self-hosted instance', () => {
    expect(shouldShowOssTenantLicenseTab({ isCloud: false, isDevFeaturesEnabled: true })).toBe(
      true
    );
  });

  it('hides the tab on cloud, where the subscription is the entitlement source', () => {
    expect(shouldShowOssTenantLicenseTab({ isCloud: true, isDevFeaturesEnabled: true })).toBe(
      false
    );
  });

  it('hides the tab while the self-hosted plans are unreleased', () => {
    expect(shouldShowOssTenantLicenseTab({ isCloud: false, isDevFeaturesEnabled: false })).toBe(
      false
    );
  });
});

describe('shouldShowOssTenantSettingsTab', () => {
  const options = {
    isCloud: false,
    isDevFeaturesEnabled: true,
    isMandatoryMfaEntitled: true,
    isMfaRequired: false,
  };

  it('shows the tab when the license grants mandatory MFA', () => {
    expect(shouldShowOssTenantSettingsTab(options)).toBe(true);
  });

  it('hides the tab without the entitlement', () => {
    expect(shouldShowOssTenantSettingsTab({ ...options, isMandatoryMfaEntitled: false })).toBe(
      false
    );
  });

  it('keeps the tab while MFA is required, so it can be turned off after the license lapses', () => {
    expect(
      shouldShowOssTenantSettingsTab({
        ...options,
        isMandatoryMfaEntitled: false,
        isMfaRequired: true,
      })
    ).toBe(true);
  });

  it('hides the tab on cloud and while the self-hosted plans are unreleased', () => {
    expect(shouldShowOssTenantSettingsTab({ ...options, isCloud: true })).toBe(false);
    expect(shouldShowOssTenantSettingsTab({ ...options, isDevFeaturesEnabled: false })).toBe(false);
  });
});
