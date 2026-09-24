import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// The whole app is not started here: what this file owns is the URL it hands on.
const served: string[] = [];
const express = Object.assign((req: IncomingMessage) => void served.push(req.url ?? ''), { set: vi.fn() });
vi.mock('@nestjs/core', () => ({
  NestFactory: {
    create: vi.fn(async () => ({ getHttpAdapter: () => ({ getInstance: () => express }), init: vi.fn() })),
  },
}));
vi.mock('./app.module.js', () => ({ AppModule: class {} }));
vi.mock('./app.setup.js', () => ({ configureApp: vi.fn() }));

const { default: handler } = await import('./serverless.js');

const call = async (url: string) => {
  await handler({ url } as IncomingMessage, {} as ServerResponse);
  return served.at(-1);
};

describe('serverless handler', () => {
  beforeEach(() => void (served.length = 0));

  it.each([
    ['/api/auth/me', '/auth/me'],
    ['/api/webhooks/bank', '/webhooks/bank'],
    ['/api/notifications?limit=20', '/notifications?limit=20'],
    ['/api', '/'],
    ['/api?x=1', '/?x=1'],
  ])('hands %s to the app as %s', async (incoming, expected) => {
    expect(await call(incoming)).toBe(expected);
  });

  it('leaves a path that only starts with the letters "api" alone', async () => {
    expect(await call('/apiary')).toBe('/apiary');
  });

  it('trusts exactly one proxy hop, so req.ip is the visitor', async () => {
    await call('/api/auth/me');
    expect(express.set).toHaveBeenCalledWith('trust proxy', 1);
  });
});
