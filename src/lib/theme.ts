export type Theme = 'system' | 'dark' | 'light';

const KEY = 'sentinel-theme';

export function getTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system';
}

export function applyTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

/** Call once at startup; also reacts to OS theme changes in system mode. */
export function initTheme() {
  applyTheme(getTheme());
  window
    .matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => {
      if (getTheme() === 'system') applyTheme('system');
    });
}
