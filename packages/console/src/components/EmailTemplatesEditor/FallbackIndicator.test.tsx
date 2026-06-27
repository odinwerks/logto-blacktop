import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import useSWR from 'swr';

import FallbackIndicator from './FallbackIndicator';

// `FallbackIndicator` reads the tenant fallback language via `useSWR('api/sign-in-exp')`. Stub the
// SWR entry so its return value is fully controlled by the test.
jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;

const fallbackHintKey = 'admin_console.connector_details.email_templates.fallback_hint';

beforeEach(() => {
  mockedUseSWR.mockReset();
  // Provide the translation so `t(...)` returns interpolatable copy in assertions.
  i18next.addResource(
    'en',
    'translation',
    fallbackHintKey,
    'Falls back to {{language}} when this template is empty.'
  );
});

describe('<FallbackIndicator />', () => {
  it('shows the fallback hint with the fallback language display name when the template is empty', () => {
    mockedUseSWR.mockReturnValue({
      data: { languageInfo: { fallbackLanguage: 'en' } },
    });

    render(<FallbackIndicator isEmpty languageTag="zh-CN" />);

    expect(screen.queryByText(/Falls back to English/)).not.toBeNull();
  });

  it('hides the hint when the template has content', () => {
    mockedUseSWR.mockReturnValue({
      data: { languageInfo: { fallbackLanguage: 'en' } },
    });

    render(<FallbackIndicator languageTag="zh-CN" isEmpty={false} />);

    expect(screen.queryByText(/Falls back/)).toBeNull();
  });

  it('hides the hint when the fallback language equals the edited language', () => {
    mockedUseSWR.mockReturnValue({
      data: { languageInfo: { fallbackLanguage: 'zh-CN' } },
    });

    render(<FallbackIndicator isEmpty languageTag="zh-CN" />);

    expect(screen.queryByText(/Falls back/)).toBeNull();
  });

  it('hides the hint while the fallback language is still loading', () => {
    mockedUseSWR.mockReturnValue({});

    render(<FallbackIndicator isEmpty languageTag="zh-CN" />);

    expect(screen.queryByText(/Falls back/)).toBeNull();
  });
});
