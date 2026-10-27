-- Prisma's node-postgres adapter writes DateTime values as zone-less UTC strings and
-- reads timestamptz values as UTC. Sessions must therefore run in UTC, or timestamps
-- written by the application disagree with now() in SQL (outbox scheduling, retention
-- cutoffs, rate-limit windows). Neon defaults to UTC; this makes it explicit for every
-- database the migrations are applied to. Takes effect for new connections.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;
