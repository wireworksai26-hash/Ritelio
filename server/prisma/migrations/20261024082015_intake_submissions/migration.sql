-- CreateTable
CREATE TABLE "intake_submissions" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'google_form',
    "external_id" TEXT NOT NULL,
    "form_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "business_type" TEXT,
    "employee_range" TEXT,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT NOT NULL DEFAULT '',
    "analysis_status" TEXT NOT NULL DEFAULT 'pending',
    "analysis" JSONB,
    "analysis_model" TEXT,
    "analysis_error" TEXT,
    "analyzed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intake_submissions_external_id_key" ON "intake_submissions"("external_id");

-- CreateIndex
CREATE INDEX "intake_submissions_status_created_at_idx" ON "intake_submissions"("status", "created_at");

-- CreateIndex
CREATE INDEX "intake_submissions_created_at_idx" ON "intake_submissions"("created_at");
