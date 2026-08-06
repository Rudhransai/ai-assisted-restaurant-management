import { Pool } from 'pg';

const defaultDatabaseUrl =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_db';

/**
 * SSL policy.
 *
 * The previous version enabled SSL whenever DATABASE_URL was set, which broke local
 * Postgres (local servers usually have SSL off) and disabled certificate verification
 * on hosted databases, leaving the connection open to interception.
 *
 * Now: SSL is used for remote hosts only, and certificates are verified unless the
 * operator explicitly opts out with DATABASE_SSL_REJECT_UNAUTHORIZED=false — which some
 * providers (Neon, Heroku, Supabase pooler) genuinely require.
 */
function resolveSsl(): false | { rejectUnauthorized: boolean } {
  if (process.env.DATABASE_SSL === 'false') return false;

  let isLocal = false;
  try {
    const host = new URL(defaultDatabaseUrl).hostname;
    isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    isLocal = false;
  }

  if (isLocal && process.env.DATABASE_SSL !== 'true') return false;

  return {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

export const pool = new Pool({
  connectionString: defaultDatabaseUrl,
  ssl: resolveSsl(),
  max: 10,
});

// A pool error with no listener crashes the process on an idle-client disconnect.
pool.on('error', (error) => {
  console.error('[DB] Unexpected error on idle client', error);
});

export async function verifyDatabaseConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

export async function closeDatabaseConnection() {
  await pool.end();
}
