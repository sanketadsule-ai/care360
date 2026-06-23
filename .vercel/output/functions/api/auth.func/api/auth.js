const jwt = require('jsonwebtoken');
const { getPool, ensureTables } = require('./_db');

const JWT_SECRET = process.env.JWT_SECRET || 'carapal360-dev-secret';

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    // Temporary: GET returns the live schema for debugging
    if (req.method === 'GET') {
      try {
        await ensureTables();
        const pool = getPool();
        const schema = await pool.query(`
          SELECT column_name, data_type, is_nullable, column_default 
          FROM information_schema.columns 
          WHERE table_name = 'users' 
          ORDER BY ordinal_position
        `);
        const count = await pool.query('SELECT COUNT(*) as cnt FROM users');
        let sample = null;
        try { const s = await pool.query('SELECT * FROM users LIMIT 1'); sample = s.rows[0]; } catch(e) {}
        return res.status(200).json({ columns: schema.rows, row_count: count.rows[0].cnt, sample_row: sample });
      } catch(e) {
        return res.status(500).json({ error: e.message });
      }
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureTables();
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential' });

    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const googleData = await googleRes.json();
    
    if (googleData.error) {
       return res.status(401).json({ error: 'Invalid Google token' });
    }

    const { email, name, picture } = googleData;
    const pool = getPool();

    // Check if user exists
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = userRes.rows[0];

    if (!user) {
       // Create new user
       // Hardcoded first admin logic
       const isFirstAdmin = (email === 'admin@carapal360.com');
       const role = isFirstAdmin ? 'admin' : 'user';
       const status = isFirstAdmin ? 'approved' : 'pending';
       
       let initials = 'U';
       if (name) {
           initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
       }

       // The user's live database has 'id' configured as a TEXT/VARCHAR column.
       // Generate a unique string ID to avoid type mismatches.
       const nextId = Date.now().toString() + Math.floor(Math.random() * 10000).toString();

       const insertRes = await pool.query(
         `INSERT INTO users (id, email, name, initials, avatar_url, role, status, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
         [nextId, email, name || email, initials, picture || '', role, status]
       );
       user = insertRes.rows[0];
    }

    // Only approved users get a token
    if (user.status !== 'approved') {
       return res.status(403).json({ 
         error: 'Pending admin approval', 
         user: { name: user.name, email: user.email, status: user.status } 
       });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, status: user.status }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    return res.status(200).json({ success: true, token, user });

  } catch (err) {
     console.error('Auth error:', err);
     return res.status(500).json({ error: 'Internal server error', details: err.message, stack: err.stack });
  }
};
