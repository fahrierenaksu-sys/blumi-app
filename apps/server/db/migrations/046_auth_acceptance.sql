-- Nullable by design: historical acceptance must never be fabricated.
ALTER TABLE blumi_accounts ADD COLUMN IF NOT EXISTS accepted_terms jsonb;
ALTER TABLE blumi_accounts ADD CONSTRAINT blumi_accounts_accepted_terms_valid
CHECK (accepted_terms IS NULL OR (
  jsonb_typeof(accepted_terms) = 'object'
  AND accepted_terms ?& ARRAY['version', 'locale', 'acceptedAt']
  AND jsonb_typeof(accepted_terms->'version') = 'string'
  AND length(accepted_terms->>'version') > 0
  AND jsonb_typeof(accepted_terms->'locale') = 'string'
  AND accepted_terms->>'locale' IN ('en', 'tr')
  AND jsonb_typeof(accepted_terms->'acceptedAt') = 'string'
  AND accepted_terms->>'acceptedAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
));
