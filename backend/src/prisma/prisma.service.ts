import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * `?schema=` on DATABASE_URL picks the Postgres schema, the same parameter
 * `prisma migrate` reads — which is how the e2e tests run in a schema of
 * their own instead of the development data. The driver itself does not know
 * the parameter, so it is taken off the URL and handed to the adapter.
 */
export function splitSchema(databaseUrl: string): { connectionString: string; schema?: string } {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? undefined;
  url.searchParams.delete('schema');
  return { connectionString: url.toString(), schema };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const { connectionString, schema } = splitSchema(configService.getOrThrow<string>('DATABASE_URL'));
    const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
