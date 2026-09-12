export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'biznismk.theme';

/** Dark is the product default; light is opt-in and remembered per browser. */
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode); the theme still applies for this session.
  }
}
