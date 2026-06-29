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

// JSDOM does not implement `window.matchMedia`, which the app theme provider (and any
// `prefers-color-scheme`/media-query consumer) reads at module load. Provide a no-op MQL shim so
// components that call it on import render in tests without throwing. JSDOM's typings do not mark
// the field as optional even though it is missing at runtime, so the linter cannot see the
// nullish branch; assignment is unconditional.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
window.matchMedia ??= (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  /* eslint-disable @typescript-eslint/no-empty-function */
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  /* eslint-enable @typescript-eslint/no-empty-function */
  dispatchEvent: () => false,
});
/* eslint-enable @silverhand/fp/no-mutation */
