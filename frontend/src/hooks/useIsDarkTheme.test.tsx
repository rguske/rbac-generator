// frontend/src/hooks/useIsDarkTheme.test.tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { useIsDarkTheme } from './useIsDarkTheme';

function Probe() {
  const isDarkTheme = useIsDarkTheme();
  return <div data-testid="probe">{String(isDarkTheme)}</div>;
}

describe('useIsDarkTheme', () => {
  afterEach(() => {
    document.documentElement.classList.remove('pf-v6-theme-dark');
  });

  it('reflects the initial state of the document root class', () => {
    document.documentElement.classList.add('pf-v6-theme-dark');
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('true');
  });

  it('defaults to false when the dark theme class is absent', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('false');
  });

  it('updates when the document root class changes after mount', async () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('false');

    await act(async () => {
      document.documentElement.classList.add('pf-v6-theme-dark');
      // MutationObserver callbacks fire in a microtask.
      await Promise.resolve();
    });

    expect(screen.getByTestId('probe')).toHaveTextContent('true');
  });
});
