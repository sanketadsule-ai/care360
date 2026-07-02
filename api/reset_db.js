const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const { ensureTables, closePool } = require('./_lib/db');

async function run() {
  let connString = process.env.DATABASE_URL || '';
  if (connString.includes('?')) connString = connString.split('?')[0];

  const pool = new Pool({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Dropping ALL public tables to reset the database...");
    
    // Drop all tables in the public schema
    await pool.query(`
      DO $$ DECLARE
          r RECORD;
      BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
              EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
      END $$;
    `);
    
    console.log("Reinitializing database with the new unified omnichannel schema...");
    await ensureTables();

    console.log("Database reset complete. You can now run the scrapers to populate data.");
  } catch(e) {
    console.error("Error resetting DB:", e);
  } finally {
    await closePool();
    await pool.end();
  }
}

run();
