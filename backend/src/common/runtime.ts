/**
 * Running as Vercel functions (Vercel sets VERCEL=1). There the process lives
 * only while it answers a request: nothing can run on a timer, so scheduled
 * work arrives as Vercel Cron calls instead, and nothing may hold a socket open.
 */
export const ON_VERCEL = process.env.VERCEL === '1';
