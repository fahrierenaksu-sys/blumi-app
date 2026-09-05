ALTER TABLE blumi_economy_inventories
  ADD COLUMN IF NOT EXISTS coin_debt INTEGER NOT NULL DEFAULT 0
  CHECK (coin_debt >= 0);

CREATE TABLE IF NOT EXISTS blumi_store_transactions (
  provider TEXT NOT NULL CHECK (provider IN ('revenuecat')),
  provider_transaction_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  store TEXT NOT NULL CHECK (store IN ('ios', 'android')),
  payload_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (provider, provider_transaction_id)
);

CREATE INDEX IF NOT EXISTS blumi_store_transactions_user_created_idx
  ON blumi_store_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blumi_store_events (
  provider TEXT NOT NULL CHECK (provider IN ('revenuecat')),
  provider_event_id TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('credit', 'reversal')),
  payload_hash CHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (provider, provider_event_id),
  FOREIGN KEY (provider, provider_transaction_id)
    REFERENCES blumi_store_transactions(provider, provider_transaction_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS blumi_store_events_transaction_idx
  ON blumi_store_events(provider, provider_transaction_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS blumi_economy_iap_ledger (
  provider TEXT NOT NULL CHECK (provider IN ('revenuecat')),
  provider_transaction_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('credit', 'reversal')),
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins > 0),
  provider_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (provider, provider_transaction_id, entry_type),
  FOREIGN KEY (provider, provider_event_id)
    REFERENCES blumi_store_events(provider, provider_event_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS blumi_economy_iap_ledger_user_created_idx
  ON blumi_economy_iap_ledger(user_id, created_at DESC);
