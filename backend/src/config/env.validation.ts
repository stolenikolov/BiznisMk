import Joi from 'joi';

/**
 * The values .env.example ships with. They are public — anyone who has read
 * the repository knows them — so production refuses to start with any of them:
 * a server signing tokens with "change-me-access-secret" lets anyone forge a
 * session for any user.
 */
const EXAMPLE_VALUES = new Set([
  'change-me-access-secret',
  'change-me-refresh-secret',
  'change-me-two-factor-secret',
  'dev-webhook-secret',
  'dev-mock-bank-key',
]);

/** Secrets this server chooses itself, and so can make long: at least an HMAC-SHA256 key's worth. */
const OWN_SECRETS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'TWO_FACTOR_SECRET', 'BANK_WEBHOOK_SIGNING_SECRET'] as const;
const PRODUCTION_SECRET_MIN_LENGTH = 32;

type ValidatedEnv = Partial<Record<(typeof OWN_SECRETS)[number] | 'BANK_API_KEY' | 'SMTP_HOST', string>> & {
  NODE_ENV: string;
  COOKIE_SECURE: boolean;
};

/** The first reason a production server must not start with this environment, or null. */
function productionProblem(env: ValidatedEnv): string | null {
  // Production must actually send; the local outbox is for development.
  if (!env.SMTP_HOST) return '"SMTP_HOST" is required in production';
  if (env.COOKIE_SECURE !== true) {
    return '"COOKIE_SECURE" must be true in production, so session cookies never travel over plain HTTP';
  }

  for (const name of [...OWN_SECRETS, 'BANK_API_KEY'] as const) {
    if (env[name] !== undefined && EXAMPLE_VALUES.has(env[name])) {
      return `"${name}" still has the example value from .env.example`;
    }
  }
  for (const name of OWN_SECRETS) {
    const value = env[name];
    if (value !== undefined && value.length < PRODUCTION_SECRET_MIN_LENGTH) {
      return `"${name}" must be at least ${PRODUCTION_SECRET_MIN_LENGTH} characters in production`;
    }
  }

  // One leaked value must not unlock two things.
  const seen = new Map<string, string>();
  for (const name of OWN_SECRETS) {
    const value = env[name];
    if (value === undefined) continue;
    const earlier = seen.get(value);
    if (earlier) return `"${name}" must differ from "${earlier}"`;
    seen.set(value, name);
  }
  return null;
}

export const envValidationSchema = Joi.object({
  // No default: a server that forgot to say it is production must not quietly
  // run as development, where codes are logged and cookies go over HTTP.
  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  CORS_ORIGIN: Joi.string().required(),
  // The frontend's address, for links in emails. Defaults to the first CORS origin.
  APP_URL: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  // Keys the stored hashes of emailed two-factor codes.
  TWO_FACTOR_SECRET: Joi.string().min(16).required(),

  COOKIE_SECURE: Joi.boolean().default(false),

  // Shared with the mock bank, which signs its webhooks with it. Optional so
  // an install that has not connected a bank still boots; without it the
  // webhook endpoint refuses every request rather than accepting unsigned
  // ones. 16 characters is the same floor the JWT secrets get.
  BANK_WEBHOOK_SIGNING_SECRET: Joi.string().min(16).optional(),

  // The bank's own API, for paying salaries. Optional as a pair: an install
  // with no bank still boots and still receives webhooks, it just cannot
  // start a payroll run.
  BANK_API_URL: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
  BANK_API_KEY: Joi.string().optional(),

  // Outgoing email (published schedules). Without SMTP_HOST, development
  // writes messages to MAIL_OUTBOX_DIR instead of sending them.
  SMTP_HOST: Joi.string().hostname().optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  MAIL_FROM: Joi.string().optional(),
  MAIL_OUTBOX_DIR: Joi.string().optional(),
})
  // Credentials come as a pair, and a server needs an address to send as.
  .and('SMTP_USER', 'SMTP_PASS')
  // An address with no key, or a key with no address, reaches no bank.
  .and('BANK_API_URL', 'BANK_API_KEY')
  .with('SMTP_HOST', 'MAIL_FROM')
  .custom((env: ValidatedEnv, helpers) => {
    const problem = env.NODE_ENV === 'production' ? productionProblem(env) : null;
    return problem ? helpers.message({ custom: problem }) : env;
  });
