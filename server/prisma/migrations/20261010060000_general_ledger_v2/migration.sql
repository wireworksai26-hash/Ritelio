BEGIN;

-- Assign legacy chart-of-account rows to the tenant's MAIN company. Abort rather
-- than leave an account without a company when its tenant lacks the backfill.
ALTER TABLE "chart_of_accounts"
  ADD COLUMN "company_id" TEXT,
  ADD COLUMN "parent_id" TEXT;

UPDATE "chart_of_accounts" AS account
SET "company_id" = company."id"
FROM "companies" AS company
WHERE company."tenant_id" = account."tenant_id"
  AND company."code" = 'MAIN';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "chart_of_accounts" WHERE "company_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot scope chart_of_accounts: a tenant has no MAIN company';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "financial_entries" AS entry
    LEFT JOIN "chart_of_accounts" AS debit
      ON debit."id" = entry."debit_account_id"
     AND debit."tenant_id" = entry."tenant_id"
    LEFT JOIN "chart_of_accounts" AS credit
      ON credit."id" = entry."credit_account_id"
     AND credit."tenant_id" = entry."tenant_id"
    WHERE debit."id" IS NULL
       OR credit."id" IS NULL
       OR debit."company_id" <> credit."company_id"
       OR entry."amount" <= 0
       OR entry."debit_account_id" = entry."credit_account_id"
  ) THEN
    RAISE EXCEPTION 'Cannot migrate legacy financial_entries: invalid account references or non-positive amount';
  END IF;
END $$;

ALTER TABLE "chart_of_accounts"
  ALTER COLUMN "company_id" SET NOT NULL;

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('draft', 'posted', 'voided');

-- CreateEnum
CREATE TYPE "JournalDirection" AS ENUM ('debit', 'credit');

-- DropIndex
DROP INDEX "chart_of_accounts_tenant_id_code_key";

-- AlterTable
-- company_id and parent_id were added and backfilled in the preflight above.

-- CreateTable
CREATE TABLE "journal_headers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "period_id" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'draft',
    "memo" TEXT NOT NULL DEFAULT '',
    "source_module" TEXT NOT NULL,
    "source_ref_id" TEXT,
    "reversal_of_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_headers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "direction" "JournalDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "partner_id" TEXT,
    "project_id" TEXT,
    "cost_center_id" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_headers_tenant_id_company_id_entry_date_idx" ON "journal_headers"("tenant_id", "company_id", "entry_date");

-- CreateIndex
CREATE INDEX "journal_headers_tenant_id_company_id_status_idx" ON "journal_headers"("tenant_id", "company_id", "status");

-- CreateIndex
CREATE INDEX "journal_headers_company_id_source_module_source_ref_id_idx" ON "journal_headers"("company_id", "source_module", "source_ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_headers_company_id_number_key" ON "journal_headers"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_headers_tenant_id_company_id_id_key" ON "journal_headers"("tenant_id", "company_id", "id");

-- CreateIndex
CREATE INDEX "journal_lines_tenant_id_company_id_account_id_idx" ON "journal_lines"("tenant_id", "company_id", "account_id");

-- CreateIndex
CREATE INDEX "journal_lines_tenant_id_company_id_partner_id_idx" ON "journal_lines"("tenant_id", "company_id", "partner_id");

-- CreateIndex
CREATE INDEX "journal_lines_tenant_id_company_id_project_id_idx" ON "journal_lines"("tenant_id", "company_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_lines_journal_id_line_no_key" ON "journal_lines"("journal_id", "line_no");

-- CreateIndex
CREATE INDEX "chart_of_accounts_tenant_id_company_id_parent_id_idx" ON "chart_of_accounts"("tenant_id", "company_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_company_id_code_key" ON "chart_of_accounts"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_tenant_id_company_id_id_key" ON "chart_of_accounts"("tenant_id", "company_id", "id");

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_company_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "parent_id") REFERENCES "chart_of_accounts"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_headers" ADD CONSTRAINT "journal_headers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_headers" ADD CONSTRAINT "journal_headers_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_headers" ADD CONSTRAINT "journal_headers_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_headers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenant_id_company_id_journal_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "journal_id") REFERENCES "journal_headers"("tenant_id", "company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenant_id_company_id_account_id_fkey" FOREIGN KEY ("tenant_id", "company_id", "account_id") REFERENCES "chart_of_accounts"("tenant_id", "company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Convert each legacy one-debit/one-credit record into a posted two-line journal.
WITH numbered_entries AS (
  SELECT
    entry.*,
    debit."company_id",
    'legacy-' || entry."id" AS "journal_id",
    'LEGACY-' || lpad(row_number() OVER (
      PARTITION BY debit."company_id"
      ORDER BY entry."entry_date", entry."created_at", entry."id"
    )::text, 8, '0') AS "journal_number"
  FROM "financial_entries" AS entry
  JOIN "chart_of_accounts" AS debit
    ON debit."id" = entry."debit_account_id"
   AND debit."tenant_id" = entry."tenant_id"
  JOIN "chart_of_accounts" AS credit
    ON credit."id" = entry."credit_account_id"
   AND credit."tenant_id" = entry."tenant_id"
   AND credit."company_id" = debit."company_id"
)
INSERT INTO "journal_headers" (
  "id", "tenant_id", "company_id", "number", "entry_date", "status",
  "memo", "source_module", "source_ref_id", "posted_at", "created_at"
)
SELECT
  "journal_id", "tenant_id", "company_id", "journal_number", "entry_date",
  'posted', 'Migrated from FinancialEntry ' || "id", "source_module",
  'legacy:' || "id", "created_at", "created_at"
FROM numbered_entries;

INSERT INTO "journal_lines" (
  "id", "tenant_id", "company_id", "journal_id", "account_id", "line_no",
  "direction", "amount", "memo"
)
SELECT
  gen_random_uuid()::text, entry."tenant_id", debit."company_id",
  'legacy-' || entry."id", debit."id", 1, 'debit'::"JournalDirection", entry."amount",
  'Migrated debit line'
FROM "financial_entries" AS entry
JOIN "chart_of_accounts" AS debit
  ON debit."id" = entry."debit_account_id"
 AND debit."tenant_id" = entry."tenant_id"
UNION ALL
SELECT
  gen_random_uuid()::text, entry."tenant_id", credit."company_id",
  'legacy-' || entry."id", credit."id", 2, 'credit'::"JournalDirection", entry."amount",
  'Migrated credit line'
FROM "financial_entries" AS entry
JOIN "chart_of_accounts" AS credit
  ON credit."id" = entry."credit_account_id"
 AND credit."tenant_id" = entry."tenant_id";

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_amount_positive" CHECK ("amount" > 0);

COMMIT;
