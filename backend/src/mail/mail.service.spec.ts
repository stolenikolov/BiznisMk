import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service.js';

let outboxDir: string | null = null;

/** A service with no SMTP server, so every message lands in a temp outbox. */
async function outboxService() {
  outboxDir = await mkdtemp(join(tmpdir(), 'biznismk-mail-'));
  const config = {
    getOrThrow: () => ({ port: 587, secure: false, from: 'BiznisMk Распоред <raspored@firma.mk>', outboxDir }),
  };
  return new MailService(config as unknown as ConfigService);
}

async function savedMessage(): Promise<string> {
  const [eml] = (await readdir(outboxDir!)).filter((name) => name.endsWith('.eml'));
  return readFile(join(outboxDir!, eml!), 'utf8');
}

const message = { to: 'ana@gmail.com', subject: 'Тест', text: 'Текст', html: '<p>Текст</p>' };

afterEach(async () => {
  if (outboxDir) await rm(outboxDir, { recursive: true, force: true });
  outboxDir = null;
});

describe('MailService', () => {
  it('sends as MAIL_FROM by default', async () => {
    const mail = await outboxService();

    await mail.send(message);

    expect(mail.mode).toBe('outbox');
    expect(await savedMessage()).toMatch(/^From: =\?UTF-8\?B\?[^?]+\?=\s+<raspored@firma\.mk>$/m);
  });

  it('shows a company as the sender while keeping MAIL_FROM’s address', async () => {
    const mail = await outboxService();

    await mail.send({ ...message, fromName: 'DevShop', replyTo: 'stole@devshop.mk' });

    const saved = await savedMessage();
    expect(saved).toMatch(/^From: DevShop <raspored@firma\.mk>$/m);
    expect(saved).toMatch(/^Reply-To: stole@devshop\.mk$/m);
  });

  it('reports each message that could not go, without stopping the rest', async () => {
    const mail = await outboxService();
    const send = vi.spyOn(mail, 'send').mockImplementation(async ({ to }) => {
      if (to === 'bounced@gmail.com') throw new Error('550 no such user');
    });

    const result = await mail.sendAll(['bounced@gmail.com', 'ana@gmail.com'], (to) => ({ ...message, to }));

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ mode: 'outbox', sent: ['ana@gmail.com'], failed: ['bounced@gmail.com'] });
  });
});
