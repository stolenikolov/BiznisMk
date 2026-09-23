import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /**
   * The name shown as the sender, e.g. the company writing to its team. The
   * address stays MAIL_FROM's: that is the mailbox the server may send as.
   */
  fromName?: string;
}

/**
 * How messages leave the app. `outbox` means no mail server is configured and
 * every message was written to a local folder instead: nobody received it.
 */
export type MailMode = 'smtp' | 'outbox';

export interface MailBatchResult<T> {
  mode: MailMode;
  sent: T[];
  failed: T[];
}

interface MailSettings {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  outboxDir: string;
}

/**
 * The one door email goes out through.
 *
 * With SMTP configured it sends through a small connection pool, with short
 * timeouts so an unreachable server fails a publish in seconds rather than
 * the two minutes nodemailer waits by default. Without it, each message is
 * rendered exactly as it would be sent and saved as an .eml file (plus an
 * .html copy for a quick look in a browser), so the feature can be worked on
 * without a mail account.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly settings: MailSettings;
  private readonly transport: Transporter;
  /** MAIL_FROM without its display name: "raspored@firma.mk". */
  readonly fromAddress: string;
  readonly mode: MailMode;

  constructor(config: ConfigService) {
    this.settings = config.getOrThrow<MailSettings>('mail');
    this.fromAddress = /<([^<>]+)>\s*$/.exec(this.settings.from)?.[1] ?? this.settings.from.trim();

    if (this.settings.host) {
      this.mode = 'smtp';
      this.transport = createTransport({
        host: this.settings.host,
        port: this.settings.port,
        secure: this.settings.secure,
        auth: this.settings.user ? { user: this.settings.user, pass: this.settings.pass } : undefined,
        pool: true,
        maxConnections: 3,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    } else {
      this.mode = 'outbox';
      this.transport = createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
      this.logger.warn(
        `SMTP_HOST is not set: emails are saved to ${resolve(this.settings.outboxDir)} instead of being sent`,
      );
    }
  }

  onModuleDestroy(): void {
    this.transport.close();
  }

  async send(message: MailMessage): Promise<void> {
    const info = await this.transport.sendMail({
      from: message.fromName ? { name: message.fromName, address: this.fromAddress } : this.settings.from,
      to: message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (this.mode === 'outbox') {
      await this.saveToOutbox(message, info.message as Buffer);
    }
  }

  /**
   * Sends every message and reports which went and which did not. One bad
   * address never stops the rest, and nothing here throws: by the time a
   * batch goes out, whatever prompted it has already happened.
   */
  async sendAll<T>(items: readonly T[], compose: (item: T) => MailMessage): Promise<MailBatchResult<T>> {
    const messages = items.map(compose);
    const outcomes = await Promise.allSettled(messages.map((message) => this.send(message)));
    const result: MailBatchResult<T> = { mode: this.mode, sent: [], failed: [] };

    outcomes.forEach((outcome, index) => {
      const item = items[index]!;
      if (outcome.status === 'fulfilled') {
        result.sent.push(item);
      } else {
        result.failed.push(item);
        this.logger.error(`Could not send "${messages[index]!.subject}": ${String(outcome.reason)}`);
      }
    });

    return result;
  }

  private async saveToOutbox(message: MailMessage, raw: Buffer): Promise<void> {
    const dir = resolve(this.settings.outboxDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${stamp}-${message.to.replace(/[^a-z0-9@._-]/gi, '_')}`;

    await mkdir(dir, { recursive: true });
    await Promise.all([
      writeFile(join(dir, `${name}.eml`), raw),
      writeFile(join(dir, `${name}.html`), message.html, 'utf8'),
    ]);
  }
}
