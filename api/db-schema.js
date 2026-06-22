// Temporary diagnostic endpoint to inspect the live database schema
const { getPool, ensureTables } = require('./db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTables();
    const pool = getPool();

    // Get exact schema of users table
    const schema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);

    // Get existing rows count
    const count = await pool.query('SELECT COUNT(*) as cnt FROM users');

    // Get sample row if any
    let sample = null;
    try {
      const sampleRes = await pool.query('SELECT * FROM users LIMIT 1');
      if (sampleRes.rows.length > 0) sample = sampleRes.rows[0];
    } catch(e) {}

    return res.status(200).json({
      columns: schema.rows,
      row_count: count.rows[0].cnt,
      sample_row: sample
    });
  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
};
