-- CreateTable
CREATE TABLE "onboarding_submissions" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "form_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "tenant_id" TEXT,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_submissions_external_id_key" ON "onboarding_submissions"("external_id");

-- CreateIndex
CREATE INDEX "onboarding_submissions_status_created_at_idx" ON "onboarding_submissions"("status", "created_at");

-- CreateIndex
CREATE INDEX "onboarding_submissions_created_at_idx" ON "onboarding_submissions"("created_at");
