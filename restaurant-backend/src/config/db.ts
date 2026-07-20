import { Pool } from 'pg';

const defaultDatabaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_db';

// Local databases (localhost) usually don't support SSL, while managed cloud
// databases (Neon, Supabase, RDS, ...) require it. Enable SSL automatically for
// remote hosts, and allow an explicit override via DATABASE_SSL=true|false.
function shouldUseSsl(url: string): boolean {
  const override = process.env.DATABASE_SSL?.toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;
  if (/sslmode=require/i.test(url)) return true;
  try {
    const host = new URL(url).hostname;
    return !['localhost', '127.0.0.1', '::1', ''].includes(host);
  } catch {
    return false;
  }
}

export const pool = new Pool({
  connectionString: defaultDatabaseUrl,
  ssl: shouldUseSsl(defaultDatabaseUrl) ? { rejectUnauthorized: false } : false,
  max: 10,
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