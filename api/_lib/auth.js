const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getPool, ensureTables } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'carapal360-dev-secret';

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureTables();
    const { action, email, password, name } = req.body;
    
    if (!action || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pool = getPool();
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = userRes.rows[0];

    if (action === 'register') {
      if (user) {
        // If user exists, update password if it's missing (for existing google users)
        if (!user.password_hash) {
            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = hashPassword(password, salt);
            const updateRes = await pool.query('UPDATE users SET password_hash = $1, salt = $2, name = $3 WHERE id = $4 RETURNING *', [passwordHash, salt, name || user.name, user.id]);
            user = updateRes.rows[0];
        } else {
            return res.status(400).json({ error: 'User already exists' });
        }
      } else {
        if (!name) {
          return res.status(400).json({ error: 'Name is required for registration' });
        }

        // Generate salt and hash
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password, salt);

        const isFirstAdmin = (email === 'sanket.adsule@impactguru.com');
        const role = isFirstAdmin ? 'admin' : 'user';
        const status = isFirstAdmin ? 'approved' : 'pending';

        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const nextId = Date.now().toString() + Math.floor(Math.random() * 10000).toString();

        const insertRes = await pool.query(
          `INSERT INTO users (id, email, name, initials, avatar_url, role, status, password_hash, salt, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
          [nextId, email, name, initials, '', role, status, passwordHash, salt]
        );
        user = insertRes.rows[0];
      }
    } else if (action === 'login') {
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      
      // If user exists but has no password (e.g., from old Google login), they can't login via password yet
      if (!user.salt || !user.password_hash) {
        return res.status(401).json({ error: 'Account not set up for password login. Please register again with the same email.' });
      }

      const hash = hashPassword(password, user.salt);
      if (hash !== user.password_hash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid action' });
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
