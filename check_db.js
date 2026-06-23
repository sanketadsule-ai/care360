require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query('SELECT * FROM facebook_messages');
    console.log(`Found ${res.rows.length} messages in DB.`);
    res.rows.forEach(r => console.log(r));
    
    const res2 = await pool.query('SELECT * FROM connected_channels WHERE platform=\'facebook\'');
    console.log(`\nFound ${res2.rows.length} facebook channels in DB.`);
    res2.rows.forEach(r => {
      console.log(`Channel ${r.id}: ${r.account_name} (${r.account_email}) token=${r.access_token ? 'exists' : 'missing'}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
