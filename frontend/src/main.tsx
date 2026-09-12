import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n/config.ts';
import './index.css';
import App from './App.tsx';
import { applyTheme, readStoredTheme } from './theme/theme.ts';

applyTheme(readStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
