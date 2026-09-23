import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';

/**
 * Everything the HTTP app needs beyond its modules: headers, cookies, CORS,
 * error mapping and validation. Shared by main.ts and the e2e tests, so the
 * tests exercise the same pipeline the real server runs.
 */
export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: configService.getOrThrow<string[]>('app.corsOrigins', { infer: true }),
    credentials: true,
  });
  // Database failures become conflicts/404s instead of a bare 500.
  app.useGlobalFilters(new PrismaExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
