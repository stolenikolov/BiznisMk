import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MailService, type MailMessage } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Email two-factor end to end: real HTTP through the real pipeline (guards,
 * validation, cookies, throttling) into a real database — the e2e schema —
 * with only the mail server swapped for one that keeps what it would send.
 */

const DOMAIN = 'e2e.biznismk.test';
const PASSWORD = 'correct-horse-battery';

let app: INestApplication;
let prisma: PrismaService;
let outbox: MailMessage[];
/** Accounts a test made; removed after it, and everything of theirs by cascade. */
let created: string[];

const mail = {
  mode: 'smtp' as const,
  fromAddress: `noreply@${DOMAIN}`,
  send: async (message: MailMessage) => void outbox.push(message),
  sendAll: async <T>(items: readonly T[], compose: (item: T) => MailMessage) => {
    outbox.push(...items.map(compose));
    return { mode: 'smtp' as const, sent: [...items], failed: [] as T[] };
  },
  onModuleDestroy: () => undefined,
};

// A fresh app per test also means fresh rate-limit counters: each test signs
// in a few times from the same address, and the limits are per minute.
beforeEach(async () => {
  outbox = [];
  created = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
});

afterEach(async () => {
  // Audit rows stay, detached from the deleted user, as they would in production.
  await prisma.user.deleteMany({ where: { email: { in: created } } });
  await app.close();
});

// Helpers ---------------------------------------------------------------------------------

/** A browser: keeps its cookies between requests, like the real one. */
const browser = () => request.agent(app.getHttpServer());

async function newUser(options: { twoFactor?: boolean } = {}) {
  const email = `user-${randomUUID().slice(0, 8)}@${DOMAIN}`;
  created.push(email);
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: PASSWORD, firstName: 'Ана', lastName: 'Тест' })
    .expect(201);
  if (options.twoFactor) {
    await prisma.user.update({ where: { email }, data: { twoFactorEnabled: true, twoFactorEnabledAt: new Date() } });
  }
  return email;
}

/** The code in the newest email to an address. */
function lastCode(email: string): string {
  const message = outbox.filter((sent) => sent.to === email).at(-1);
  if (!message) throw new Error(`No email was sent to ${email}`);
  return /\b(\d{6})\b/.exec(message.text)![1]!;
}

const other = (code: string) => (code === '000000' ? '111111' : '000000');

function cookieNames(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return (header ?? []).map((cookie) => cookie.split('=')[0]!);
}

async function startSignIn(agent: ReturnType<typeof browser>, email: string) {
  const response = await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
  return response;
}

// Tests -----------------------------------------------------------------------------------

describe('Sign-in without two-factor', () => {
  it('opens a session straight away, as before', async () => {
    const email = await newUser();
    const agent = browser();

    const response = await startSignIn(agent, email);

    expect(response.body.user.email).toBe(email);
    expect(response.body.requires2fa).toBeUndefined();
    expect(cookieNames(response)).toEqual(expect.arrayContaining(['access_token', 'refresh_token']));
    await agent.get('/auth/me').expect(200);
  });
});

describe('Sign-in with two-factor', () => {
  it('opens no session until the emailed code is entered', async () => {
    const email = await newUser({ twoFactor: true });
    const agent = browser();

    const response = await startSignIn(agent, email);

    expect(response.body).toEqual({
      requires2fa: true,
      challengeId: expect.any(String),
      maskedEmail: expect.stringMatching(/^u\*\*\*.@e2e\.biznismk\.test$/),
      resendAvailableAt: expect.any(String),
    });
    expect(cookieNames(response)).not.toContain('access_token');
    await agent.get('/auth/me').expect(401);

    const verified = await agent
      .post('/auth/2fa/verify')
      .send({ challengeId: response.body.challengeId, code: lastCode(email) })
      .expect(200);

    expect(verified.body.user.email).toBe(email);
    expect(cookieNames(verified)).toEqual(expect.arrayContaining(['access_token', 'refresh_token']));
    await agent.get('/auth/me').expect(200);
  });

  it('refuses a wrong code and says how many tries are left', async () => {
    const email = await newUser({ twoFactor: true });
    const agent = browser();
    const { body } = await startSignIn(agent, email);

    const response = await agent
      .post('/auth/2fa/verify')
      .send({ challengeId: body.challengeId, code: other(lastCode(email)) })
      .expect(400);

    expect(response.body).toMatchObject({ errorCode: 'TWO_FACTOR_CODE_INVALID', attemptsLeft: 4 });
    expect(cookieNames(response)).not.toContain('access_token');
  });

  it('refuses the right code once it has expired', async () => {
    const email = await newUser({ twoFactor: true });
    const agent = browser();
    const { body } = await startSignIn(agent, email);
    await prisma.twoFactorChallenge.update({
      where: { id: body.challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await agent
      .post('/auth/2fa/verify')
      .send({ challengeId: body.challengeId, code: lastCode(email) })
      .expect(400);

    expect(response.body.errorCode).toBe('TWO_FACTOR_CODE_EXPIRED');
  });

  it('kills the challenge after five wrong codes, even for the right one, and records it', async () => {
    const email = await newUser({ twoFactor: true });
    const agent = browser();
    const { body } = await startSignIn(agent, email);
    const code = lastCode(email);

    for (let attempt = 1; attempt <= 4; attempt++) {
      const wrong = await agent.post('/auth/2fa/verify').send({ challengeId: body.challengeId, code: other(code) });
      expect(wrong.body).toMatchObject({ errorCode: 'TWO_FACTOR_CODE_INVALID', attemptsLeft: 5 - attempt });
    }
    const fifth = await agent
      .post('/auth/2fa/verify')
      .send({ challengeId: body.challengeId, code: other(code) })
      .expect(400);
    expect(fifth.body.errorCode).toBe('TWO_FACTOR_TOO_MANY_ATTEMPTS');

    const right = await agent.post('/auth/2fa/verify').send({ challengeId: body.challengeId, code }).expect(400);
    expect(right.body.errorCode).toBe('TWO_FACTOR_TOO_MANY_ATTEMPTS');

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const logged = await prisma.auditLog.findMany({ where: { userId: user.id, action: 'TWO_FACTOR_ATTEMPTS_EXCEEDED' } });
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged)).not.toContain(code);
  });

  it('holds a new code back for a minute', async () => {
    const email = await newUser({ twoFactor: true });
    const agent = browser();
    const { body } = await startSignIn(agent, email);

    const response = await agent.post('/auth/2fa/resend').send({ challengeId: body.challengeId }).expect(429);
    expect(response.body.errorCode).toBe('TWO_FACTOR_RESEND_TOO_SOON');
  });
});

describe('Trusted devices', () => {
  async function signInRemembered(agent: ReturnType<typeof browser>, email: string) {
    const { body } = await startSignIn(agent, email);
    const verified = await agent
      .post('/auth/2fa/verify')
      .send({ challengeId: body.challengeId, code: lastCode(email), rememberDevice: true })
      .expect(200);
    expect(cookieNames(verified)).toContain('trusted_device');
  }

  it('lets a remembered browser sign in without a code', async () => {
    const email = await newUser({ twoFactor: true });
    const agent = browser();
    await signInRemembered(agent, email);
    await agent.post('/auth/logout').expect(200);
    const sentBefore = outbox.length;

    const again = await startSignIn(agent, email);

    expect(again.body.user.email).toBe(email);
    expect(outbox).toHaveLength(sentBefore);

    // Another browser is not trusted by that cookie.
    const stranger = await startSignIn(browser(), email);
    expect(stranger.body.requires2fa).toBe(true);
  });

  it('asks for the code again once the device is revoked', async () => {
    const email = await newUser({ twoFactor: true });
    const agent = browser();
    await signInRemembered(agent, email);

    const { body } = await agent.get('/auth/trusted-devices').expect(200);
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]).toMatchObject({ current: true });
    await agent.delete(`/auth/trusted-devices/${body.devices[0].id}`).expect(204);
    await agent.post('/auth/logout').expect(200);

    const again = await startSignIn(agent, email);
    expect(again.body.requires2fa).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const actions = (await prisma.auditLog.findMany({ where: { userId: user.id } })).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['TRUSTED_DEVICE_ADDED', 'TRUSTED_DEVICE_REVOKED']));
  });

  it('forgets every device when the password changes', async () => {
    const email = await newUser({ twoFactor: true });
    const agent = browser();
    await signInRemembered(agent, email);

    await agent
      .patch('/auth/me')
      .send({ firstName: 'Ана', lastName: 'Тест', email, password: 'a-brand-new-password' })
      .expect(200);

    expect(await prisma.trustedDevice.count({ where: { user: { email } } })).toBe(0);
  });
});

describe('Switching two-factor on and off', () => {
  it('turns on with an emailed code, then off with the password and a code', async () => {
    const email = await newUser();
    const agent = browser();
    await startSignIn(agent, email);

    // On.
    const started = await agent.post('/auth/2fa/enable/start').expect(200);
    expect(started.body.maskedEmail).toMatch(/@e2e\.biznismk\.test$/);
    await agent.post('/auth/2fa/enable/confirm').send({ code: other(lastCode(email)) }).expect(400);
    await agent.post('/auth/2fa/enable/confirm').send({ code: lastCode(email) }).expect(200);
    expect((await agent.get('/auth/2fa/status').expect(200)).body.enabled).toBe(true);
    expect(outbox.some((sent) => sent.to === email && sent.subject === 'Двостепената заштита е вклучена')).toBe(true);

    // Signing in elsewhere now asks for a code.
    expect((await startSignIn(browser(), email)).body.requires2fa).toBe(true);

    // Off: the password alone is not enough, and neither is the code alone.
    await agent.post('/auth/2fa/disable/start').expect(200);
    const code = lastCode(email);
    const wrongPassword = await agent.post('/auth/2fa/disable').send({ password: 'not-it', code }).expect(403);
    expect(wrongPassword.body.errorCode).toBe('WRONG_PASSWORD');
    await agent.post('/auth/2fa/disable').send({ password: PASSWORD, code }).expect(200);
    expect((await agent.get('/auth/2fa/status').expect(200)).body.enabled).toBe(false);

    // And signing in is back to the password alone.
    expect((await startSignIn(browser(), email)).body.user.email).toBe(email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const actions = (await prisma.auditLog.findMany({ where: { userId: user.id } })).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED']));
  });

  it('needs a signed-in session for every settings endpoint', async () => {
    const anonymous = browser();
    await anonymous.get('/auth/2fa/status').expect(401);
    await anonymous.post('/auth/2fa/enable/start').expect(401);
    await anonymous.get('/auth/trusted-devices').expect(401);
  });
});
