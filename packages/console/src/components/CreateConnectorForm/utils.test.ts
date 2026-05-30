import { shouldShowEmailConnectorUpsellBanner } from './utils';

describe('shouldShowEmailConnectorUpsellBanner', () => {
  test('always returns false', () => {
    expect(shouldShowEmailConnectorUpsellBanner()).toBe(false);
  });
});
