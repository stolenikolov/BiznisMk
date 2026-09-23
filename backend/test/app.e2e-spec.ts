import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

/**
 * The app boots with its real pipeline, and every route is behind sign-in
 * unless it says otherwise — the root included.
 */
describe('App (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('refuses an anonymous request to a route that is not public', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });

  it('answers a public route without a session', () => {
    // Always the same answer whether or not the address exists.
    return request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'nobody@e2e.biznismk.test' })
      .expect(200, { success: true });
  });

  afterEach(async () => {
    await app.close();
  });
});
