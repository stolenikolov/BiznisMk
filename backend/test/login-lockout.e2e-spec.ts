import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MailService, type MailMessage } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MAX_FAILED_LOGINS } from '../src/auth/auth.service.js';

/**
 * Wrong passwords in a row lock an account, against the real database: the
 * count and the lock are conditional updates, which only Postgres can prove.
 */

const DOMAIN = 'e2e.biznismk.test';
const PASSWORD = 'correct-horse-battery';

let app: INestApplication;
let prisma: PrismaService;
let outbox: MailMessage[];
let email: string;

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

beforeEach(async () => {
  outbox = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  email = `lockout-${randomUUID().slice(0, 8)}@${DOMAIN}`;
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: PASSWORD, firstName: 'Ана', lastName: 'Тест' })
    .expect(201);
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await app.close();
});

const login = (password: string) => request(app.getHttpServer()).post('/auth/login').send({ email, password });

it('locks after five wrong passwords in a row, refuses the right one, and a reset unlocks it', async () => {
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) await login('wrong-password-guess').expect(401);

  const locked = await login('wrong-password-guess').expect(423);
  expect(locked.body).toMatchObject({ errorCode: 'ACCOUNT_LOCKED' });
  expect(new Date(locked.body.lockedUntil).getTime()).toBeGreaterThan(Date.now());

  // The right password does not get through while it is locked.
  await login(PASSWORD).expect(423);

  const notices = outbox.filter((sent) => sent.to === email);
  expect(notices).toHaveLength(1);
  expect(notices[0]!.subject).toMatch(/заклучена/);

  // A new password through the emailed link lifts the lock at once.
  await request(app.getHttpServer()).post('/auth/forgot-password').send({ email }).expect(200);
  const link = outbox.filter((sent) => sent.to === email).at(-1)!.text;
  const token = /reset-password\?token=([\w-]+)/.exec(link)![1]!;
  await request(app.getHttpServer())
    .post('/auth/reset-password')
    .send({ token, password: 'a-brand-new-password' })
    .expect(200);

  await login('a-brand-new-password').expect(200);
});

it('starts the count again after a successful sign-in', async () => {
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) await login('wrong-password-guess').expect(401);
  await login(PASSWORD).expect(200);

  await login('wrong-password-guess').expect(401);
  const row = await prisma.user.findUniqueOrThrow({ where: { email } });
  expect(row).toMatchObject({ failedLoginCount: 1, lockedUntil: null });
});
