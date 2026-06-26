import type { LanguageTag } from '@logto/language-kit';
import { fireEvent, render } from '@testing-library/react';
import Modal from 'react-modal';

import LocalizationEditor from '.';

Modal.setAppElement(document.body);

// The component tree imports `CardTitle` -> `FeatureTag` -> `@/consts/env`, which reads Vite's
// `import.meta.env`. Jest does not define that, so mock the env module for these tests.
jest.mock('@/consts/env', () => ({
  isProduction: false,
  isCloud: false,
  isProtectedAppLocalDevEnabled: false,
  isProtectedAppEnabled: false,
  adminEndpoint: undefined,
  isDevFeaturesEnabled: false,
  consoleEmbeddedPricingUrl: undefined,
  inkeepApiKey: undefined,
  postHogKey: undefined,
  postHogHost: undefined,
  postHogUiHost: undefined,
  ossSurveyEndpoint: undefined,
}));

// `ConfirmModal` imports a global SCSS module via the `@/` alias, which the test runner
// resolves to raw SCSS. Mock it away since the test path does not exercise confirmation UX.
jest.mock('@/ds-components/ConfirmModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('<LocalizationEditor />', () => {
  const renderDetails = (languageTag: LanguageTag) => (
    <div data-testid="details-body">{languageTag}</div>
  );

  it('renders the language nav and the selected language details body', () => {
    const onClose = jest.fn();

    render(
      <LocalizationEditor
        isOpen
        titleKey="general.add"
        languages={['en', 'zh-CN']}
        renderDetails={renderDetails}
        onClose={onClose}
      />
    );

    expect(document.body.querySelectorAll('.languageItem').length).toBe(2);
    expect(document.body.querySelector('[data-testid="details-body"]')?.textContent).toBe('en');
  });

  it('switches selected language when a language item is clicked', () => {
    const onClose = jest.fn();

    render(
      <LocalizationEditor
        isOpen
        titleKey="general.add"
        languages={['en', 'zh-CN']}
        renderDetails={renderDetails}
        onClose={onClose}
      />
    );

    const languageItems = document.body.querySelectorAll('.languageItem');
    fireEvent.click(languageItems[1]!);

    expect(document.body.querySelector('.languageItem.selected')?.textContent).toContain('zh-CN');
    expect(document.body.querySelector('[data-testid="details-body"]')?.textContent).toBe('zh-CN');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();

    render(
      <LocalizationEditor
        isOpen
        titleKey="general.add"
        languages={['en']}
        renderDetails={renderDetails}
        onClose={onClose}
      />
    );

    const closeButton = document.body.querySelector('button[type="button"]');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalled();
  });
});
