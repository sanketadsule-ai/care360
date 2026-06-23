const { getPool, ensureTables } = require('./_db');
const { verifyAdmin } = require('./_auth-helper');

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
      // List all non-admin users (pending and approved)
      const usersRes = await pool.query(`
        SELECT id, email, name, initials, avatar_url, role, status, created_at
        FROM users 
        WHERE role != 'admin'
        ORDER BY created_at DESC
      `);
      return res.status(200).json({ success: true, users: usersRes.rows });
    }

    if (req.method === 'POST') {
      const { userId, action } = req.body;
      if (!userId || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid userId or action' });
      }

      if (action === 'approve') {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['approved', userId]);
      } else if (action === 'reject') {
        // We can either set status to rejected or just delete them. We will set status to rejected.
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['rejected', userId]);
      }

      return res.status(200).json({ success: true, message: `User ${action}d successfully` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
