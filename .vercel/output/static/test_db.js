require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query('SELECT * FROM facebook_messages ORDER BY created_at DESC LIMIT 5');
    console.log('Facebook Messages DB:', res.rows);
    const channels = await pool.query("SELECT * FROM connected_channels WHERE platform='facebook'");
    console.log('Connected FB Channels:', channels.rows);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
