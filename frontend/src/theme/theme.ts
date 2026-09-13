export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'biznismk.theme';
const TRANSITION_CLASS = 'theme-transition';
const TRANSITION_MS = 320;

let transitionTimer: number | undefined;

/** Dark is the product default; light is opt-in and remembered per browser. */
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Applies a theme. Pass `animate` when the change is a user action, so colours
 * cross-fade instead of snapping — it's left off at boot so the first paint
 * isn't animated. The transition class is temporary: keeping it on permanently
 * would slow down every hover in the app.
 */
export function applyTheme(theme: Theme, { animate = false } = {}): void {
  const root = document.documentElement;

  if (animate && !prefersReducedMotion()) {
    root.classList.add(TRANSITION_CLASS);
    window.clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => root.classList.remove(TRANSITION_CLASS), TRANSITION_MS);
  }

  root.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode); the theme still applies for this session.
  }
}
