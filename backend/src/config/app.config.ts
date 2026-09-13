import { registerAs } from '@nestjs/config';

/**
 * CORS_ORIGIN accepts a comma-separated list. Dev needs more than one entry:
 * Vite moves to 5174 when 5173 is taken, and localhost / 127.0.0.1 are
 * separate origins to a browser — a single fixed value silently turns every
 * request into a "Network Error" the moment the port shifts.
 */
function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
}));
