-- Emails were stored exactly as typed, so an account registered as
-- Ana@example.com could never be found by someone logging in as
-- ana@example.com — Postgres compares strings case-sensitively.

-- Normalise what is already stored.
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");

-- Keep the invariant true from here on. The API lowercases on input, so this
-- should never fire; it exists so a future code path cannot quietly
-- reintroduce an unreachable account.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
