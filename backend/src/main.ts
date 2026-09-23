import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  // `rawBody` keeps the untouched request bytes on the request object. The
  // bank signs its webhooks over exactly those bytes, and re-serialising the
  // parsed JSON would never reproduce them.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  const port = app.get(ConfigService).get<number>('app.port', { infer: true }) ?? 3000;
  await app.listen(port);
}
await bootstrap();
