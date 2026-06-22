const jwt = require('jsonwebtoken');
const { getPool, ensureTables } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'carapal360-dev-secret';

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureTables();
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential' });

    // Verify token with Google
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

       const insertRes = await pool.query(
         `INSERT INTO users (email, name, initials, avatar_url, role, status)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
         [email, name || email, initials, picture || '', role, status]
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
