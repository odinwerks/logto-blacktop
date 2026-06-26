import { webcrypto } from 'node:crypto';
// eslint-disable-next-line n/prefer-global/text-encoder, n/prefer-global/text-decoder
import { TextEncoder, TextDecoder } from 'node:util';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

void i18next.use(initReactI18next).init({
  // Simple resources for testing
  resources: { en: { translation: { admin_console: { general: { add: 'Add' } } } } },
  lng: 'en',
  react: { useSuspense: false },
});

/* eslint-disable @silverhand/fp/no-mutation */
// @ts-expect-error monkey-patch for `crypto`
crypto.subtle = webcrypto.subtle;
global.TextEncoder = TextEncoder;
// @ts-expect-error monkey-patch for `TextEncoder`/`TextDecoder`
global.TextDecoder = TextDecoder;
// JSDOM does not implement `Element.scrollIntoView`, which some components call on mount.
Element.prototype.scrollIntoView = function () {
  /* No-op */
};
/* eslint-enable @silverhand/fp/no-mutation */
