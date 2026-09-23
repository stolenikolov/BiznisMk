import { randomInt, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Prisma } from '../src/generated/prisma/client.js';

/**
 * Marking an invoice paid moves money, and two clicks can race. Only the
 * database can prove that just one of them books it, so this runs against it.
 */

const DOMAIN = 'e2e.biznismk.test';
const PASSWORD = 'correct-horse-battery';

let app: INestApplication;
let prisma: PrismaService;
let email: string;
let companyId: string;
let accountId: string;
let agent: ReturnType<typeof request.agent>;

const digits = (length: number) => Array.from({ length }, () => randomInt(0, 10)).join('');

beforeEach(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  email = `settle-${randomUUID().slice(0, 8)}@${DOMAIN}`;
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: PASSWORD, firstName: 'Ана', lastName: 'Тест' })
    .expect(201);

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const company = await prisma.company.create({
    data: {
      name: 'Пекара Тест',
      embs: digits(7),
      edb: digits(13),
      legalForm: 'DOOEL',
      registeredAddress: 'Скопје',
      isVatPayer: false,
      memberships: { create: { userId: user.id, role: 'CEO' } },
    },
  });
  companyId = company.id;
  accountId = (
    await prisma.bankAccount.create({
      data: { companyId, bankName: 'Банка', iban: `MK07${digits(15)}`, balance: new Prisma.Decimal('1000') },
    })
  ).id;

  // With one company, signing in enters it.
  agent = request.agent(app.getHttpServer());
  await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
});

afterEach(async () => {
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { email } });
  await app.close();
});

function invoice(direction: 'OUTGOING' | 'INCOMING', total: string) {
  return prisma.invoice.create({
    data: {
      companyId,
      direction,
      invoiceNumber: `T-${randomUUID().slice(0, 6)}`,
      clientName: 'Клиент',
      clientAddress: 'Скопје',
      netAmount: new Prisma.Decimal(total),
      vatAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(total),
      vatApplied: false,
      status: 'SENT',
      issueDate: new Date(),
    },
  });
}

const markPaid = (invoiceId: string) => agent.patch(`/invoices/${invoiceId}/status`).send({ status: 'PAID' });

async function balance() {
  const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
  return account.balance.toFixed(2);
}

it('books a double-clicked "paid" once', async () => {
  const issued = await invoice('OUTGOING', '250');

  const answers = await Promise.all([markPaid(issued.id), markPaid(issued.id)]);

  // The loser gets 400 if it read the invoice after the winner committed, or
  // 409 if both read it first; either way it moves nothing.
  const statuses = answers.map((answer) => answer.status).sort();
  expect(statuses[0]).toBe(200);
  expect([400, 409]).toContain(statuses[1]);
  expect(await prisma.transaction.count({ where: { bankAccountId: accountId } })).toBe(1);
  expect(await balance()).toBe('1250.00');
});

it('moves no money when the invoice changed between being read and being paid', async () => {
  const issued = await invoice('OUTGOING', '250');

  // Another request pays it the moment this one has read it as SENT — the
  // exact interleaving a double click produces at worst.
  const findFirst = prisma.invoice.findFirst.bind(prisma.invoice);
  const spy = vi.spyOn(prisma.invoice, 'findFirst').mockImplementationOnce((async (args: never) => {
    const read = await findFirst(args);
    await prisma.invoice.update({ where: { id: issued.id }, data: { status: 'PAID' } });
    return read;
  }) as never);

  const answer = await markPaid(issued.id);
  spy.mockRestore();

  expect(answer.status).toBe(409);
  expect(answer.body).toMatchObject({ errorCode: 'INVOICE_CHANGED' });
  expect(await prisma.transaction.count({ where: { bankAccountId: accountId } })).toBe(0);
  expect(await balance()).toBe('1000.00');
});

it('never lets two bills spend the same money', async () => {
  const first = await invoice('INCOMING', '800');
  const second = await invoice('INCOMING', '800');

  const answers = await Promise.all([markPaid(first.id), markPaid(second.id)]);

  expect(answers.filter((answer) => answer.status === 200)).toHaveLength(1);
  expect(answers.filter((answer) => answer.status === 422)).toHaveLength(1);
  expect(await prisma.transaction.count({ where: { bankAccountId: accountId } })).toBe(1);
  expect(await balance()).toBe('200.00');
});
