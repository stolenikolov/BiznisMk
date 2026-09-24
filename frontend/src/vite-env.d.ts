/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** "off" where websockets cannot be held open (Vercel): the notification feed is polled. */
  readonly VITE_LIVE_NOTIFICATIONS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
