import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * The app as one Vercel function (api/index.mjs at the repo root).
 *
 * Built once per warm instance and reused by every request it serves. A start
 * that fails is not cached, so the next request tries again.
 */
let listener: Promise<RequestListener> | null = null;

async function start(): Promise<RequestListener> {
  // Same options as main.ts: the bank signs its webhooks over the raw bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  const express = app.getHttpAdapter().getInstance();
  // Vercel's proxy sits in front: req.ip must be the visitor, not the proxy,
  // or every visitor would share one rate-limit bucket and one audit-log IP.
  express.set('trust proxy', 1);

  await app.init();
  return express as RequestListener;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  listener ??= start().catch((error: unknown) => {
    listener = null;
    throw error;
  });
  const serve = await listener;

  // The site serves the API under /api (same origin as the frontend, so the
  // session cookies are first-party); the app's own routes have no prefix.
  const path = (req.url ?? '/').replace(/^\/api(?=\/|\?|$)/, '');
  req.url = path.startsWith('/') ? path : `/${path}`;
  serve(req, res);
}
