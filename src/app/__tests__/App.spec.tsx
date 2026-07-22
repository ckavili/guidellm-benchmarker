import { render, screen } from '@testing-library/react';
import App from '../App';

jest.mock('../pages/RunBenchmarkPage', () => {
  const MockPage = () => <div data-testid="run-benchmark-page">Run Benchmark Page</div>;
  MockPage.displayName = 'MockRunBenchmarkPage';
  return { __esModule: true, default: MockPage };
});

jest.mock('../pages/ResultsPage', () => {
  const MockPage = () => <div data-testid="results-page">Results Page</div>;
  MockPage.displayName = 'MockResultsPage';
  return { __esModule: true, default: MockPage };
});

describe('App Component', () => {
  it('should render the routes container', () => {
    render(<App />);
    expect(screen.getByTestId('routes')).toBeInTheDocument();
  });
});
