import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import i18n from '../i18n/config.ts';

/**
 * Auth relies on httpOnly cookies set by the backend, so every request must
 * carry credentials — there is no token for client code to attach manually.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  withCredentials: true,
});

/**
 * The language the app is showing, so what the server writes for this person —
 * a sign-in code email, say — is in it too.
 */
api.interceptors.request.use((config) => {
  config.headers.set('Accept-Language', i18n.resolvedLanguage ?? 'mk');
  return config;
});

/** Endpoints that must never trigger a refresh: they are the auth flow itself. */
const AUTH_PATHS = [
  '/auth/refresh',
  '/auth/login',
  '/auth/2fa/verify',
  '/auth/2fa/resend',
  '/auth/register',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
];

type RetriableConfig = InternalAxiosRequestConfig & { hasBeenRetried?: boolean };

/**
 * One refresh at a time.
 *
 * The backend rotates refresh tokens and treats a re-presented one as theft,
 * revoking every session for that user. Two requests failing at once must
 * therefore share a single rotation rather than each starting their own.
 */
let refreshInFlight: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshInFlight ??= api
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * The access cookie lives 15 minutes while the refresh cookie lives 30 days, so
 * without this every session died a quarter of an hour in: each call answered
 * 401 and nothing ever renewed the token.
 */
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const url = config?.url ?? '';

  const isRefreshable =
    error.response?.status === 401 &&
    config !== undefined &&
    !config.hasBeenRetried &&
    !AUTH_PATHS.some((path) => url.includes(path));

  if (!isRefreshable) throw error;

  config.hasBeenRetried = true;

  try {
    await refreshSession();
  } catch {
    // The refresh token is gone or was revoked: this is a real sign-out, and
    // the original 401 is the honest answer to give the caller.
    throw error;
  }

  return api(config);
});
