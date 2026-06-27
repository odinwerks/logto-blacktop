import type { EmailTemplateDetails } from '@logto/connector-kit';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import EmailTemplateDetailsForm from './EmailTemplateDetailsForm';

// Mock the heavy/presentational DS leaves so the test focuses on the contentType branching
// (CodeEditor for html vs Textarea for plain) without pulling in `react-syntax-highlighter`,
// dropdowns, or feature-tag context.
jest.mock('@/ds-components/CodeEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="code-editor" />,
}));
jest.mock('@/ds-components/Select', () => ({
  __esModule: true,
  default: () => <div data-testid="select" />,
}));
// `TextInput` is deliberately left unmocked: it is `forwardRef`-backed, so react-hook-form's
// `register(...)` spreads its ref onto a real (lightweight) input without the function-component
// ref warning.
jest.mock('@/ds-components/Textarea', () => ({
  __esModule: true,
  default: () => <textarea data-testid="textarea" />,
}));
jest.mock('@/ds-components/FormField', () => ({
  __esModule: true,
  default: ({ children }: { children?: ReactNode }) => (
    <div data-testid="form-field">{children}</div>
  ),
}));

const htmlDetails: EmailTemplateDetails = {
  subject: 'Welcome',
  content: '<b>Hi</b>',
  contentType: 'text/html',
};

const plainDetails: EmailTemplateDetails = {
  subject: 'Welcome',
  content: 'Hi',
  contentType: 'text/plain',
};

describe('<EmailTemplateDetailsForm />', () => {
  it('renders the code editor when contentType is text/html', () => {
    render(<EmailTemplateDetailsForm defaultValue={htmlDetails} onChange={jest.fn()} />);

    expect(screen.queryByTestId('code-editor')).not.toBeNull();
    expect(screen.queryByTestId('textarea')).toBeNull();
  });

  it('renders a textarea when contentType is text/plain', () => {
    render(<EmailTemplateDetailsForm defaultValue={plainDetails} onChange={jest.fn()} />);

    expect(screen.queryByTestId('textarea')).not.toBeNull();
    expect(screen.queryByTestId('code-editor')).toBeNull();
  });
});
