-- bank_statements.matched_entry_id menunjuk tabel legacy financial_entries (tidak lagi ditulis siapa pun sejak GL v2).
-- Diganti tautan ke jurnal GL; UNIQUE menjamin satu jurnal hanya direkonsiliasi sekali.
-- DropForeignKey
ALTER TABLE "bank_statements" DROP CONSTRAINT "bank_statements_matched_entry_id_fkey";

-- AlterTable
ALTER TABLE "bank_statements" DROP COLUMN "matched_entry_id",
ADD COLUMN     "matched_journal_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bank_statements_matched_journal_id_key" ON "bank_statements"("matched_journal_id");

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_matched_journal_id_fkey" FOREIGN KEY ("matched_journal_id") REFERENCES "journal_headers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

