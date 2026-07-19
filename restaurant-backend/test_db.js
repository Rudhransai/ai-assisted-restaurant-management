import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_db';
console.log('Testing connection to:', url);

const pool = new Pool({ connectionString: url });

async function run() {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL!');
    const res = await client.query('SELECT version()');
    console.log('Version:', res.rows[0]);
    client.release();
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await pool.end();
  }
}

run();
