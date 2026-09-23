import { describe, expect, it } from 'vitest';
import { envValidationSchema } from './env.validation.js';

const BASE = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://app:secret@localhost:5433/biznismk',
  CORS_ORIGIN: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  TWO_FACTOR_SECRET: 'c'.repeat(32),
};

/** Everything production asks for, so each test can break exactly one thing. */
const PRODUCTION = {
  ...BASE,
  NODE_ENV: 'production',
  SMTP_HOST: 'smtp.gmail.com',
  MAIL_FROM: 'Firma <raspored@firma.mk>',
  COOKIE_SECURE: 'true',
};

const errorOf = (env: Record<string, string>) => envValidationSchema.validate(env).error?.message;

describe('envValidationSchema — mail', () => {
  it('boots development with no mail server at all', () => {
    expect(errorOf(BASE)).toBeUndefined();
  });

  it('refuses production without a mail server', () => {
    const { SMTP_HOST: _host, MAIL_FROM: _from, ...withoutMail } = PRODUCTION;
    expect(errorOf(withoutMail)).toMatch(/SMTP_HOST/);
  });

  it('accepts production with a server and a sender', () => {
    expect(errorOf(PRODUCTION)).toBeUndefined();
  });

  it('wants a sender whenever a server is named', () => {
    expect(errorOf({ ...BASE, SMTP_HOST: 'smtp.gmail.com' })).toMatch(/MAIL_FROM/);
  });

  it('wants a user and a password together or not at all', () => {
    expect(errorOf({ ...BASE, SMTP_USER: 'raspored@firma.mk' })).toMatch(/SMTP_PASS/);
  });
});

describe('envValidationSchema — production safety', () => {
  it('requires NODE_ENV rather than assuming development', () => {
    const { NODE_ENV: _env, ...withoutEnv } = BASE;
    expect(errorOf(withoutEnv)).toMatch(/NODE_ENV/);
  });

  it('requires the two-factor secret', () => {
    const { TWO_FACTOR_SECRET: _secret, ...withoutSecret } = BASE;
    expect(errorOf(withoutSecret)).toMatch(/TWO_FACTOR_SECRET/);
  });

  it('refuses production cookies that may travel over plain HTTP', () => {
    expect(errorOf({ ...PRODUCTION, COOKIE_SECURE: 'false' })).toMatch(/COOKIE_SECURE/);
    const { COOKIE_SECURE: _cookie, ...unset } = PRODUCTION;
    expect(errorOf(unset)).toMatch(/COOKIE_SECURE/);
  });

  it.each([
    ['JWT_ACCESS_SECRET', 'change-me-access-secret'],
    ['JWT_REFRESH_SECRET', 'change-me-refresh-secret'],
    ['TWO_FACTOR_SECRET', 'change-me-two-factor-secret'],
    ['BANK_WEBHOOK_SIGNING_SECRET', 'dev-webhook-secret'],
  ])('refuses the example %s in production', (name, value) => {
    expect(errorOf({ ...PRODUCTION, [name]: value })).toMatch(new RegExp(`${name}.*example`));
  });

  it('refuses the example bank API key in production', () => {
    expect(
      errorOf({ ...PRODUCTION, BANK_API_URL: 'https://bank.example', BANK_API_KEY: 'dev-mock-bank-key' }),
    ).toMatch(/BANK_API_KEY.*example/);
  });

  it('refuses short secrets in production but not in development', () => {
    const short = { JWT_ACCESS_SECRET: 'x'.repeat(20) };
    expect(errorOf({ ...PRODUCTION, ...short })).toMatch(/JWT_ACCESS_SECRET.*32/);
    expect(errorOf({ ...BASE, ...short })).toBeUndefined();
  });

  it('refuses one value reused for two secrets in production', () => {
    expect(errorOf({ ...PRODUCTION, JWT_REFRESH_SECRET: PRODUCTION.JWT_ACCESS_SECRET })).toMatch(
      /JWT_REFRESH_SECRET.*JWT_ACCESS_SECRET/,
    );
    expect(errorOf({ ...PRODUCTION, TWO_FACTOR_SECRET: PRODUCTION.JWT_ACCESS_SECRET })).toMatch(
      /TWO_FACTOR_SECRET.*JWT_ACCESS_SECRET/,
    );
  });
});
