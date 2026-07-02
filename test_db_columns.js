require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log("Connecting to Database...");
    
    // Call database migrations first to make sure they run
    const { ensureTables } = require('./api/_lib/db');
    console.log("Running ensureTables...");
    await ensureTables();
    console.log("Tables ensured!");

    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'google_reviews'
    `);
    console.log('google_reviews columns:');
    res.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));

    const resChannels = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'connected_channels'
    `);
    console.log('connected_channels columns:');
    resChannels.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));

  } catch (e) {
    console.error("Database query failed:", e);
  } finally {
    pool.end();
  }
}
run();
