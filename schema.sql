-- Wedding Tool · Initial Postgres Schema
-- This is the source of truth for the data model. Translate to schema.prisma when scaffolding.
-- All money stored as integer cents. All timestamps in UTC.

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE vendor_status AS ENUM (
  'researching', 'contacted', 'estimate_received', 'comparing',
  'negotiating', 'contract_sent', 'contracted', 'in_progress',
  'delivered', 'declined', 'archived'
);

CREATE TYPE vendor_category AS ENUM (
  'venue', 'catering', 'photography', 'videography', 'dj_band',
  'florist', 'rentals', 'hair_makeup', 'attire', 'transportation',
  'stationery', 'officiant', 'priest', 'planner', 'accommodation',
  'other'
);

CREATE TYPE contract_status AS ENUM (
  'draft', 'sent_for_signature', 'signed', 'completed', 'cancelled', 'disputed'
);

CREATE TYPE payment_method AS ENUM (
  'credit_card', 'check', 'wire', 'cash', 'venmo', 'zelle', 'other'
);

CREATE TYPE task_status AS ENUM (
  'not_started', 'in_progress', 'blocked', 'complete', 'cancelled'
);

CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE email_intent AS ENUM (
  'estimate', 'invoice', 'receipt', 'contract', 'scheduling',
  'informational', 'unknown'
);

CREATE TYPE email_review_status AS ENUM (
  'pending_review', 'processed', 'ignored', 'snoozed'
);

CREATE TYPE payer_type AS ENUM ('couple', 'parent', 'family', 'individual', 'sponsored', 'other');

-- ============================================================
-- REFERENCE TABLES
-- ============================================================

CREATE TABLE payers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  type              payer_type NOT NULL,
  display_color     TEXT NOT NULL,           -- hex color, matches design tokens
  total_committed   BIGINT,                  -- cents; null = no cap agreed
  notes             TEXT,
  display_order     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-seed:
INSERT INTO payers (name, type, display_color, display_order) VALUES
  ('Atharva''s parents', 'parent',   '#C9913A', 1),  -- gold
  ('Celesia''s mom',     'parent',   '#B8451E', 2),  -- terracotta
  ('Us · Atharva & Celesia', 'couple', '#3A6256', 3); -- teal


CREATE TABLE events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  date                     DATE NOT NULL,
  start_time               TIME,
  end_time                 TIME,
  venue                    TEXT,
  description              TEXT,
  estimated_guest_count    INTEGER,
  display_color            TEXT NOT NULL,
  display_order            INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-seed:
INSERT INTO events (name, date, venue, display_color, display_order) VALUES
  ('Friday Sangeet',         '2027-12-10', 'Camp Lucy · Sacred Oaks', '#C9913A', 1),
  ('Saturday Vedic Ceremony','2027-12-11', 'Camp Lucy',               '#B8451E', 2),
  ('Saturday Vedic Lunch',   '2027-12-11', 'Camp Lucy',               '#9A3F23', 3),
  ('Saturday Western Ceremony','2027-12-11', 'Camp Lucy',             '#F1E9D7', 4),
  ('Saturday Reception',     '2027-12-11', 'Camp Lucy',               '#3A6256', 5),
  ('Sunday Brunch',          '2027-12-12', 'Camp Lucy',               '#C9913A', 6);


CREATE TABLE budget_categories (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  baseline_amount   BIGINT NOT NULL,    -- cents, the locked baseline
  planned_amount    BIGINT NOT NULL,    -- cents, current working value (editable)
  default_payer_id  UUID REFERENCES payers(id),
  display_color     TEXT NOT NULL,
  display_order     INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-seed values shown in the design spec. Use seed-data.xlsx for the source.
-- Amounts in cents. Locked baseline total = $142,682 = 14268200.

-- ============================================================
-- CORE ENTITIES
-- ============================================================

CREATE TABLE vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category        vendor_category NOT NULL,
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  website         TEXT,
  status          vendor_status NOT NULL DEFAULT 'researching',
  notes           TEXT,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendors_status ON vendors(status) WHERE archived_at IS NULL;
CREATE INDEX idx_vendors_category ON vendors(category) WHERE archived_at IS NULL;


-- Vendors can serve multiple events
CREATE TABLE vendor_events (
  vendor_id   UUID REFERENCES vendors(id) ON DELETE CASCADE,
  event_id    UUID REFERENCES events(id)  ON DELETE CASCADE,
  PRIMARY KEY (vendor_id, event_id)
);


CREATE TABLE estimates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id               UUID NOT NULL REFERENCES vendors(id),
  received_date           DATE NOT NULL,
  expires_date            DATE,
  total_amount            BIGINT NOT NULL,    -- cents
  package_name            TEXT,
  included_summary        TEXT,
  excluded_summary        TEXT,
  attachment_file_path    TEXT,
  parsed_from_email_id    UUID,               -- FK added after email_items table
  status                  TEXT NOT NULL DEFAULT 'active', -- active, superseded, declined, accepted
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_estimates_vendor ON estimates(vendor_id);


CREATE TABLE contracts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id                 UUID NOT NULL REFERENCES vendors(id),
  estimate_id               UUID REFERENCES estimates(id),
  signed_date               DATE,
  total_contract_amount     BIGINT NOT NULL,    -- cents
  deliverables_summary      TEXT,
  cancellation_terms        TEXT,
  insurance_required        BOOLEAN NOT NULL DEFAULT false,
  attachment_file_path      TEXT,
  status                    contract_status NOT NULL DEFAULT 'draft',
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_vendor ON contracts(vendor_id);
CREATE INDEX idx_contracts_status ON contracts(status);


CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id       UUID REFERENCES contracts(id),   -- nullable: one-off payments allowed
  description       TEXT NOT NULL,
  amount            BIGINT NOT NULL,                  -- cents
  due_date          DATE NOT NULL,
  paid_date         DATE,
  payer_id          UUID NOT NULL REFERENCES payers(id),
  payment_method    payment_method,
  receipt_id        UUID,                             -- FK added after receipts table
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_due_date ON payments(due_date) WHERE paid_date IS NULL;
CREATE INDEX idx_payments_contract ON payments(contract_id);
CREATE INDEX idx_payments_payer ON payments(payer_id);


CREATE TABLE tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT,                            -- free-text with autocomplete
  event_id            UUID REFERENCES events(id),      -- nullable: "all weekend" tasks
  owner               TEXT,                            -- free-text: "Celesia, Atharva"
  status              task_status NOT NULL DEFAULT 'not_started',
  priority            task_priority NOT NULL DEFAULT 'medium',
  due_date            DATE,
  timeframe_label     TEXT,                            -- e.g. "24-22 months out"
  linked_vendor_id    UUID REFERENCES vendors(id),
  source              TEXT NOT NULL DEFAULT 'template',  -- template, manual, vendor_elevated, email_extracted
  notes               TEXT,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE status NOT IN ('complete', 'cancelled');
CREATE INDEX idx_tasks_event ON tasks(event_id);


CREATE TABLE task_dependencies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upstream_task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  downstream_task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type       TEXT NOT NULL DEFAULT 'hard_blocks',  -- hard_blocks, soft_blocks, informational
  notes                 TEXT,
  source                TEXT NOT NULL DEFAULT 'manual',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT no_self_dependency CHECK (upstream_task_id != downstream_task_id),
  UNIQUE (upstream_task_id, downstream_task_id)
);

CREATE INDEX idx_deps_upstream ON task_dependencies(upstream_task_id);
CREATE INDEX idx_deps_downstream ON task_dependencies(downstream_task_id);


CREATE TABLE email_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id        TEXT NOT NULL UNIQUE,
  thread_id               TEXT,
  from_address            TEXT NOT NULL,
  from_name               TEXT,
  subject                 TEXT,
  received_at             TIMESTAMPTZ NOT NULL,
  body_snippet            TEXT,
  attachments_json        JSONB,                       -- [{filename, mime, file_path}, ...]
  parsed_intent           email_intent NOT NULL DEFAULT 'unknown',
  parsed_amount           BIGINT,                      -- cents, null if no amount found
  parsed_vendor_guess     TEXT,
  suggested_vendor_id     UUID REFERENCES vendors(id),
  suggested_payment_id    UUID REFERENCES payments(id),
  review_status           email_review_status NOT NULL DEFAULT 'pending_review',
  processed_at            TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_status ON email_items(review_status);
CREATE INDEX idx_email_received ON email_items(received_at DESC);


CREATE TABLE receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source              TEXT NOT NULL,                   -- email, manual_upload, manual_entry
  email_item_id       UUID REFERENCES email_items(id),
  vendor_id           UUID REFERENCES vendors(id),
  amount              BIGINT NOT NULL,                 -- cents
  receipt_date        DATE NOT NULL,
  description         TEXT,
  attachment_file_path TEXT,
  matched_payment_id  UUID REFERENCES payments(id),
  match_status        TEXT NOT NULL DEFAULT 'unmatched',  -- unmatched, suggested_match, confirmed, manually_overridden, disputed
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add the forward references now
ALTER TABLE estimates ADD CONSTRAINT fk_estimates_email FOREIGN KEY (parsed_from_email_id) REFERENCES email_items(id);
ALTER TABLE payments  ADD CONSTRAINT fk_payments_receipt FOREIGN KEY (receipt_id) REFERENCES receipts(id);


-- ============================================================
-- AUDIT
-- ============================================================

CREATE TABLE activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL,        -- 'payment', 'task', 'vendor', etc.
  entity_id       UUID NOT NULL,
  action          TEXT NOT NULL,        -- 'created', 'updated', 'deleted', 'payment_marked_paid', etc.
  changed_by      TEXT NOT NULL,        -- email of the user
  diff_json       JSONB,                -- {before: {...}, after: {...}}
  diff_summary    TEXT,                 -- human-readable summary
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_recent ON activity_log(created_at DESC);


-- ============================================================
-- AUTH (lightweight magic-link allowlist)
-- ============================================================

CREATE TABLE allowed_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'editor',  -- editor, viewer
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE magic_link_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tokens_hash ON magic_link_tokens(token_hash);


-- ============================================================
-- NOTES FOR CLAUDE CODE
-- ============================================================
-- 1. Translate this into schema.prisma. Keep names identical.
-- 2. Generate a seed script (scripts/seed.ts) that:
--    - Inserts the 3 payers (above)
--    - Inserts the 6 events (above)
--    - Reads seed-data.xlsx and creates budget_categories from the High-level budget sheet
--    - Reads seed-data.xlsx and creates tasks from the Master checklist sheet
-- 3. Use cents internally, always. Format as dollars at the UI boundary.
-- 4. Don't add a Receipt FK back to email_items.parsed_from_email_id -- the chain is
--    email_items -> estimates/payments -> receipts, and receipts already have email_item_id.
