-- Blumi uses its own server-side session/auth boundary and does not use the
-- Supabase Data API. Keep the public schema inaccessible to API roles.
--
-- The application connects as the database owner, so these revokes do not
-- affect the server. RLS is intentionally not enabled here: Blumi does not
-- use Supabase Auth JWT claims (auth.uid()) for authorization.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Keep future objects created by the migration owner private as well.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
