// frontend/src/hooks/useIsDarkTheme.ts
import { useEffect, useState } from 'react';

const DARK_THEME_CLASS = 'pf-v6-theme-dark';

function readIsDarkTheme(): boolean {
  return document.documentElement.classList.contains(DARK_THEME_CLASS);
}

/**
 * Tracks the app-wide light/dark toggle (App.tsx flips `pf-v6-theme-dark` on
 * <html>) so components that can't rely on CSS alone - e.g. the Monaco-based
 * YAML editor, which needs an explicit `isDarkTheme` prop - can react to it
 * without threading a theme prop through every intermediate component.
 */
export function useIsDarkTheme(): boolean {
  const [isDarkTheme, setIsDarkTheme] = useState(readIsDarkTheme);

  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => setIsDarkTheme(readIsDarkTheme()));
    observer.observe(target, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDarkTheme;
}
