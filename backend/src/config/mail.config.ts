import { registerAs } from '@nestjs/config';

/**
 * Outgoing email. With no SMTP_HOST the app still runs: messages are written
 * to a local outbox folder instead of being sent, which is what development
 * wants and what env validation refuses in production.
 */
export default registerAs('mail', () => ({
  host: process.env.SMTP_HOST || undefined,
  port: parseInt(process.env.SMTP_PORT ?? '587', 10),
  /** true for port 465 (TLS from the start); false for 587, which upgrades with STARTTLS. */
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || undefined,
  pass: process.env.SMTP_PASS || undefined,
  /** e.g. "BiznisMk <raspored@firma.mk>". Most providers only accept their own verified sender. */
  from: process.env.MAIL_FROM ?? 'BiznisMk <no-reply@biznismk.local>',
  outboxDir: process.env.MAIL_OUTBOX_DIR ?? '.mail-outbox',
}));
