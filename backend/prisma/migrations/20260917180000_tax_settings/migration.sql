-- Payroll tax parameters, one row per country and year, so next year's
-- personal allowance is an INSERT rather than a code change.

-- CreateTable
CREATE TABLE "tax_settings" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'MK',
    "year" INTEGER NOT NULL,
    "personal_allowance_monthly" DECIMAL(12,2) NOT NULL,
    "income_tax_rate" DECIMAL(5,2) NOT NULL,
    "contributions_rate" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_settings_pkey" PRIMARY KEY ("id"),
    -- A typo here silently misprices every salary in the company, so the
    -- obviously impossible values are refused at the source.
    CONSTRAINT "tax_settings_allowance_non_negative" CHECK ("personal_allowance_monthly" >= 0),
    CONSTRAINT "tax_settings_income_tax_rate_percent" CHECK ("income_tax_rate" >= 0 AND "income_tax_rate" <= 100),
    CONSTRAINT "tax_settings_contributions_rate_percent" CHECK ("contributions_rate" >= 0 AND "contributions_rate" <= 100),
    CONSTRAINT "tax_settings_year_plausible" CHECK ("year" BETWEEN 2000 AND 2100)
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_settings_country_year_key" ON "tax_settings"("country", "year");

-- North Macedonia.
--   Personal allowance: UJP, "Лично ослободување" — 10,270.00 MKD a month for
--   2025 (123,240.00 a year) and 10,932.00 for 2026 (131,184.00 a year).
--   Income tax: flat 10% on employment income since 1 January 2023.
--   Contributions: 28% of gross in total. From July to December 2026 the law
--   moves 1.1 points from unemployment to pension insurance; the total, and so
--   the net salary, does not change.
-- To add a year:
--   INSERT INTO "tax_settings" ("id", "country", "year", "personal_allowance_monthly",
--     "income_tax_rate", "contributions_rate", "updatedAt")
--   VALUES (gen_random_uuid()::text, 'MK', 2027, <allowance>, 10.00, 28.00, now());
INSERT INTO "tax_settings"
  ("id", "country", "year", "personal_allowance_monthly", "income_tax_rate", "contributions_rate", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'MK', 2025, 10270.00, 10.00, 28.00, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MK', 2026, 10932.00, 10.00, 28.00, CURRENT_TIMESTAMP);
