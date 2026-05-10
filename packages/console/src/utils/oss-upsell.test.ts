import { buildCloudUpsellUrl, openCloudUpsell, ossUpsellEntries } from './oss-upsell';

describe('oss upsell helpers', () => {
  it('buildCloudUpsellUrl returns a neutral placeholder', () => {
    const url = buildCloudUpsellUrl(ossUpsellEntries.getStartedOssCloudBanner);
    expect(url).toBe('#');
  });

  it('openCloudUpsell is a no-op', () => {
    const result = openCloudUpsell();
    expect(result).toBeUndefined();
  });
});
