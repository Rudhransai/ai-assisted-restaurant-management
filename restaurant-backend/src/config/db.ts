import { Pool } from 'pg';

const defaultDatabaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_db';

export const pool = new Pool({
  connectionString: defaultDatabaseUrl,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
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