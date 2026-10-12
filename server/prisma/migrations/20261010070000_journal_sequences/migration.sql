-- CreateTable
CREATE TABLE "journal_sequences" (
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "journal_sequences_pkey" PRIMARY KEY ("tenant_id","company_id","period_key")
);

-- AddForeignKey
ALTER TABLE "journal_sequences" ADD CONSTRAINT "journal_sequences_tenant_id_company_id_fkey" FOREIGN KEY ("tenant_id", "company_id") REFERENCES "companies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
