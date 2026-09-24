import { waitUntil } from '@vercel/functions';

/**
 * Work that finishes after the response has gone out — an email the reply must
 * not wait for. On Vercel the function is frozen the moment it answers, and
 * this is what keeps it alive until the work is done; anywhere else the work
 * simply runs on its own.
 */
export function inBackground(work: Promise<unknown>): void {
  waitUntil(work);
}
