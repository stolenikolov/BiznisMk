import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyTheme, readStoredTheme, type Theme } from '../theme/theme.ts';
import { MoonIcon, SunIcon } from './icons.tsx';

export function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  const handleClick = () => {
    applyTheme(next, { animate: true });
    setTheme(next);
  };

  return (
    <button type="button" className="theme-toggle" onClick={handleClick} aria-label={t(`theme.${next}`)}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
