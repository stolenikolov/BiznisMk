import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Security events worth a permanent record. Short, stable codes: they are
 * what someone searches the table by, long after the wording in the UI moved.
 */
export const AuditAction = {
  TWO_FACTOR_ENABLED: 'TWO_FACTOR_ENABLED',
  TWO_FACTOR_DISABLED: 'TWO_FACTOR_DISABLED',
  /** A code was guessed wrong the maximum number of times; the challenge died. */
  TWO_FACTOR_ATTEMPTS_EXCEEDED: 'TWO_FACTOR_ATTEMPTS_EXCEEDED',
  TRUSTED_DEVICE_ADDED: 'TRUSTED_DEVICE_ADDED',
  TRUSTED_DEVICE_REVOKED: 'TRUSTED_DEVICE_REVOKED',
  /** Too many wrong passwords in a row; sign-in refused for a while. */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Where a request came from, as far as the server can tell. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface AuditEntry extends RequestContext {
  userId: string | null;
  action: AuditAction;
  /** Ids, counts and reasons — never a code, a token or a password. */
  metadata?: Prisma.InputJsonObject;
}

/**
 * Append-only account history. Recording never fails the action it records:
 * the user has already done the thing, and refusing it because the log is
 * unavailable would only make them try again.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          metadata: entry.metadata,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`Could not record ${entry.action} for ${entry.userId ?? 'unknown user'}: ${String(error)}`);
    }
  }
}
