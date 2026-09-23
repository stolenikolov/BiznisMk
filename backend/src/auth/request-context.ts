import type { Request } from 'express';
import type { RequestContext } from '../audit/audit.service.js';
import type { EmailLocale } from './two-factor/two-factor-emails.js';

export interface AuthRequestContext extends RequestContext {
  /** The language the person is using the app in, for the emails this request sends. */
  locale: EmailLocale;
}

/**
 * Who is asking, as far as the server can tell, and in which language. The
 * frontend sends its current language as Accept-Language, so an English
 * screen gets an English code email; anything else gets Macedonian, the
 * app's default.
 */
export function requestContext(req: Request): AuthRequestContext {
  const language = String(req.headers['accept-language'] ?? '').trim().toLowerCase();
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, 500),
    locale: language.startsWith('en') ? 'en' : 'mk',
  };
}
