CREATE TABLE blumi_push_receipts (
  ticket_id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  push_token TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  lease_token TEXT,
  outcome TEXT CHECK (outcome IN ('provider_handoff', 'rejected', 'receipt_unavailable')),
  error_code TEXT
);
CREATE INDEX blumi_push_receipts_due ON blumi_push_receipts(available_at) WHERE outcome IS NULL;
