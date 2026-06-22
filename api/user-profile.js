// Vercel Serverless Function: /api/user-profile
const { getPool, ensureTables } = require('./_lib/db');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { verifyAuth } = require('./_lib/auth-helper');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Require authentication
  const authUser = verifyAuth(req, res);
  if (!authUser) return; // response already sent

  try {
    await ensureTables();
    const pool = getPool();

    if (req.method === 'GET') {
      // 2. Fetch the user profile from token ID
      const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const user = userRes.rows[0];

      // 3. Calculate unread counts
      // Count direct notifications
      const notifRes = await pool.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false', [user.id]);
      const unreadNotifs = parseInt(notifRes.rows[0].count, 10) || 0;

      // Count open facebook messages
      let fbUnread = 0;
      try {
        const fbRes = await pool.query('SELECT COUNT(*) as count FROM facebook_messages WHERE status = $1', ['open']);
        fbUnread = parseInt(fbRes.rows[0].count, 10) || 0;
      } catch(e) { /* ignore if table missing or error */ }

      // Count open email messages
      let emailUnread = 0;
      try {
        const emailRes = await pool.query('SELECT COUNT(*) as count FROM email_messages WHERE status = $1', ['open']);
        emailUnread = parseInt(emailRes.rows[0].count, 10) || 0;
      } catch(e) { /* ignore if table missing or error */ }

      const totalUnread = unreadNotifs + fbUnread + emailUnread;

      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          initials: user.initials,
          avatar_url: user.avatar_url,
          notification_count: totalUnread
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('user-profile error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
