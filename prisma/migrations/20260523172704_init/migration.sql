-- CreateEnum
CREATE TYPE "vendor_status" AS ENUM ('researching', 'contacted', 'estimate_received', 'comparing', 'negotiating', 'contract_sent', 'contracted', 'in_progress', 'delivered', 'declined', 'archived');

-- CreateEnum
CREATE TYPE "vendor_category" AS ENUM ('venue', 'catering', 'photography', 'videography', 'dj_band', 'florist', 'rentals', 'hair_makeup', 'attire', 'transportation', 'stationery', 'officiant', 'priest', 'planner', 'accommodation', 'other');

-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('draft', 'sent_for_signature', 'signed', 'completed', 'cancelled', 'disputed');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('credit_card', 'check', 'wire', 'cash', 'venmo', 'zelle', 'other');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('not_started', 'in_progress', 'blocked', 'complete', 'cancelled');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "email_intent" AS ENUM ('estimate', 'invoice', 'receipt', 'contract', 'scheduling', 'informational', 'unknown');

-- CreateEnum
CREATE TYPE "email_review_status" AS ENUM ('pending_review', 'processed', 'ignored', 'snoozed');

-- CreateEnum
CREATE TYPE "payer_type" AS ENUM ('couple', 'parent', 'family', 'individual', 'sponsored', 'other');

-- CreateTable
CREATE TABLE "payers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "payer_type" NOT NULL,
    "display_color" TEXT NOT NULL,
    "total_committed" BIGINT,
    "notes" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIME(6),
    "end_time" TIME(6),
    "venue" TEXT,
    "description" TEXT,
    "estimated_guest_count" INTEGER,
    "display_color" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "baseline_amount" BIGINT NOT NULL,
    "planned_amount" BIGINT NOT NULL,
    "default_payer_id" UUID,
    "display_color" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "vendor_category" NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "website" TEXT,
    "status" "vendor_status" NOT NULL DEFAULT 'researching',
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_events" (
    "vendor_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,

    CONSTRAINT "vendor_events_pkey" PRIMARY KEY ("vendor_id","event_id")
);

-- CreateTable
CREATE TABLE "estimates" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "received_date" DATE NOT NULL,
    "expires_date" DATE,
    "total_amount" BIGINT NOT NULL,
    "package_name" TEXT,
    "included_summary" TEXT,
    "excluded_summary" TEXT,
    "attachment_file_path" TEXT,
    "parsed_from_email_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "estimate_id" UUID,
    "signed_date" DATE,
    "total_contract_amount" BIGINT NOT NULL,
    "deliverables_summary" TEXT,
    "cancellation_terms" TEXT,
    "insurance_required" BOOLEAN NOT NULL DEFAULT false,
    "attachment_file_path" TEXT,
    "status" "contract_status" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "contract_id" UUID,
    "description" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "due_date" DATE NOT NULL,
    "paid_date" DATE,
    "payer_id" UUID NOT NULL,
    "payment_method" "payment_method",
    "receipt_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "event_id" UUID,
    "owner" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'not_started',
    "priority" "task_priority" NOT NULL DEFAULT 'medium',
    "due_date" DATE,
    "timeframe_label" TEXT,
    "linked_vendor_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'template',
    "notes" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" UUID NOT NULL,
    "upstream_task_id" UUID NOT NULL,
    "downstream_task_id" UUID NOT NULL,
    "dependency_type" TEXT NOT NULL DEFAULT 'hard_blocks',
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_items" (
    "id" UUID NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "from_address" TEXT NOT NULL,
    "from_name" TEXT,
    "subject" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "body_snippet" TEXT,
    "attachments_json" JSONB,
    "parsed_intent" "email_intent" NOT NULL DEFAULT 'unknown',
    "parsed_amount" BIGINT,
    "parsed_vendor_guess" TEXT,
    "suggested_vendor_id" UUID,
    "suggested_payment_id" UUID,
    "review_status" "email_review_status" NOT NULL DEFAULT 'pending_review',
    "processed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "email_item_id" UUID,
    "vendor_id" UUID,
    "amount" BIGINT NOT NULL,
    "receipt_date" DATE NOT NULL,
    "description" TEXT,
    "attachment_file_path" TEXT,
    "matched_payment_id" UUID,
    "match_status" TEXT NOT NULL DEFAULT 'unmatched',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "diff_json" JSONB,
    "diff_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowed_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowed_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_link_tokens" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_name_key" ON "budget_categories"("name");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- CreateIndex
CREATE INDEX "vendors_category_idx" ON "vendors"("category");

-- CreateIndex
CREATE INDEX "estimates_vendor_id_idx" ON "estimates"("vendor_id");

-- CreateIndex
CREATE INDEX "contracts_vendor_id_idx" ON "contracts"("vendor_id");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "payments_due_date_idx" ON "payments"("due_date");

-- CreateIndex
CREATE INDEX "payments_contract_id_idx" ON "payments"("contract_id");

-- CreateIndex
CREATE INDEX "payments_payer_id_idx" ON "payments"("payer_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE INDEX "tasks_event_id_idx" ON "tasks"("event_id");

-- CreateIndex
CREATE INDEX "task_dependencies_upstream_task_id_idx" ON "task_dependencies"("upstream_task_id");

-- CreateIndex
CREATE INDEX "task_dependencies_downstream_task_id_idx" ON "task_dependencies"("downstream_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_upstream_task_id_downstream_task_id_key" ON "task_dependencies"("upstream_task_id", "downstream_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_items_gmail_message_id_key" ON "email_items"("gmail_message_id");

-- CreateIndex
CREATE INDEX "email_items_review_status_idx" ON "email_items"("review_status");

-- CreateIndex
CREATE INDEX "email_items_received_at_idx" ON "email_items"("received_at" DESC);

-- CreateIndex
CREATE INDEX "activity_log_entity_type_entity_id_idx" ON "activity_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activity_log_created_at_idx" ON "activity_log"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "allowed_users_email_key" ON "allowed_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "magic_link_tokens_token_hash_key" ON "magic_link_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "magic_link_tokens_token_hash_idx" ON "magic_link_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_default_payer_id_fkey" FOREIGN KEY ("default_payer_id") REFERENCES "payers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_events" ADD CONSTRAINT "vendor_events_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_events" ADD CONSTRAINT "vendor_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_parsed_from_email_id_fkey" FOREIGN KEY ("parsed_from_email_id") REFERENCES "email_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "payers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_linked_vendor_id_fkey" FOREIGN KEY ("linked_vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_upstream_task_id_fkey" FOREIGN KEY ("upstream_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_downstream_task_id_fkey" FOREIGN KEY ("downstream_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_items" ADD CONSTRAINT "email_items_suggested_vendor_id_fkey" FOREIGN KEY ("suggested_vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_items" ADD CONSTRAINT "email_items_suggested_payment_id_fkey" FOREIGN KEY ("suggested_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_email_item_id_fkey" FOREIGN KEY ("email_item_id") REFERENCES "email_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_matched_payment_id_fkey" FOREIGN KEY ("matched_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
