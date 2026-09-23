import { useEffect, useState } from 'react';
import axios from 'axios';
import type { TFunction } from 'i18next';
import { api } from './api.ts';

/** A code was emailed; what the "enter the code" step needs. */
export interface ChallengeStarted {
  challengeId: string;
  /** "s***e@gmail.com" */
  maskedEmail: string;
  /** ISO time from which "send again" works. */
  resendAvailableAt: string;
}

/** /auth/login's answer when a password is not enough on its own. */
export interface TwoFactorRequired extends ChallengeStarted {
  requires2fa: true;
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
}

export interface TrustedDevice {
  id: string;
  userAgent: string;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  /** The browser this page runs in. */
  current: boolean;
}

export const CODE_LENGTH = 6;

/** Six empty boxes. */
export const emptyCode = (): string[] => Array.from({ length: CODE_LENGTH }, () => '');

export const twoFactorApi = {
  verify: (challengeId: string, code: string, rememberDevice: boolean) =>
    api.post('/auth/2fa/verify', { challengeId, code, rememberDevice }),
  resend: async (challengeId: string) =>
    (await api.post<ChallengeStarted>('/auth/2fa/resend', { challengeId })).data,
  status: async () => (await api.get<TwoFactorStatus>('/auth/2fa/status')).data,
  startEnable: async () => (await api.post<ChallengeStarted>('/auth/2fa/enable/start')).data,
  confirmEnable: async (code: string) => (await api.post<TwoFactorStatus>('/auth/2fa/enable/confirm', { code })).data,
  startDisable: async () => (await api.post<ChallengeStarted>('/auth/2fa/disable/start')).data,
  disable: async (password: string, code: string) =>
    (await api.post<TwoFactorStatus>('/auth/2fa/disable', { password, code })).data,
  devices: async () => (await api.get<{ devices: TrustedDevice[] }>('/auth/trusted-devices')).data.devices,
  revokeDevice: (id: string) => api.delete(`/auth/trusted-devices/${id}`),
  revokeAllDevices: () => api.delete('/auth/trusted-devices'),
};

export function isTwoFactorRequired(data: unknown): data is TwoFactorRequired {
  return typeof data === 'object' && data !== null && (data as { requires2fa?: unknown }).requires2fa === true;
}

/** The server's errorCode, when it sent one. */
export function errorCodeOf(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const code = error.response?.data?.errorCode;
  return typeof code === 'string' ? code : undefined;
}

/**
 * What went wrong with a code, in the reader's language: wrong (and how many
 * tries are left), expired, too many tries, asked for again too soon, the
 * password when one was needed, or plain rate limiting.
 */
export function twoFactorErrorMessage(t: TFunction, error: unknown): string {
  if (!axios.isAxiosError(error)) return t('twoFactor.errors.generic');
  const data = error.response?.data as { errorCode?: string; attemptsLeft?: number } | undefined;

  switch (data?.errorCode) {
    case 'TWO_FACTOR_CODE_INVALID':
      return t('twoFactor.errors.invalid', { count: data.attemptsLeft ?? 0 });
    case 'TWO_FACTOR_CODE_EXPIRED':
      return t('twoFactor.errors.expired');
    case 'TWO_FACTOR_TOO_MANY_ATTEMPTS':
      return t('twoFactor.errors.tooManyAttempts');
    case 'TWO_FACTOR_RESEND_TOO_SOON':
      return t('twoFactor.errors.resendTooSoon');
    case 'WRONG_PASSWORD':
      return t('twoFactor.errors.wrongPassword');
    case 'TWO_FACTOR_ALREADY_ENABLED':
    case 'TWO_FACTOR_NOT_ENABLED':
      return t('twoFactor.errors.stale');
    default:
      return error.response?.status === 429 ? t('twoFactor.errors.rateLimited') : t('twoFactor.errors.generic');
  }
}

/** Seconds until "send again" works; 0 once it does. Ticks every second. */
export function useSecondsUntil(iso: string | null): number {
  const left = () => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(left);

  useEffect(() => {
    const tick = () => setSeconds(iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000)) : 0);
    tick();
    if (!iso) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [iso]);

  return seconds;
}

/**
 * A browser and system in words, from the user-agent string the server kept:
 * "Chrome · Windows". Rough on purpose — enough to tell one's own devices apart.
 */
export function describeDevice(userAgent: string): { browser: string | null; os: string | null } {
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : null;
  const os =
    /Windows/.test(userAgent) ? 'Windows'
    : /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
    : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Linux/.test(userAgent) ? 'Linux'
    : null;
  return { browser, os };
}

// Dates are formatted in dates.ts, next to the date-only form the team page
// needs; re-exported here for the settings screens that already read it from
// this module.
export { formatDateTime } from './dates.ts';
