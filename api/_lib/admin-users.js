const crypto = require('crypto');
const { getPool, ensureTables, hashPassword } = require('./db');
const { verifyAdmin } = require('./auth-helper');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Require Admin access
  const adminUser = verifyAdmin(req, res);
  if (!adminUser) return; // response already sent

  try {
    await ensureTables();
    const pool = getPool();

    if (req.method === 'GET') {
      // List all users (admins included) for the dashboard. Pending requests
      // are filtered client-side from the same payload.
      const usersRes = await pool.query(`
        SELECT id, email, name, initials, avatar_url, role, status,
               provider, created_at, last_login
        FROM users
        ORDER BY
          CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
          created_at DESC
      `);
      return res.status(200).json({ success: true, users: usersRes.rows });
    }

    if (req.method === 'POST') {
      const { userId, action, email, password, name } = req.body || {};

      // ── Manual user creation by an Admin ────────────────────────────
      if (action === 'create') {
        if (!email || !password || !name) {
          return res.status(400).json({ error: 'Name, email and password are required' });
        }
        const normEmail = String(email).toLowerCase().trim();
        const dup = await pool.query('SELECT id FROM users WHERE email = $1', [normEmail]);
        if (dup.rows.length > 0) {
          return res.status(409).json({ error: 'A user with this email already exists' });
        }

        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password, salt);
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        const insertRes = await pool.query(
          `INSERT INTO users (email, name, initials, avatar_url, role, status, provider, password_hash, salt, updated_at)
             VALUES ($1, $2, $3, '', 'user', 'approved', 'email', $4, $5, NOW())
           RETURNING id, email, name, role, status`,
          [normEmail, name, initials, passwordHash, salt]
        );
        return res.status(201).json({ success: true, user: insertRes.rows[0] });
      }

      // ── Status / lifecycle actions on an existing user ──────────────
      const statusMap = {
        approve: 'approved',
        reject: 'rejected',
        enable: 'approved',
        disable: 'disabled'
      };

      if (!userId || !(action in statusMap) && !['remove', 'delete'].includes(action)) {
        return res.status(400).json({ error: 'Invalid userId or action' });
      }

      // Never let an admin act on another admin account through this endpoint.
      const targetRes = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
      const target = targetRes.rows[0];
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (target.role === 'admin') {
        return res.status(403).json({ error: 'Admin accounts cannot be modified here' });
      }

      if (action === 'remove' || action === 'delete') {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        return res.status(200).json({ success: true, message: 'User deleted successfully' });
      }

      await pool.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [statusMap[action], userId]);
      return res.status(200).json({ success: true, message: `User ${action}d successfully` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
