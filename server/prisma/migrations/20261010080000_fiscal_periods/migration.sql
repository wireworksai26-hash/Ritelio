BEGIN;

-- CreateEnum
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "fiscal_year_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balances" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "direction" "JournalDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_years_tenant_id_company_id_start_date_idx" ON "fiscal_years"("tenant_id", "company_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_company_id_name_key" ON "fiscal_years"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_tenant_id_company_id_id_key" ON "fiscal_years"("tenant_id", "company_id", "id");

-- CreateIndex
CREATE INDEX "fiscal_periods_tenant_id_company_id_start_date_end_date_sta_idx" ON "fiscal_periods"("tenant_id", "company_id", "start_date", "end_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_company_id_code_key" ON "fiscal_periods"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_tenant_id_company_id_id_key" ON "fiscal_periods"("tenant_id", "company_id", "id");

-- CreateIndex
CREATE INDEX "opening_balances_tenant_id_company_id_account_id_idx" ON "opening_balances"("tenant_id", "company_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_period_id_account_id_key" ON "opening_balances"("period_id", "account_id");

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_tenant_id_company_id_fiscal_year_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "fiscal_year_id") REFERENCES "fiscal_years"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_tenant_id_company_id_period_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "period_id") REFERENCES "fiscal_periods"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_tenant_id_company_id_account_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "account_id") REFERENCES "chart_of_accounts"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create a calendar year for every year represented in the ledger, plus the
-- current year for each company. Period end dates are exclusive boundaries.
WITH used_years AS (
  SELECT company."tenant_id", company."id" AS "company_id", EXTRACT(YEAR FROM header."entry_date")::integer AS "year_number"
  FROM "companies" AS company
  JOIN "journal_headers" AS header ON header."tenant_id" = company."tenant_id" AND header."company_id" = company."id"
  UNION
  SELECT company."tenant_id", company."id", EXTRACT(YEAR FROM entry."entry_date")::integer
  FROM "companies" AS company
  JOIN "financial_entries" AS entry ON entry."tenant_id" = company."tenant_id"
  UNION
  SELECT company."tenant_id", company."id", EXTRACT(YEAR FROM CURRENT_DATE)::integer
  FROM "companies" AS company
)
INSERT INTO "fiscal_years" (
  "id", "tenant_id", "company_id", "name", "start_date", "end_date", "is_closed", "created_at"
)
SELECT
  gen_random_uuid()::text,
  "tenant_id",
  "company_id",
  "year_number"::text,
  make_date("year_number", 1, 1),
  make_date("year_number" + 1, 1, 1),
  false,
  CURRENT_TIMESTAMP
FROM used_years
ON CONFLICT ("company_id", "name") DO NOTHING;

INSERT INTO "fiscal_periods" (
  "id", "tenant_id", "company_id", "fiscal_year_id", "code", "name",
  "start_date", "end_date", "status", "created_at"
)
SELECT
  gen_random_uuid()::text,
  year."tenant_id",
  year."company_id",
  year."id",
  year."name" || '-' || lpad(month."month_number"::text, 2, '0'),
  (ARRAY[
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ])[month."month_number"],
  make_date(year."name"::integer, month."month_number", 1),
  (make_date(year."name"::integer, month."month_number", 1) + INTERVAL '1 month')::date,
  'open',
  CURRENT_TIMESTAMP
FROM "fiscal_years" AS year
CROSS JOIN generate_series(1, 12) AS month("month_number")
ON CONFLICT ("company_id", "code") DO NOTHING;

UPDATE "journal_headers" AS header
SET "period_id" = period."id"
FROM "fiscal_periods" AS period
WHERE header."period_id" IS NULL
  AND header."tenant_id" = period."tenant_id"
  AND header."company_id" = period."company_id"
  AND header."entry_date" >= period."start_date"
  AND header."entry_date" < period."end_date";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "journal_headers" WHERE "period_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot require journal period: an entry date is outside generated fiscal calendars';
  END IF;
END $$;

ALTER TABLE "journal_headers" ALTER COLUMN "period_id" SET NOT NULL;
ALTER TABLE "journal_headers"
  ADD CONSTRAINT "journal_headers_tenant_id_company_id_period_id_fkey"
  FOREIGN KEY ("tenant_id", "company_id", "period_id")
  REFERENCES "fiscal_periods"("tenant_id", "company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
