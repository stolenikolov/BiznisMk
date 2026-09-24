import { registerAs } from '@nestjs/config';

/**
 * CORS_ORIGIN accepts a comma-separated list. Dev needs more than one entry:
 * Vite moves to 5174 when 5173 is taken, and localhost / 127.0.0.1 are
 * separate origins to a browser — a single fixed value silently turns every
 * request into a "Network Error" the moment the port shifts.
 *
 * Exported because the websocket gateway needs the same list: its CORS is
 * negotiated by socket.io rather than by the Express middleware, and two
 * separately parsed origin lists would drift.
 */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV,
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  /**
   * Where the frontend lives, for links in emails ("set a new password").
   * Defaults to the first allowed origin, which in development is the app.
   */
  appUrl: (process.env.APP_URL ?? parseOrigins(process.env.CORS_ORIGIN)[0]!).replace(/\/+$/, ''),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  /** Keys the stored hashes of emailed two-factor codes; kept apart from the JWT secrets. */
  twoFactorSecret: process.env.TWO_FACTOR_SECRET,
  /** What Vercel Cron sends as its bearer token; the /cron endpoints refuse everyone without it. */
  cronSecret: process.env.CRON_SECRET,
  /**
   * Shared with the bank, which signs every webhook with it. Must equal the
   * bank's own WEBHOOK_SIGNING_SECRET. Left undefined the webhook endpoint
   * refuses everything rather than trusting unsigned callers.
   */
  bankWebhookSecret: process.env.BANK_WEBHOOK_SIGNING_SECRET,
  /**
   * The bank's own API — the outbound half of the integration, used to pay
   * salaries. Unset, payroll says so rather than offering a button that
   * cannot work; receiving webhooks does not depend on it.
   */
  bankApiUrl: process.env.BANK_API_URL,
  bankApiKey: process.env.BANK_API_KEY,
}));
